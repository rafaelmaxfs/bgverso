namespace DeliveryApp;

// Janela principal: mostra o log do importador de pedidos e dá acesso ao CRUD.
public class FrmPrincipal : Form
{
    private readonly ListBox _log = new() { Dock = DockStyle.Fill, IntegralHeight = false };
    private ServidorPedidos? _servidor;

    public FrmPrincipal()
    {
        Text = "BGVerso - Importador de pedidos";
        Size = new Size(900, 600);
        StartPosition = FormStartPosition.CenterScreen;

        var botoes = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 50, Padding = new Padding(8) };

        var btnCategorias = new Button { Text = "Categorias", AutoSize = true };
        btnCategorias.Click += (s, e) =>
            new FrmCrud("Categorias", "categorias", "id_categoria",
                new[] { ("nome", "Nome") }).ShowDialog(this);

        var btnClientes = new Button { Text = "Clientes", AutoSize = true };
        btnClientes.Click += (s, e) =>
            new FrmCrud("Clientes", "usuarios", "id_usuario",
                new[] { ("nome", "Nome"), ("sobrenome", "Sobrenome"), ("email", "E-mail"),
                        ("cpf", "CPF"), ("telefone", "Telefone") },
                new Dictionary<string, string> { ["senha_hash"] = "SHA2(UUID(),256)", ["criado_em"] = "NOW()" })
            .ShowDialog(this);

        botoes.Controls.Add(btnCategorias);
        botoes.Controls.Add(btnClientes);

        Controls.Add(_log);
        Controls.Add(botoes);
        Tema.Aplicar(this);

        Load += (s, e) => IniciarServidor();
        FormClosed += (s, e) => _servidor?.Dispose();
    }

    private void IniciarServidor()
    {
        try
        {
            _servidor = new ServidorPedidos(Registrar);
            _servidor.Iniciar();
        }
        catch (Exception ex)
        {
            Registrar("Erro ao iniciar o servidor de pedidos: " + ex.Message);
        }
    }

    // O monitor roda em outra thread: o log é escrito na thread da interface.
    private void Registrar(string mensagem)
    {
        if (InvokeRequired)
        {
            BeginInvoke(() => Registrar(mensagem));
            return;
        }
        _log.Items.Add($"{DateTime.Now:HH:mm:ss}  {mensagem}");
        _log.TopIndex = _log.Items.Count - 1;
    }
}
