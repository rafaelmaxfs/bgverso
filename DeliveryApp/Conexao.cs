using System.Data;
using MySqlConnector;

namespace DeliveryApp;

// Conexão com o MySQL do BGVerso.
// Defina a variável de ambiente MYSQL_CONN, por exemplo:
// Server=localhost;Port=3306;Database=bgverso;User ID=usuario;Password=senha;SslMode=Preferred
public static class Conexao
{
    // Configuração local padrão, usada quando MYSQL_CONN não está visível para o processo
    // (acontece quando o Visual Studio foi aberto antes do setx).
    private const string PadraoLocal = "Server=localhost;Port=3306;Database=bgverso;User ID=root;Password=;SslMode=Preferred";

    private static string? _cs;

    private static string Cs => _cs ??= Environment.GetEnvironmentVariable("MYSQL_CONN") is { Length: > 0 } valor
        ? valor
        : PadraoLocal;

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
