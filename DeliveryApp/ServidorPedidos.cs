using System.Net;
using System.Text;
using System.Text.Json;

namespace DeliveryApp;

// Servidor HTTP local: recebe o pedido enviado pelo site (POST http://localhost:5050/pedidos)
// e grava no MySQL na hora, sem depender de arquivos na pasta Downloads.
public class ServidorPedidos : IDisposable
{
    public const string Endereco = "http://localhost:5050/";

    private readonly HttpListener _listener = new();
    private readonly Action<string> _log;
    private readonly object _trava = new();   // uma importação por vez

    public ServidorPedidos(Action<string>? log = null)
    {
        _log = log ?? (_ => { });
        _listener.Prefixes.Add(Endereco);
    }

    public void Iniciar()
    {
        _listener.Start();
        _log($"Aguardando pedidos do site em {Endereco}pedidos");
        _ = Task.Run(Loop);
    }

    public void Dispose()
    {
        if (_listener.IsListening) _listener.Stop();
        _listener.Close();
    }

    private async Task Loop()
    {
        while (_listener.IsListening)
        {
            HttpListenerContext contexto;
            try
            {
                contexto = await _listener.GetContextAsync();
            }
            catch (Exception)
            {
                break;   // servidor parado
            }
            _ = Task.Run(() => Atender(contexto));
        }
    }

    private void Atender(HttpListenerContext contexto)
    {
        var req = contexto.Request;
        var resp = contexto.Response;
        try
        {
            // Permite que o site (aberto em outra origem, ex.: Live Server ou arquivo local) chame este servidor
            resp.Headers["Access-Control-Allow-Origin"] = "*";
            resp.Headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS";
            resp.Headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization";

            if (req.HttpMethod == "OPTIONS")
            {
                Enviar(resp, 204, null);
                return;
            }

            var rota = req.Url?.AbsolutePath;

            // Lê o corpo de qualquer requisição antes de responder (evita erro 411 ao responder POST sem corpo)
            string corpo;
            using (var leitor = new StreamReader(req.InputStream, Encoding.UTF8))
                corpo = leitor.ReadToEnd();

            // Sessão do cliente (ver Contas.cs): token enviado no cabeçalho Authorization
            if (rota == "/sessao" && req.HttpMethod == "GET")
            {
                var sessao = Contas.ConferirSessao(TokenDoCabecalho(req));
                Enviar(resp, sessao.Status, sessao.Corpo);
                return;
            }
            if (rota == "/logout" && req.HttpMethod == "POST")
            {
                Contas.Sair(TokenDoCabecalho(req));
                _log("Logout realizado.");
                Enviar(resp, 200, new { ok = true });
                return;
            }

            // Perfil do cliente (ver Perfil.cs): só com sessão válida; o id vem da sessão, nunca do navegador
            if (rota != null && rota.StartsWith("/perfil", StringComparison.Ordinal))
            {
                var idUsuario = Contas.IdDaSessao(TokenDoCabecalho(req));
                if (idUsuario == null)
                {
                    Enviar(resp, 401, new { erro = "Faça login para acessar o perfil." });
                    return;
                }
                var resultadoPerfil = RotaPerfil(req.HttpMethod, rota, idUsuario.Value, corpo);
                _log($"Perfil {req.HttpMethod} {rota}: HTTP {resultadoPerfil.Status}");
                Enviar(resp, resultadoPerfil.Status, resultadoPerfil.Corpo);
                return;
            }

            if (req.HttpMethod != "POST")
            {
                Enviar(resp, 404, new { erro = "Rota não encontrada." });
                return;
            }

            // Cadastro e login de clientes (ver Contas.cs)
            if (rota == "/cadastro" || rota == "/login")
            {
                var conta = rota == "/cadastro" ? Contas.Cadastrar(corpo) : Contas.Entrar(corpo);
                _log($"{(rota == "/cadastro" ? "Cadastro" : "Login")}: HTTP {conta.Status}");
                Enviar(resp, conta.Status, conta.Corpo);
                return;
            }
            if (rota != "/pedidos")
            {
                Enviar(resp, 404, new { erro = "Rota não encontrada." });
                return;
            }

            ResultadoImportacao resultado;
            lock (_trava)
                resultado = ImportadorJson.ImportarTexto(corpo);

            _log($"Pedido recebido: {resultado.Importados} importado(s), {resultado.Ignorados} já existente(s)."
                 + (resultado.Erros.Count > 0 ? " Erros: " + string.Join("; ", resultado.Erros) : ""));

            var dados = new
            {
                importados = resultado.Importados,
                ignorados = resultado.Ignorados,
                erros = resultado.Erros
            };
            Enviar(resp, resultado.Erros.Count > 0 ? 422 : 200, dados);
        }
        catch (Exception ex)
        {
            // Mostra a causa real (ex.: MYSQL_CONN ausente), não só o erro externo do .NET
            var causa = ex.InnerException ?? ex;
            _log("Erro ao gravar pedido: " + causa.Message);
            try { Enviar(resp, 500, new { erro = causa.Message }); } catch (Exception) { }
        }
    }

    // Roteia /perfil, /perfil/enderecos, /perfil/enderecos/{id}, /perfil/cartoes, /perfil/cartoes/{id}
    private static ResultadoConta RotaPerfil(string metodo, string rota, int idUsuario, string corpo)
    {
        var partes = rota.Trim('/').Split('/');   // ["perfil", ...]
        int? id = partes.Length == 3 && int.TryParse(partes[2], out var n) ? n : null;
        string recurso = partes.Length > 1 ? partes[1] : "";

        if (partes.Length == 1 && metodo == "GET") return Perfil.Obter(idUsuario);
        if (partes.Length == 1 && metodo == "PUT") return Perfil.AtualizarUsuario(idUsuario, corpo);

        if (recurso == "enderecos")
        {
            if (partes.Length == 2 && metodo == "POST") return Perfil.CriarEndereco(idUsuario, corpo);
            if (id != null && metodo == "PUT") return Perfil.AtualizarEndereco(idUsuario, id.Value, corpo);
            if (id != null && metodo == "DELETE") return Perfil.RemoverEndereco(idUsuario, id.Value);
        }
        if (recurso == "cartoes")
        {
            if (partes.Length == 2 && metodo == "POST") return Perfil.CriarCartao(idUsuario, corpo);
            if (id != null && metodo == "DELETE") return Perfil.RemoverCartao(idUsuario, id.Value);
        }
        return new ResultadoConta { Status = 404, Corpo = new { erro = "Rota de perfil não encontrada." } };
    }

    // Lê "Authorization: Bearer <token>"; devolve null se ausente
    private static string? TokenDoCabecalho(HttpListenerRequest req)
    {
        var valor = req.Headers["Authorization"];
        if (string.IsNullOrEmpty(valor) || !valor.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return null;
        return valor["Bearer ".Length..].Trim();
    }

    private static void Enviar(HttpListenerResponse resp, int status, object? corpo)
    {
        // Só escreve uma vez: se a resposta já foi enviada/fechada, não tenta de novo
        if (!resp.OutputStream.CanWrite) return;
        try
        {
            resp.StatusCode = status;
            if (corpo != null)
            {
                var bytes = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(corpo));
                resp.ContentType = "application/json; charset=utf-8";
                resp.ContentLength64 = bytes.Length;
                resp.OutputStream.Write(bytes, 0, bytes.Length);
            }
        }
        finally
        {
            try { resp.OutputStream.Close(); } catch (Exception) { }
        }
    }
}
