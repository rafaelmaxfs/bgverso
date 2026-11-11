using System.Collections.Concurrent;
using System.Security.Cryptography;
using System.Text.Json;
using MySqlConnector;

namespace DeliveryApp;

public class ResultadoConta
{
    public int Status { get; init; }
    public object Corpo { get; init; } = new { };
}

// Cadastro, login e sessão de clientes (tabela usuarios).
// - Senha: PBKDF2 com sal, formato "pbkdf2$iteracoes$sal$hash" em senha_hash (nunca texto puro).
// - Sessão: token aleatório devolvido ao navegador; o servidor guarda só o SHA-256 do token, em memória, com validade.
// - Proteção: após 5 tentativas erradas para um e-mail, bloqueia novas tentativas por 15 minutos.
public static class Contas
{
    private const int Iteracoes = 210_000;
    private const int TamanhoHash = 32;
    private static readonly TimeSpan ValidadeSessao = TimeSpan.FromHours(8);
    private const int MaxTentativas = 5;
    private static readonly TimeSpan Bloqueio = TimeSpan.FromMinutes(15);

    // token (SHA-256 em hex) -> dados da sessão
    private static readonly ConcurrentDictionary<string, Sessao> _sessoes = new();
    // e-mail -> tentativas falhadas e instante do bloqueio
    private static readonly ConcurrentDictionary<string, (int Falhas, DateTime? Ate)> _tentativas = new();

    private sealed record Sessao(string Email, string Nome, string Sobrenome, string Cpf, string Telefone, DateTime Expira);

    public static ResultadoConta Cadastrar(string json)
    {
        var d = Ler(json);
        var erro = ValidarCadastro(d);
        if (erro != null) return Erro(422, erro);

        var nome = d.Nome.Trim();
        var sobrenome = d.Sobrenome.Trim();
        var email = d.Email.Trim().ToLowerInvariant();
        var cpf = Digitos(d.Cpf);
        var telefone = Digitos(d.Telefone);

        using var c = Conexao.Abrir();
        using (var existe = Cmd(c, "SELECT COUNT(*) FROM usuarios WHERE email=@e OR cpf=@cpf",
                   ("@e", email), ("@cpf", cpf)))
        {
            if (Convert.ToInt32(existe.ExecuteScalar()) > 0)
                return Erro(409, "Já existe uma conta com este e-mail ou CPF.");
        }

        using (var ins = Cmd(c,
                   "INSERT INTO usuarios (nome,sobrenome,email,senha_hash,cpf,telefone,criado_em) " +
                   "VALUES (@n,@s,@e,@h,@cpf,@tel,NOW())",
                   ("@n", nome), ("@s", sobrenome), ("@e", email),
                   ("@h", GerarHash(d.Senha)), ("@cpf", cpf), ("@tel", telefone)))
        {
            ins.ExecuteNonQuery();
        }

        // Já deixa o cliente conectado após criar a conta
        var token = NovaSessao(email, nome, sobrenome, cpf, telefone);
        return new ResultadoConta
        {
            Status = 201,
            Corpo = new { token, usuario = new { nome, sobrenome, email, cpf, telefone } }
        };
    }

    private static string NovaSessao(string email, string nome, string sobrenome, string cpf, string telefone)
    {
        var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
        _sessoes[HashToken(token)] = new Sessao(email, nome, sobrenome, cpf, telefone, DateTime.UtcNow.Add(ValidadeSessao));
        LimparSessoesExpiradas();
        return token;
    }

    public static ResultadoConta Entrar(string json)
    {
        var d = Ler(json);
        if (string.IsNullOrWhiteSpace(d.Email) || string.IsNullOrEmpty(d.Senha))
            return Erro(422, "Informe e-mail e senha.");

        var email = d.Email.Trim().ToLowerInvariant();
        if (EstaBloqueado(email, out var restante))
            return Erro(429, $"Muitas tentativas. Tente novamente em {Math.Ceiling(restante.TotalMinutes)} minuto(s).");

        using var c = Conexao.Abrir();
        using var cmd = Cmd(c,
            "SELECT nome,sobrenome,email,cpf,telefone,senha_hash FROM usuarios WHERE email=@e LIMIT 1",
            ("@e", email));
        using var r = cmd.ExecuteReader();

        // Mesma mensagem e mesmo tempo para e-mail inexistente e senha errada (não revela qual dos dois)
        const string falha = "E-mail ou senha inválidos.";
        string hash = r.Read() ? r.GetString("senha_hash") : HashFalso;
        bool existe = hash != HashFalso;
        bool senhaOk = VerificarHash(d.Senha, hash) && existe;

        if (!senhaOk)
        {
            RegistrarFalha(email);
            return Erro(401, falha);
        }
        _tentativas.TryRemove(email, out _);

        var nome = r.GetString("nome");
        var sobrenome = r.GetString("sobrenome");
        var cpf = r.GetString("cpf");
        var telefone = r.GetString("telefone");
        var token = NovaSessao(email, nome, sobrenome, cpf, telefone);

        return new ResultadoConta
        {
            Status = 200,
            Corpo = new { token, usuario = new { nome, sobrenome, email, cpf, telefone } }
        };
    }

    // Confere o token enviado pelo navegador e devolve os dados do cliente (ou erro 401)
    public static ResultadoConta ConferirSessao(string? token)
    {
        if (string.IsNullOrEmpty(token)) return Erro(401, "Sessão inexistente.");
        if (!_sessoes.TryGetValue(HashToken(token), out var sessao) || sessao.Expira < DateTime.UtcNow)
        {
            _sessoes.TryRemove(HashToken(token), out _);
            return Erro(401, "Sessão expirada. Entre novamente.");
        }
        return new ResultadoConta { Status = 200, Corpo = new { usuario = DadosUsuario(sessao) } };
    }

