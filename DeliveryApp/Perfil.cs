using System.Text.Json;
using MySqlConnector;

namespace DeliveryApp;

// Perfil do cliente logado: dados pessoais, endereços e cartões, gravados nas tabelas existentes
// (usuarios, enderecos, cartoes). Todas as operações filtram pelo id_usuario da sessão.
// Nenhuma tabela é criada ou alterada; o número completo e o CVV nunca são gravados.
public static class Perfil
{
    private static readonly JsonSerializerOptions Opcoes = new() { PropertyNameCaseInsensitive = true };

    // ---------- leitura ----------

    public static ResultadoConta Obter(int idUsuario)
    {
        using var c = Conexao.Abrir();
        var usuario = LerUsuario(c, idUsuario);
        if (usuario == null) return Erro(404, "Usuário não encontrado.");

        return new ResultadoConta
        {
            Status = 200,
            Corpo = new { usuario, enderecos = LerEnderecos(c, idUsuario), cartoes = LerCartoes(c, idUsuario) }
        };
    }

    // ---------- dados pessoais ----------

    public static ResultadoConta AtualizarUsuario(int idUsuario, string json)
    {
        var d = Ler<DadosUsuario>(json);
        var erro = ValidarUsuario(d);
        if (erro != null) return Erro(422, erro);

        using var c = Conexao.Abrir();
        var email = d.Email.Trim().ToLowerInvariant();
        var cpf = Digitos(d.Cpf);

        // E-mail e CPF não podem pertencer a outro cliente
        using (var conflito = Cmd(c,
                   "SELECT COUNT(*) FROM usuarios WHERE (email=@e OR cpf=@cpf) AND id_usuario<>@id",
                   ("@e", email), ("@cpf", cpf), ("@id", idUsuario)))
        {
            if (Convert.ToInt32(conflito.ExecuteScalar()) > 0)
                return Erro(409, "Este e-mail ou CPF já está em uso por outra conta.");
        }

        using (var upd = Cmd(c,
                   "UPDATE usuarios SET nome=@n, sobrenome=@s, email=@e, cpf=@cpf, telefone=@t WHERE id_usuario=@id",
                   ("@n", d.Nome.Trim()), ("@s", d.Sobrenome.Trim()), ("@e", email),
                   ("@cpf", cpf), ("@t", Digitos(d.Telefone)), ("@id", idUsuario)))
        {
            upd.ExecuteNonQuery();
        }
        return new ResultadoConta { Status = 200, Corpo = new { usuario = LerUsuario(c, idUsuario) } };
    }

    // ---------- endereços ----------

    public static ResultadoConta CriarEndereco(int idUsuario, string json)
    {
        var d = Ler<DadosEndereco>(json);
        var erro = ValidarEndereco(d);
        if (erro != null) return Erro(422, erro);

        using var c = Conexao.Abrir();
        int id;
        using (var ins = Cmd(c,
                   "INSERT INTO enderecos (id_usuario,apelido,cep,rua,numero,complemento,bairro,cidade,uf,referencia,frete) " +
                   "VALUES (@u,@a,@cep,@r,@n,@comp,@b,@cid,@uf,@ref,0)",
                   ("@u", idUsuario), ("@a", Apelido(d)), ("@cep", Digitos(d.Cep)), ("@r", d.Rua.Trim()),
                   ("@n", d.Numero.Trim()), ("@comp", Vazio(d.Complemento)), ("@b", d.Bairro.Trim()),
                   ("@cid", d.Cidade.Trim()), ("@uf", d.Uf.Trim().ToUpperInvariant()), ("@ref", Vazio(d.Referencia))))
        {
            ins.ExecuteNonQuery();
            id = (int)ins.LastInsertedId;
        }
        return new ResultadoConta { Status = 201, Corpo = new { endereco = LerEndereco(c, idUsuario, id) } };
    }

