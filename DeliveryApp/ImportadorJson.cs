using System.Text.Json;
using System.Text.Json.Serialization;
using MySqlConnector;

namespace DeliveryApp;

// ---- Modelos que espelham o JSON gerado pelo site (pedidos.json) ----
public class ArquivoPedidos { [JsonPropertyName("pedidos")] public List<PedidoJson> Pedidos { get; set; } = new(); }

public class PedidoJson
{
    [JsonPropertyName("criado_em")] public DateTime CriadoEm { get; set; }
    [JsonPropertyName("forma_pagamento")] public string FormaPagamento { get; set; } = "";
    [JsonPropertyName("cartao")] public CartaoJson? Cartao { get; set; }
    [JsonPropertyName("usuario")] public UsuarioJson Usuario { get; set; } = new();
    [JsonPropertyName("endereco")] public EnderecoJson Endereco { get; set; } = new();
    [JsonPropertyName("itens")] public List<ItemJson> Itens { get; set; } = new();
}

public class UsuarioJson
{
    [JsonPropertyName("nome")] public string Nome { get; set; } = "";
    [JsonPropertyName("sobrenome")] public string Sobrenome { get; set; } = "";
    [JsonPropertyName("email")] public string Email { get; set; } = "";
    [JsonPropertyName("cpf")] public string Cpf { get; set; } = "";
    [JsonPropertyName("telefone")] public string Telefone { get; set; } = "";
}

public class EnderecoJson
{
    [JsonPropertyName("apelido")] public string Apelido { get; set; } = "";
    [JsonPropertyName("cep")] public string Cep { get; set; } = "";
    [JsonPropertyName("rua")] public string Rua { get; set; } = "";
    [JsonPropertyName("numero")] public string Numero { get; set; } = "";
    [JsonPropertyName("complemento")] public string? Complemento { get; set; }
    [JsonPropertyName("bairro")] public string Bairro { get; set; } = "";
    [JsonPropertyName("cidade")] public string Cidade { get; set; } = "";
    [JsonPropertyName("uf")] public string Uf { get; set; } = "";
    [JsonPropertyName("referencia")] public string? Referencia { get; set; }
    [JsonPropertyName("frete")] public decimal Frete { get; set; }
}

public class CartaoJson
{
    [JsonPropertyName("bandeira")] public string Bandeira { get; set; } = "";
    [JsonPropertyName("ultimos4")] public string Ultimos4 { get; set; } = "";
    [JsonPropertyName("nome_titular")] public string NomeTitular { get; set; } = "";
    [JsonPropertyName("validade")] public string Validade { get; set; } = "";
}

public class ItemJson
{
    [JsonPropertyName("id_produto")] public int IdProduto { get; set; }
    [JsonPropertyName("nome")] public string Nome { get; set; } = "";
    [JsonPropertyName("quantidade")] public int Quantidade { get; set; }
    [JsonPropertyName("preco_unitario")] public decimal PrecoUnitario { get; set; }
}

public class ResultadoImportacao
{
    public int Importados, Ignorados;
    public List<string> Erros = new();
}

public static class ImportadorJson
{
    private static readonly string[] Formas = { "pix", "cartao", "dinheiro" };

    // Lê o JSON do site e grava cada pedido numa transação própria (um pedido com erro não derruba os outros).
    public static ResultadoImportacao Importar(string caminho) => ImportarTexto(File.ReadAllText(caminho));

    // Importa a partir do texto JSON (ex.: corpo da requisição enviada pelo site).
    public static ResultadoImportacao ImportarTexto(string json)
    {
        var arq = JsonSerializer.Deserialize<ArquivoPedidos>(json)
                  ?? throw new Exception("JSON vazio ou inválido.");
        var res = new ResultadoImportacao();

        using var conn = Conexao.Abrir();
        int n = 0;
        foreach (var p in arq.Pedidos)
        {
            n++;
            using var tx = conn.BeginTransaction();
            try
            {
                if (ImportarUm(conn, tx, p)) res.Importados++; else res.Ignorados++;
                tx.Commit();
            }
            catch (Exception ex)
            {
                tx.Rollback();
                res.Erros.Add($"Pedido {n}: {ex.Message}");
            }
        }
        return res;
    }

