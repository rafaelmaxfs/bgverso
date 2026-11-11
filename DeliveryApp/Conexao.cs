using System.Data;
using MySqlConnector;

namespace DeliveryApp;

// Conexão com o MySQL do BGVerso.
// Defina a variável de ambiente MYSQL_CONN, por exemplo:
// Server=localhost;Port=3306;Database=bgverso;User ID=usuario;Password=senha;SslMode=Preferred
public static class Conexao
{
    private static string? _cs;

    // Lida só quando é usada: assim a mensagem de erro é clara (em vez de "type initializer ... threw an exception").
    private static string Cs => _cs ??= Environment.GetEnvironmentVariable("MYSQL_CONN")
        ?? throw new InvalidOperationException(
            "A variável de ambiente MYSQL_CONN não está definida neste processo. " +
            "Defina-a e feche/reabra o Visual Studio (ou reinicie o programa).");

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