    public static ResultadoConta AtualizarEndereco(int idUsuario, int idEndereco, string json)
    {
        var d = Ler<DadosEndereco>(json);
        var erro = ValidarEndereco(d);
        if (erro != null) return Erro(422, erro);

        using var c = Conexao.Abrir();
        int linhas;
        using (var upd = Cmd(c,
                   "UPDATE enderecos SET apelido=@a, cep=@cep, rua=@r, numero=@n, complemento=@comp, " +
                   "bairro=@b, cidade=@cid, uf=@uf, referencia=@ref WHERE id_endereco=@id AND id_usuario=@u",
                   ("@a", Apelido(d)), ("@cep", Digitos(d.Cep)), ("@r", d.Rua.Trim()), ("@n", d.Numero.Trim()),
                   ("@comp", Vazio(d.Complemento)), ("@b", d.Bairro.Trim()), ("@cid", d.Cidade.Trim()),
                   ("@uf", d.Uf.Trim().ToUpperInvariant()), ("@ref", Vazio(d.Referencia)),
                   ("@id", idEndereco), ("@u", idUsuario)))
        {
            linhas = upd.ExecuteNonQuery();
        }
        if (linhas == 0) return Erro(404, "Endereço não encontrado.");
        return new ResultadoConta { Status = 200, Corpo = new { endereco = LerEndereco(c, idUsuario, idEndereco) } };
    }

    public static ResultadoConta RemoverEndereco(int idUsuario, int idEndereco)
    {
        using var c = Conexao.Abrir();
        try
        {
            using var del = Cmd(c, "DELETE FROM enderecos WHERE id_endereco=@id AND id_usuario=@u",
                ("@id", idEndereco), ("@u", idUsuario));
            return del.ExecuteNonQuery() == 0
                ? Erro(404, "Endereço não encontrado.")
                : new ResultadoConta { Status = 200, Corpo = new { ok = true } };
        }
        catch (MySqlException)
        {
            // Endereço já usado em pedido: a chave estrangeira impede a remoção (mantém o histórico)
            return Erro(409, "Este endereço já foi usado em um pedido e não pode ser removido.");
        }
    }

    // ---------- cartões ----------

    public static ResultadoConta CriarCartao(int idUsuario, string json)
    {
        var d = Ler<DadosCartao>(json);
        var erro = ValidarCartao(d);
        if (erro != null) return Erro(422, erro);

        // Só bandeira e últimos 4 dígitos são guardados. Número completo e CVV não chegam ao banco.
        var numero = Digitos(d.Numero);
        using var c = Conexao.Abrir();
        int id;
        using (var ins = Cmd(c,
                   "INSERT INTO cartoes (id_usuario,bandeira,ultimos4,nome_titular,validade) VALUES (@u,@b,@l,@n,@v)",
                   ("@u", idUsuario), ("@b", Bandeira(numero)), ("@l", numero[^4..]),
                   ("@n", d.Titular.Trim().ToUpperInvariant()), ("@v", d.Validade.Trim())))
        {
            ins.ExecuteNonQuery();
            id = (int)ins.LastInsertedId;
        }
        return new ResultadoConta { Status = 201, Corpo = new { cartao = LerCartao(c, idUsuario, id) } };
    }

    public static ResultadoConta RemoverCartao(int idUsuario, int idCartao)
    {
        using var c = Conexao.Abrir();
        try
        {
            using var del = Cmd(c, "DELETE FROM cartoes WHERE id_cartao=@id AND id_usuario=@u",
                ("@id", idCartao), ("@u", idUsuario));
            return del.ExecuteNonQuery() == 0
                ? Erro(404, "Cartão não encontrado.")
                : new ResultadoConta { Status = 200, Corpo = new { ok = true } };
        }
        catch (MySqlException)
        {
            return Erro(409, "Este cartão já foi usado em um pedido e não pode ser removido.");
        }
    }

    // ---------- leituras ----------

    private static object? LerUsuario(MySqlConnection c, int id)
    {
        using var cmd = Cmd(c, "SELECT nome,sobrenome,email,cpf,telefone FROM usuarios WHERE id_usuario=@id", ("@id", id));
        using var r = cmd.ExecuteReader();
        if (!r.Read()) return null;
        return new
        {
            nome = r.GetString("nome"),
            sobrenome = r.GetString("sobrenome"),
            email = r.GetString("email"),
            cpf = r.GetString("cpf"),
            telefone = r.GetString("telefone")
        };
    }

