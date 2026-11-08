using System.Data;
using Npgsql;

namespace DeliveryApp;

// Conexão com o PostgreSQL do Neon.
// Defina a variável de ambiente NEON_CONN, por exemplo:
// Host=ep-xxxx.sa-east-1.aws.neon.tech;Database=bgverso;Username=usuario;Password=senha;SSL Mode=Require;Trust Server Certificate=true
public static class Conexao
{
    private static readonly string Cs = Environment.GetEnvironmentVariable("NEON_CONN")
        ?? throw new InvalidOperationException("Defina a variável de ambiente NEON_CONN com a connection string do Neon.");

    public static NpgsqlConnection Abrir()
    {
        var c = new NpgsqlConnection(Cs);
        c.Open();
        return c;
    }

    public static int Executar(string sql, params NpgsqlParameter[] ps)
    {
        using var c = Abrir();
        using var cmd = new NpgsqlCommand(sql, c);
        cmd.Parameters.AddRange(ps);
        return cmd.ExecuteNonQuery();
    }

    public static DataTable Consultar(string sql, params NpgsqlParameter[] ps)
    {
        using var c = Abrir();
        using var cmd = new NpgsqlCommand(sql, c);
        cmd.Parameters.AddRange(ps);
        var dt = new DataTable();
        using var reader = cmd.ExecuteReader();
        dt.Load(reader);
        return dt;
    }
}
