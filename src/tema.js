/* ===== Alternância de tema claro / escuro (botão .btn-destaque) ===== */
(function () {
    const CHAVE_TEMA = 'bgverso-tema';
    const ESCURO = 'escuro';
    const CLARO = 'claro';
    const raiz = document.documentElement;

    function lerTemaSalvo() {
        try {
            return localStorage.getItem(CHAVE_TEMA);
        } catch (erro) {
            return null;
        }
    }

    function salvarTema(tema) {
        try {
            localStorage.setItem(CHAVE_TEMA, tema);
        } catch (erro) {
            /* Armazenamento indisponível (ex.: modo privado): o tema vale só nesta página */
        }
    }

    /* Aplica o tema no <html>; as regras html[data-tema="escuro"] do CSS fazem o resto */
    function aplicarTema(tema) {
        raiz.dataset.tema = tema === ESCURO ? ESCURO : CLARO;
        return raiz.dataset.tema === ESCURO;
    }

    /* Aplicado já no <head> (script síncrono) para evitar piscar o tema claro */
    aplicarTema(lerTemaSalvo());

    document.addEventListener('DOMContentLoaded', () => {
        const botao = document.querySelector('.btn-destaque');
        if (!botao) return;

        const atualizarBotao = (escuro) => {
            botao.setAttribute('aria-pressed', String(escuro));
            botao.setAttribute('aria-label', escuro ? 'Ativar modo claro' : 'Ativar modo escuro');
            botao.title = escuro ? 'Ativar modo claro' : 'Ativar modo escuro';
        };

        atualizarBotao(raiz.dataset.tema === ESCURO);

        botao.addEventListener('click', () => {
            const tema = raiz.dataset.tema === ESCURO ? CLARO : ESCURO;
            const escuro = aplicarTema(tema);
            salvarTema(tema);
            atualizarBotao(escuro);
        });
    });
})();