    private static List<object> LerEnderecos(MySqlConnection c, int idUsuario)
    {
        var lista = new List<object>();
        using var cmd = Cmd(c,
            "SELECT id_endereco,apelido,cep,rua,numero,complemento,bairro,cidade,uf,referencia " +
            "FROM enderecos WHERE id_usuario=@u ORDER BY id_endereco", ("@u", idUsuario));
        using var r = cmd.ExecuteReader();
        while (r.Read()) lista.Add(EnderecoDe(r));
        return lista;
    }

    private static object? LerEndereco(MySqlConnection c, int idUsuario, int idEndereco)
    {
        using var cmd = Cmd(c,
            "SELECT id_endereco,apelido,cep,rua,numero,complemento,bairro,cidade,uf,referencia " +
            "FROM enderecos WHERE id_endereco=@id AND id_usuario=@u", ("@id", idEndereco), ("@u", idUsuario));
        using var r = cmd.ExecuteReader();
        return r.Read() ? EnderecoDe(r) : null;
    }

    private static object EnderecoDe(MySqlDataReader r) => new
    {
        id = r.GetInt32("id_endereco"),
        apelido = r.GetString("apelido"),
        cep = r.GetString("cep"),
        rua = r.GetString("rua"),
        numero = r.GetString("numero"),
        complemento = r.IsDBNull(r.GetOrdinal("complemento")) ? "" : r.GetString("complemento"),
        bairro = r.GetString("bairro"),
        cidade = r.GetString("cidade"),
        uf = r.GetString("uf"),
        referencia = r.IsDBNull(r.GetOrdinal("referencia")) ? "" : r.GetString("referencia")
    };

    private static List<object> LerCartoes(MySqlConnection c, int idUsuario)
    {
        var lista = new List<object>();
        using var cmd = Cmd(c,
            "SELECT id_cartao,bandeira,ultimos4,nome_titular,validade FROM cartoes WHERE id_usuario=@u ORDER BY id_cartao",
            ("@u", idUsuario));
        using var r = cmd.ExecuteReader();
        while (r.Read()) lista.Add(CartaoDe(r));
        return lista;
    }

    private static object? LerCartao(MySqlConnection c, int idUsuario, int idCartao)
    {
        using var cmd = Cmd(c,
            "SELECT id_cartao,bandeira,ultimos4,nome_titular,validade FROM cartoes WHERE id_cartao=@id AND id_usuario=@u",
            ("@id", idCartao), ("@u", idUsuario));
        using var r = cmd.ExecuteReader();
        return r.Read() ? CartaoDe(r) : null;
    }

    private static object CartaoDe(MySqlDataReader r) => new
    {
        id = r.GetInt32("id_cartao"),
        bandeira = r.GetString("bandeira"),
        final = r.GetString("ultimos4").Trim(),
        titular = r.GetString("nome_titular"),
        validade = r.GetString("validade").Trim()
    };

    // ---------- validação ----------

