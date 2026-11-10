namespace DeliveryApp;

// Aplica o visual padrão do BGVerso aos formulários (cores e fonte).
public static class Tema
{
    public static readonly Color Fundo = Color.FromArgb(255, 248, 230);
    public static readonly Font Fonte = new("Segoe UI", 10f);

    public static void Aplicar(Control controle)
    {
        controle.Font = Fonte;
        controle.BackColor = Fundo;
        foreach (Control filho in controle.Controls)
            Aplicar(filho);
    }
}