    public static void Sair(string? token)
    {
        if (!string.IsNullOrEmpty(token)) _sessoes.TryRemove(HashToken(token), out _);
    }

    private static object DadosUsuario(Sessao s) => new
    {
        nome = s.Nome,
        sobrenome = s.Sobrenome,
        email = s.Email,
        cpf = s.Cpf,
        telefone = s.Telefone
    };

    // ---------- proteção contra tentativas ----------

    private static bool EstaBloqueado(string email, out TimeSpan restante)
    {
        restante = TimeSpan.Zero;
        if (!_tentativas.TryGetValue(email, out var t) || t.Ate == null) return false;
        if (t.Ate > DateTime.UtcNow)
        {
            restante = t.Ate.Value - DateTime.UtcNow;
            return true;
        }
        _tentativas.TryRemove(email, out _);
        return false;
    }

    private static void RegistrarFalha(string email)
    {
        _tentativas.AddOrUpdate(email,
            _ => (1, null),
            (_, atual) =>
            {
                int falhas = atual.Falhas + 1;
                return falhas >= MaxTentativas ? (0, DateTime.UtcNow.Add(Bloqueio)) : (falhas, null);
            });
    }

    private static void LimparSessoesExpiradas()
    {
        var agora = DateTime.UtcNow;
        foreach (var (chave, s) in _sessoes)
            if (s.Expira < agora) _sessoes.TryRemove(chave, out _);
    }

    private static string HashToken(string token) =>
        Convert.ToHexString(SHA256.HashData(System.Text.Encoding.UTF8.GetBytes(token))).ToLowerInvariant();

    // Hash válido de uma senha qualquer: usado para gastar o mesmo tempo quando o e-mail não existe
    private static readonly string HashFalso = GerarHash("senha-inexistente-" + Guid.NewGuid());


    // ---------- validação ----------

    private static string? ValidarCadastro(Entrada d)
    {
        if (string.IsNullOrWhiteSpace(d.Nome) || d.Nome.Trim().Length > 50) return "Informe o nome (até 50 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Sobrenome) || d.Sobrenome.Trim().Length > 80) return "Informe o sobrenome (até 80 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Email) || !d.Email.Contains('@') || d.Email.Trim().Length > 100) return "Informe um e-mail válido.";
        if (string.IsNullOrEmpty(d.Senha) || d.Senha.Length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
        if (!CpfValido(Digitos(d.Cpf))) return "CPF inválido. Confira os números.";
        var tel = Digitos(d.Telefone).Length;
        if (tel < 10 || tel > 11) return "Informe um telefone com 10 ou 11 dígitos.";
        return null;
    }

    // CPF com os dois dígitos verificadores e rejeição de sequências iguais (ex.: 111.111.111-11)
    private static bool CpfValido(string cpf)
    {
        if (cpf.Length != 11 || cpf.Distinct().Count() == 1) return false;
        for (int t = 9; t < 11; t++)
        {
            int soma = 0;
            for (int i = 0; i < t; i++) soma += (cpf[i] - '0') * (t + 1 - i);
            int digito = (soma * 10) % 11 % 10;
            if (cpf[t] - '0' != digito) return false;
        }
        return true;
    }

    // ---------- senha (PBKDF2) ----------

    private static string GerarHash(string senha)
    {
        var sal = RandomNumberGenerator.GetBytes(16);
        var hash = Rfc2898DeriveBytes.Pbkdf2(senha, sal, Iteracoes, HashAlgorithmName.SHA256, TamanhoHash);
        return $"pbkdf2${Iteracoes}${Convert.ToBase64String(sal)}${Convert.ToBase64String(hash)}";
    }

    private static bool VerificarHash(string senha, string armazenado)
    {
        var partes = armazenado.Split('$');
        // Contas criadas pelo importador de pedidos têm senha aleatória e não batem com nenhum login
        if (partes.Length != 4 || partes[0] != "pbkdf2") return false;
        if (!int.TryParse(partes[1], out var iteracoes)) return false;

        var sal = Convert.FromBase64String(partes[2]);
        var esperado = Convert.FromBase64String(partes[3]);
        var calculado = Rfc2898DeriveBytes.Pbkdf2(senha, sal, iteracoes, HashAlgorithmName.SHA256, esperado.Length);
        return CryptographicOperations.FixedTimeEquals(calculado, esperado);
    }

    // ---------- auxiliares ----------

    private sealed class Entrada
    {
        public string Nome { get; set; } = "";
        public string Sobrenome { get; set; } = "";
        public string Email { get; set; } = "";
        public string Senha { get; set; } = "";
        public string Cpf { get; set; } = "";
        public string Telefone { get; set; } = "";
    }

    private static Entrada Ler(string json) =>
        JsonSerializer.Deserialize<Entrada>(json, new JsonSerializerOptions { PropertyNameCaseInsensitive = true })
        ?? new Entrada();

    private static string Digitos(string? valor) => new string((valor ?? "").Where(char.IsDigit).ToArray());

    private static ResultadoConta Erro(int status, string mensagem) =>
        new() { Status = status, Corpo = new { erro = mensagem } };

    private static MySqlCommand Cmd(MySqlConnection c, string sql, params (string Nome, object? Valor)[] ps)
    {
        var cmd = new MySqlCommand(sql, c);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        return cmd;
    }
}
