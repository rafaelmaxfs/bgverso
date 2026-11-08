using Npgsql;

namespace DeliveryApp;

// CRUD completo reutilizável (Inserir, Consultar, Alterar, Excluir).
// Usado nas 2 tabelas extras escolhidas: categorias e usuarios (clientes).
public class FrmCrud : Form
{
    private readonly string _tabela, _idColuna;
    private readonly (string Coluna, string Rotulo)[] _campos;
    private readonly Dictionary<string, string> _extras;   // colunas preenchidas automaticamente no INSERT
    private readonly DataGridView _grid = new();
    private readonly Dictionary<string, TextBox> _txt = new();

    public FrmCrud(string titulo, string tabela, string idColuna, (string Coluna, string Rotulo)[] campos,
                   Dictionary<string, string>? extrasInsert = null)
    {
        _tabela = tabela;
        _idColuna = idColuna;
        _campos = campos;
        _extras = extrasInsert ?? new();
        Text = "Cadastro de " + titulo;
        Size = new Size(950, 600);
        StartPosition = FormStartPosition.CenterParent;

        var painel = new TableLayoutPanel { Dock = DockStyle.Top, AutoSize = true, ColumnCount = 2, Padding = new Padding(10) };
        foreach (var (col, rot) in campos)
        {
            var t = new TextBox { Width = 400 };
            _txt[col] = t;
            painel.Controls.Add(new Label { Text = rot, AutoSize = true, Anchor = AnchorStyles.Left });
            painel.Controls.Add(t);
        }

        var botoes = new FlowLayoutPanel { Dock = DockStyle.Top, Height = 50, Padding = new Padding(8) };
        foreach (var (txt, h) in new (string, EventHandler)[]
                 { ("Inserir", Inserir), ("Alterar", Alterar), ("Excluir", Excluir), ("Limpar", (s, e) => Limpar()) })
        {
            var b = new Button { Text = txt, AutoSize = true };
            b.Click += h;
            botoes.Controls.Add(b);
        }

        _grid.Dock = DockStyle.Fill;
        _grid.ReadOnly = true;
        _grid.AllowUserToAddRows = false;
        _grid.AllowUserToDeleteRows = false;
        _grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        _grid.MultiSelect = false;
        _grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        _grid.SelectionChanged += (s, e) => Selecionar();

        Controls.Add(_grid);
        Controls.Add(botoes);
        Controls.Add(painel);
        Tema.Aplicar(this);
        Carregar();
    }

    private int? Id() => _grid.CurrentRow == null || _grid.SelectedRows.Count == 0
        ? null : Convert.ToInt32(_grid.CurrentRow.Cells[_idColuna].Value);

    private void Carregar()
    {
        try
        {
            string cols = string.Join(",", _campos.Select(c => c.Coluna));
            _grid.DataSource = Conexao.Consultar($"SELECT {_idColuna},{cols} FROM {_tabela} ORDER BY {_idColuna}");
        }
        catch (Exception ex) { MessageBox.Show("Erro: " + ex.Message); }
    }

    private void Selecionar()
    {
        if (_grid.SelectedRows.Count == 0 || _grid.CurrentRow == null) return;
        foreach (var c in _campos)
            _txt[c.Coluna].Text = _grid.CurrentRow.Cells[c.Coluna].Value?.ToString() ?? "";
    }

    private void Limpar()
    {
        foreach (var t in _txt.Values) t.Clear();
        _grid.ClearSelection();
    }

    private NpgsqlParameter[] Parametros() => _campos
        .Select(c => new NpgsqlParameter("@" + c.Coluna, _txt[c.Coluna].Text.Trim())).ToArray();

    private bool Valido()
    {
        foreach (var c in _campos)
            if (string.IsNullOrWhiteSpace(_txt[c.Coluna].Text))
            {
                MessageBox.Show($"Informe o campo {c.Rotulo}.");
                return false;
            }
        return true;
    }

    private void Inserir(object? s, EventArgs e)
    {
        if (!Valido()) return;
        try
        {
            string cols = string.Join(",", _campos.Select(c => c.Coluna).Concat(_extras.Keys));
            string vals = string.Join(",", _campos.Select(c => "@" + c.Coluna).Concat(_extras.Values));
            Conexao.Executar($"INSERT INTO {_tabela} ({cols}) VALUES ({vals})", Parametros());
            Carregar(); Limpar();
        }
        catch (Exception ex) { MessageBox.Show("Erro: " + ex.Message); }
    }

    private void Alterar(object? s, EventArgs e)
    {
        var id = Id();
        if (id == null) { MessageBox.Show("Selecione um registro."); return; }
        if (!Valido()) return;
        try
        {
            string set = string.Join(",", _campos.Select(c => $"{c.Coluna}=@{c.Coluna}"));
            var ps = Parametros().Append(new NpgsqlParameter("@id", id)).ToArray();
            Conexao.Executar($"UPDATE {_tabela} SET {set} WHERE {_idColuna}=@id", ps);
            Carregar();
        }
        catch (Exception ex) { MessageBox.Show("Erro: " + ex.Message); }
    }

    private void Excluir(object? s, EventArgs e)
    {
        var id = Id();
        if (id == null) { MessageBox.Show("Selecione um registro."); return; }
        if (MessageBox.Show("Excluir este registro?", "Confirmar", MessageBoxButtons.YesNo) != DialogResult.Yes) return;
        try
        {
            Conexao.Executar($"DELETE FROM {_tabela} WHERE {_idColuna}=@id", new NpgsqlParameter("@id", id));
            Carregar(); Limpar();
        }
        catch (PostgresException)
        {
            MessageBox.Show("Não foi possível excluir: este registro está sendo usado em outras tabelas (ex.: pedidos ou produtos).");
        }
    }
}