    private static string? ValidarUsuario(DadosUsuario d)
    {
        if (string.IsNullOrWhiteSpace(d.Nome) || d.Nome.Trim().Length > 50) return "Informe o nome (até 50 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Sobrenome) || d.Sobrenome.Trim().Length > 80) return "Informe o sobrenome (até 80 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Email) || !d.Email.Contains('@') || d.Email.Trim().Length > 100) return "Informe um e-mail válido.";
        if (!CpfValido(Digitos(d.Cpf))) return "CPF inválido. Confira os números.";
        var tel = Digitos(d.Telefone).Length;
        if (tel < 10 || tel > 11) return "Informe um telefone com 10 ou 11 dígitos.";
        return null;
    }

    private static string? ValidarEndereco(DadosEndereco d)
    {
        if (Digitos(d.Cep).Length != 8) return "CEP deve ter 8 dígitos.";
        if (string.IsNullOrWhiteSpace(d.Rua) || d.Rua.Trim().Length > 100) return "Informe a rua (até 100 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Numero) || d.Numero.Trim().Length > 10) return "Informe o número (até 10 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Bairro) || d.Bairro.Trim().Length > 60) return "Informe o bairro (até 60 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Cidade) || d.Cidade.Trim().Length > 60) return "Informe a cidade (até 60 caracteres).";
        if (string.IsNullOrWhiteSpace(d.Uf) || d.Uf.Trim().Length != 2) return "UF deve ter 2 letras.";
        if ((d.Complemento ?? "").Length > 50) return "Complemento: até 50 caracteres.";
        if ((d.Referencia ?? "").Length > 100) return "Referência: até 100 caracteres.";
        return null;
    }

    private static string? ValidarCartao(DadosCartao d)
    {
        var numero = Digitos(d.Numero);
        if (numero.Length < 13 || numero.Length > 19 || !Luhn(numero)) return "Número do cartão inválido.";
        if (string.IsNullOrWhiteSpace(d.Titular) || d.Titular.Trim().Length > 80) return "Informe o nome do titular (até 80 caracteres).";
        if (!System.Text.RegularExpressions.Regex.IsMatch(d.Validade ?? "", @"^(0[1-9]|1[0-2])/\d{2}$"))
            return "Validade deve estar no formato MM/AA.";
        return null;
    }

    // Algoritmo de Luhn: confere o número do cartão
    private static bool Luhn(string numero)
    {
        int soma = 0;
        bool dobrar = false;
        for (int i = numero.Length - 1; i >= 0; i--)
        {
            int n = numero[i] - '0';
            if (dobrar) { n *= 2; if (n > 9) n -= 9; }
            soma += n;
            dobrar = !dobrar;
        }
        return soma % 10 == 0;
    }

    // Bandeira pelo prefixo (mesma lógica de detectarBandeira do site)
    private static string Bandeira(string numero)
    {
        if (numero.StartsWith("4")) return "Visa";
        if (numero.Length >= 2 && int.TryParse(numero[..2], out var p2) && p2 >= 51 && p2 <= 55) return "Mastercard";
        if (numero.Length >= 4 && int.TryParse(numero[..4], out var p4) && p4 >= 2221 && p4 <= 2720) return "Mastercard";
        if (numero.StartsWith("34") || numero.StartsWith("37")) return "Amex";
        if (numero.StartsWith("6")) return "Elo";
        return "Outra";
    }

    private static string Apelido(DadosEndereco d) =>
        string.IsNullOrWhiteSpace(d.Apelido) ? "Minha casa" : d.Apelido.Trim();

    private static string? Vazio(string? valor) =>
        string.IsNullOrWhiteSpace(valor) ? null : valor.Trim();

    // ---------- auxiliares ----------

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

    private static string Digitos(string? valor) => new string((valor ?? "").Where(char.IsDigit).ToArray());

    private static T Ler<T>(string json) where T : new() =>
        JsonSerializer.Deserialize<T>(json, Opcoes) ?? new T();

    private static ResultadoConta Erro(int status, string mensagem) =>
        new() { Status = status, Corpo = new { erro = mensagem } };

    private static MySqlCommand Cmd(MySqlConnection c, string sql, params (string Nome, object? Valor)[] ps)
    {
        var cmd = new MySqlCommand(sql, c);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        return cmd;
    }

    // Formatos recebidos do site
    public sealed class DadosUsuario
    {
        public string Nome { get; set; } = "";
        public string Sobrenome { get; set; } = "";
        public string Email { get; set; } = "";
        public string Cpf { get; set; } = "";
        public string Telefone { get; set; } = "";
    }

    public sealed class DadosEndereco
    {
        public string Apelido { get; set; } = "";
        public string Cep { get; set; } = "";
        public string Rua { get; set; } = "";
        public string Numero { get; set; } = "";
        public string? Complemento { get; set; }
        public string Bairro { get; set; } = "";
        public string Cidade { get; set; } = "";
        public string Uf { get; set; } = "";
        public string? Referencia { get; set; }
    }

    public sealed class DadosCartao
    {
        public string Numero { get; set; } = "";
        public string Titular { get; set; } = "";
        public string Validade { get; set; } = "";
    }
}
