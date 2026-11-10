using System.Data;
using MySqlConnector;

namespace DeliveryApp;

// Conexão com o MySQL do BGVerso.
// Defina a variável de ambiente MYSQL_CONN, por exemplo:
// Server=localhost;Port=3306;Database=bgverso;User ID=usuario;Password=senha;SslMode=Preferred
public static class Conexao
{
    private static readonly string Cs = Environment.GetEnvironmentVariable("MYSQL_CONN")
        ?? throw new InvalidOperationException("Defina a variável de ambiente MYSQL_CONN com a connection string do MySQL.");

    public static MySqlConnection Abrir()
    {
        var c = new MySqlConnection(Cs);
        c.Open();
        return c;
    }

    public static int Executar(string sql, params MySqlParameter[] ps)
    {
        using var c = Abrir();
        using var cmd = new MySqlCommand(sql, c);
        cmd.Parameters.AddRange(ps);
        return cmd.ExecuteNonQuery();
    }

    public static DataTable Consultar(string sql, params MySqlParameter[] ps)
    {
        using var c = Abrir();
        using var cmd = new MySqlCommand(sql, c);
        cmd.Parameters.AddRange(ps);
        var dt = new DataTable();
        using var reader = cmd.ExecuteReader();
        dt.Load(reader);
        return dt;
    }
}
