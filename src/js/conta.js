/* ===== Conta do cliente (perfil.html): cadastro e login pelo servidor C# (DeliveryApp/Contas.cs) ===== */

const URL_SERVIDOR_CONTA = 'http://localhost:5050';
const CHAVE_SESSAO = 'bgverso_sessao';

function lerSessao() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_SESSAO)) || null;
    } catch (erro) {
        return null;
    }
}

/* Chama uma rota do servidor. Lança erro com a mensagem do servidor, ou de conexão */
async function chamarConta(rota, dados) {
    let resposta;
    try {
        resposta = await fetch(URL_SERVIDOR_CONTA + rota, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
    } catch (erro) {
        throw new Error('Não foi possível conectar ao servidor. Verifique se o programa DeliveryApp está aberto.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) throw new Error(corpo.erro || 'Erro ao processar a conta (HTTP ' + resposta.status + ').');
    return corpo;
}

/* Copia os dados da conta para o perfil local, que o checkout (pedido.js) usa */
function preencherPerfilComConta(usuario) {
    let perfilAtual = {};
    try { perfilAtual = JSON.parse(localStorage.getItem('bgverso_perfil')) || {}; } catch (erro) { perfilAtual = {}; }

    const perfil = {
        ...perfilAtual,
        nome: usuario.nome,
        sobrenome: usuario.sobrenome,
        email: usuario.email,
        cpf: usuario.cpf,
        telefone: usuario.telefone
    };
    localStorage.setItem('bgverso_perfil', JSON.stringify(perfil));
    ['nome', 'sobrenome', 'email', 'cpf', 'telefone'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = perfil[id] || '';
    });
}

function atualizarPainelConta() {
    const sessao = lerSessao();
    const painel = document.getElementById('painel-conta-logada');
    const formEntrar = document.getElementById('form-entrar');
    const formCadastro = document.getElementById('form-cadastro');
    if (!painel) return;

    painel.hidden = !sessao;
    if (formEntrar) formEntrar.hidden = !!sessao;
    if (formCadastro) formCadastro.hidden = !!sessao;
    if (sessao) document.getElementById('conta-nome').textContent = sessao.usuario.nome;
}

function mostrarErro(id, mensagem) {
    const el = document.getElementById(id);
    if (el) el.textContent = mensagem || '';
}

function configurarConta() {
    const formEntrar = document.getElementById('form-entrar');
    const formCadastro = document.getElementById('form-cadastro');
    const btnSair = document.getElementById('btn-sair');
    if (!formEntrar || !formCadastro) return;

    formEntrar.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErro('erro-entrar', '');
        try {
            const resultado = await chamarConta('/login', {
                email: document.getElementById('entrar-email').value.trim(),
                senha: document.getElementById('entrar-senha').value
            });
            localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ usuario: resultado.usuario }));
            preencherPerfilComConta(resultado.usuario);
            document.getElementById('entrar-senha').value = '';
            atualizarPainelConta();
        } catch (erro) {
            mostrarErro('erro-entrar', erro.message);
        }
    });

    formCadastro.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErro('erro-cadastro', '');
        try {
            const resultado = await chamarConta('/cadastro', {
                nome: document.getElementById('cadastro-nome').value.trim(),
                sobrenome: document.getElementById('cadastro-sobrenome').value.trim(),
                email: document.getElementById('cadastro-email').value.trim(),
                cpf: document.getElementById('cadastro-cpf').value,
                telefone: document.getElementById('cadastro-telefone').value,
                senha: document.getElementById('cadastro-senha').value
            });
            localStorage.setItem(CHAVE_SESSAO, JSON.stringify({ usuario: resultado.usuario }));
            preencherPerfilComConta(resultado.usuario);
            formCadastro.reset();
            atualizarPainelConta();
        } catch (erro) {
            mostrarErro('erro-cadastro', erro.message);
        }
    });

    btnSair?.addEventListener('click', () => {
        localStorage.removeItem(CHAVE_SESSAO);
        atualizarPainelConta();
    });

    atualizarPainelConta();
}

configurarConta();
