using System.Text.Json;

namespace DeliveryApp;

// Monitora a pasta de Downloads (ou a pasta definida na variável de ambiente PEDIDOS_PASTA)
// e importa automaticamente os pedidos-*.json gerados pelo site, assim que terminam de ser baixados.
public class MonitorPedidos : IDisposable
{
    private readonly FileSystemWatcher _watcher;
    private readonly Action<string> _log;
    private readonly HashSet<string> _emProcessamento = new(StringComparer.OrdinalIgnoreCase);
    private readonly object _trava = new();

    public string Pasta { get; }

    public MonitorPedidos(Action<string>? log = null, string? pasta = null)
    {
        Pasta = pasta
            ?? Environment.GetEnvironmentVariable("PEDIDOS_PASTA")
            ?? Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile), "Downloads");
        _log = log ?? (_ => { });

        if (!Directory.Exists(Pasta))
            throw new DirectoryNotFoundException($"Pasta de pedidos não encontrada: {Pasta}");

        _watcher = new FileSystemWatcher(Pasta, "pedidos-*.json")
        {
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.LastWrite,
            IncludeSubdirectories = false
        };
        _watcher.Created += (s, e) => Processar(e.FullPath);
        _watcher.Renamed += (s, e) => Processar(e.FullPath);
    }

    public void Iniciar()
    {
        _watcher.EnableRaisingEvents = true;
        _log($"Monitorando pedidos em: {Pasta}");

        // Importa também os arquivos que já estavam na pasta (os já importados são ignorados pelo importador)
        foreach (var arquivo in Directory.GetFiles(Pasta, "pedidos-*.json"))
            Processar(arquivo);
    }

    public void Parar() => _watcher.EnableRaisingEvents = false;

    public void Dispose() => _watcher.Dispose();

    private void Processar(string caminho)
    {
        // Evita importar o mesmo arquivo em paralelo (o Windows pode disparar mais de um evento)
        lock (_trava)
            if (!_emProcessamento.Add(caminho)) return;

        Task.Run(() =>
        {
            var nome = Path.GetFileName(caminho);
            try
            {
                var res = ImportarComEspera(caminho);
                var msg = $"{nome}: {res.Importados} importado(s), {res.Ignorados} já existente(s).";
                if (res.Erros.Count > 0) msg += " Erros: " + string.Join("; ", res.Erros);
                _log(msg);
            }
            catch (Exception ex)
            {
                _log($"{nome}: erro - {ex.Message}");
            }
            finally
            {
                lock (_trava) _emProcessamento.Remove(caminho);
            }
        });
    }

    // O navegador pode ainda estar gravando o arquivo: tenta algumas vezes antes de desistir
    private static ResultadoImportacao ImportarComEspera(string caminho)
    {
        const int maxTentativas = 10;
        for (int tentativa = 1; ; tentativa++)
        {
            try
            {
                return ImportadorJson.Importar(caminho);
            }
            catch (Exception ex) when ((ex is IOException || ex is JsonException) && tentativa < maxTentativas)
            {
                Thread.Sleep(500);
            }
        }
    }
}
