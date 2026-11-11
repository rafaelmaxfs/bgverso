using System.Security.Cryptography;
using System.Text.Json;
using MySqlConnector;

namespace DeliveryApp;

public class ResultadoConta
{
    public int Status { get; init; }
    public object Corpo { get; init; } = new { };
}

// Cadastro e login de clientes (tabela usuarios). A senha nunca é guardada em texto:
// usa PBKDF2 com sal aleatório, no formato "pbkdf2$iteracoes$sal$hash" na coluna senha_hash.
public static class Contas
{
    private const int Iteracoes = 210_000;
    private const int TamanhoHash = 32;

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

        return new ResultadoConta
        {
            Status = 201,
            Corpo = new { usuario = new { nome, sobrenome, email, cpf, telefone } }
        };
    }

    public static ResultadoConta Entrar(string json)
    {
        var d = Ler(json);
        if (string.IsNullOrWhiteSpace(d.Email) || string.IsNullOrEmpty(d.Senha))
            return Erro(422, "Informe e-mail e senha.");

        var email = d.Email.Trim().ToLowerInvariant();
        using var c = Conexao.Abrir();
        using var cmd = Cmd(c,
            "SELECT nome,sobrenome,email,cpf,telefone,senha_hash FROM usuarios WHERE email=@e LIMIT 1",
            ("@e", email));
        using var r = cmd.ExecuteReader();

        // Mesma mensagem para e-mail inexistente e senha errada (não revela qual dos dois)
        const string falha = "E-mail ou senha inválidos.";
        if (!r.Read()) return Erro(401, falha);
        if (!VerificarHash(d.Senha, r.GetString("senha_hash"))) return Erro(401, falha);

        return new ResultadoConta
        {
            Status = 200,
            Corpo = new
            {
                usuario = new
                {
                    nome = r.GetString("nome"),
                    sobrenome = r.GetString("sobrenome"),
                    email = r.GetString("email"),
                    cpf = r.GetString("cpf"),
                    telefone = r.GetString("telefone")
                }
            }
        };
    }


    // ---------- validação ----------

    private static string? ValidarCadastro(Entrada d)
    {
        if (string.IsNullOrWhiteSpace(d.Nome) || d.Nome.Trim().Length > 50) return "Informe o nome (até 50 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Sobrenome) || d.Sobrenome.Trim().Length > 80) return "Informe o sobrenome (até 80 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Email) || !d.Email.Contains('@') || d.Email.Trim().Length > 100) return "Informe um e-mail válido.";
        if (string.IsNullOrEmpty(d.Senha) || d.Senha.Length < 6) return "A senha precisa ter pelo menos 6 caracteres.";
        if (Digitos(d.Cpf).Length != 11) return "Informe um CPF com 11 dígitos.";
        var tel = Digitos(d.Telefone).Length;
        if (tel < 10 || tel > 11) return "Informe um telefone com 10 ou 11 dígitos.";
        return null;
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