    private static bool ImportarUm(MySqlConnection c, MySqlTransaction t, PedidoJson p)
    {
        if (p.Itens.Count == 0) throw new Exception("pedido sem itens.");
        if (!Formas.Contains(p.FormaPagamento)) throw new Exception($"forma de pagamento inválida ({p.FormaPagamento}).");

        // 1) usuário (por e-mail). Cliente novo recebe senha aleatória: não consegue logar no sistema.
        int idUsuario;
        var u = Cmd(c, t, "SELECT id_usuario FROM usuarios WHERE email=@e", ("@e", p.Usuario.Email)).ExecuteScalar();
        if (u != null) idUsuario = Convert.ToInt32(u);
        else
        {
            idUsuario = InserirComId(c, t,
                "INSERT INTO usuarios (nome,sobrenome,email,senha_hash,cpf,telefone,criado_em) " +
                "VALUES (@n,@s,@e,SHA2(UUID(),256),@cpf,@tel,NOW())",
                ("@n", p.Usuario.Nome), ("@s", p.Usuario.Sobrenome), ("@e", p.Usuario.Email),
                ("@cpf", p.Usuario.Cpf), ("@tel", p.Usuario.Telefone));
        }

        // 2) pedido já importado? (mesmo cliente + mesmo instante)
        if (Convert.ToInt32(Cmd(c, t, "SELECT COUNT(*) FROM pedidos WHERE id_usuario=@u AND criado_em=@d",
                ("@u", idUsuario), ("@d", p.CriadoEm)).ExecuteScalar()) > 0)
            return false;

        // 3) endereço (reaproveita se igual)
        var e = p.Endereco;
        int idEndereco;
        var ex = Cmd(c, t, "SELECT id_endereco FROM enderecos WHERE id_usuario=@u AND cep=@cep AND rua=@r AND numero=@n LIMIT 1",
            ("@u", idUsuario), ("@cep", e.Cep), ("@r", e.Rua), ("@n", e.Numero)).ExecuteScalar();
        if (ex != null) idEndereco = Convert.ToInt32(ex);
        else
        {
            idEndereco = InserirComId(c, t,
                "INSERT INTO enderecos (id_usuario,apelido,cep,rua,numero,complemento,bairro,cidade,uf,referencia,frete) " +
                "VALUES (@u,@a,@cep,@r,@n,@comp,@b,@cid,@uf,@ref,@f)",
                ("@u", idUsuario), ("@a", e.Apelido), ("@cep", e.Cep), ("@r", e.Rua), ("@n", e.Numero),
                ("@comp", e.Complemento), ("@b", e.Bairro), ("@cid", e.Cidade), ("@uf", e.Uf),
                ("@ref", e.Referencia), ("@f", e.Frete));
        }

        // 4) cartão (só últimos 4 dígitos)
        int? idCartao = null;
        if (p.FormaPagamento == "cartao" && p.Cartao != null)
        {
            var k = p.Cartao;
            var ec = Cmd(c, t, "SELECT id_cartao FROM cartoes WHERE id_usuario=@u AND bandeira=@b AND ultimos4=@l LIMIT 1",
                ("@u", idUsuario), ("@b", k.Bandeira), ("@l", k.Ultimos4)).ExecuteScalar();
            if (ec != null) idCartao = Convert.ToInt32(ec);
            else
            {
                idCartao = InserirComId(c, t,
                    "INSERT INTO cartoes (id_usuario,bandeira,ultimos4,nome_titular,validade) VALUES (@u,@b,@l,@n,@v)",
                    ("@u", idUsuario), ("@b", k.Bandeira), ("@l", k.Ultimos4), ("@n", k.NomeTitular), ("@v", k.Validade));
            }
        }

        // 5) itens: confirma o produto no banco (por id, ou pelo nome) e junta linhas repetidas
        var itens = new Dictionary<int, (int Qtd, decimal Preco)>();
        foreach (var i in p.Itens)
        {
            var idp = Cmd(c, t, "SELECT id_produto FROM produtos WHERE id_produto=@i", ("@i", i.IdProduto)).ExecuteScalar()
                      ?? Cmd(c, t, "SELECT id_produto FROM produtos WHERE nome=@n LIMIT 1", ("@n", i.Nome)).ExecuteScalar()
                      ?? throw new Exception($"produto '{i.Nome}' não cadastrado no banco.");
            int id = Convert.ToInt32(idp);
            itens[id] = itens.TryGetValue(id, out var a) ? (a.Qtd + i.Quantidade, i.PrecoUnitario) : (i.Quantidade, i.PrecoUnitario);
        }
        decimal subtotal = itens.Values.Sum(v => v.Qtd * v.Preco);
        decimal total = subtotal + e.Frete;

        // 6) pedido (status inicial: confirmado, igual ao padrão do banco)
        int idPedido = InserirComId(c, t,
            "INSERT INTO pedidos (id_usuario,id_endereco,id_cartao,forma_pagamento,status,subtotal,frete,total,criado_em) " +
            "VALUES (@u,@e,@c,@fp,'confirmado',@s,@f,@t,@d)",
            ("@u", idUsuario), ("@e", idEndereco), ("@c", idCartao), ("@fp", p.FormaPagamento),
            ("@s", subtotal), ("@f", e.Frete), ("@t", total), ("@d", p.CriadoEm));

        foreach (var (idProd, v) in itens)
            Cmd(c, t, "INSERT INTO itens_pedido (id_pedido,id_produto,quantidade,preco_unitario) VALUES (@p,@pr,@q,@pu)",
                ("@p", idPedido), ("@pr", idProd), ("@q", v.Qtd), ("@pu", v.Preco)).ExecuteNonQuery();
        return true;
    }


    // Executa o INSERT e devolve o id gerado pelo AUTO_INCREMENT (LastInsertedId do MySQL).
    private static int InserirComId(MySqlConnection c, MySqlTransaction t, string sql,
                                    params (string Nome, object? Valor)[] ps)
    {
        var cmd = Cmd(c, t, sql, ps);
        cmd.ExecuteNonQuery();
        return (int)cmd.LastInsertedId;
    }

    private static MySqlCommand Cmd(MySqlConnection c, MySqlTransaction t, string sql, params (string Nome, object? Valor)[] ps)
    {
        var cmd = new MySqlCommand(sql, c, t);
        foreach (var (n, v) in ps) cmd.Parameters.AddWithValue(n, v ?? DBNull.Value);
        return cmd;
    }
}
