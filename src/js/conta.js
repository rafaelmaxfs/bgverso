/* ===== Conta do cliente (perfil.html): cadastro, login e sessão pelo servidor C# (DeliveryApp/Contas.cs) ===== */

const URL_SERVIDOR_CONTA = 'http://localhost:5050';
/* Só o token é guardado no navegador. Os dados do cliente vêm sempre do servidor. */
const CHAVE_TOKEN = 'bgverso_token';

function lerToken() {
    return localStorage.getItem(CHAVE_TOKEN);
}

/* Chama uma rota do servidor. Lança erro com a mensagem do servidor, ou de conexão */
async function chamarConta(rota, { metodo = 'POST', dados = null, comToken = false } = {}) {
    const cabecalhos = {};
    if (dados) cabecalhos['Content-Type'] = 'application/json';
    if (comToken && lerToken()) cabecalhos['Authorization'] = 'Bearer ' + lerToken();

    let resposta;
    try {
        resposta = await fetch(URL_SERVIDOR_CONTA + rota, {
            method: metodo,
            headers: cabecalhos,
            body: dados ? JSON.stringify(dados) : undefined
        });
    } catch (erro) {
        throw new Error('Não foi possível conectar ao servidor. Verifique se o programa DeliveryApp está aberto.');
    }
    const corpo = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        const erro = new Error(corpo.erro || 'Erro ao processar a conta (HTTP ' + resposta.status + ').');
        erro.status = resposta.status;
        throw erro;
    }
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

/* Mostra o painel de conta (logado) ou os formulários (deslogado) */
function mostrarEstadoConta(usuario) {
    const painel = document.getElementById('painel-conta-logada');
    const formEntrar = document.getElementById('form-entrar');
    const formCadastro = document.getElementById('form-cadastro');
    if (!painel) return;

    painel.hidden = !usuario;
    if (formEntrar) formEntrar.hidden = !!usuario;
    if (formCadastro) formCadastro.hidden = !!usuario;
    if (usuario) document.getElementById('conta-nome').textContent = usuario.nome;
}

/* Ao abrir a página: confere o token no servidor. Token inválido/expirado é descartado */
async function restaurarSessao() {
    if (!lerToken()) return mostrarEstadoConta(null);
    try {
        const resultado = await chamarConta('/sessao', { metodo: 'GET', comToken: true });
        preencherPerfilComConta(resultado.usuario);
        mostrarEstadoConta(resultado.usuario);
    } catch (erro) {
        localStorage.removeItem(CHAVE_TOKEN);
        mostrarEstadoConta(null);
    }
}

/* Valida o formato do CPF no navegador (o servidor confere os dígitos verificadores) */
function cpfTemOnzeDigitos(valor) {
    return String(valor || '').replace(/\D/g, '').length === 11;
}

/* Bloqueia o botão durante o envio, para não enviar duas vezes */
async function comBotaoBloqueado(botao, operacao) {
    const textoOriginal = botao.textContent;
    botao.disabled = true;
    botao.textContent = 'Aguarde...';
    try {
        return await operacao();
    } finally {
        botao.disabled = false;
        botao.textContent = textoOriginal;
    }
}

function mostrarErro(id, mensagem) {
    const el = document.getElementById(id);
    if (el) el.textContent = mensagem || '';
}

/* Guarda o token e mostra a conta. Chamado após login ou cadastro bem-sucedidos */
function iniciarSessao(resultado) {
    localStorage.setItem(CHAVE_TOKEN, resultado.token);
    preencherPerfilComConta(resultado.usuario);
    mostrarEstadoConta(resultado.usuario);
}

function configurarConta() {
    const formEntrar = document.getElementById('form-entrar');
    const formCadastro = document.getElementById('form-cadastro');
    const btnSair = document.getElementById('btn-sair');
    if (!formEntrar || !formCadastro) return;

    formEntrar.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErro('erro-entrar', '');
        const email = document.getElementById('entrar-email').value.trim();
        const senha = document.getElementById('entrar-senha').value;
        if (!email || !senha) return mostrarErro('erro-entrar', 'Informe e-mail e senha.');

        const botao = formEntrar.querySelector('button[type="submit"]');
        try {
            const resultado = await comBotaoBloqueado(botao, () =>
                chamarConta('/login', { dados: { email, senha } }));
            iniciarSessao(resultado);
            formEntrar.reset();
        } catch (erro) {
            mostrarErro('erro-entrar', erro.message);
        }
    });

    formCadastro.addEventListener('submit', async (evento) => {
        evento.preventDefault();
        mostrarErro('erro-cadastro', '');
        const dados = {
            nome: document.getElementById('cadastro-nome').value.trim(),
            sobrenome: document.getElementById('cadastro-sobrenome').value.trim(),
            email: document.getElementById('cadastro-email').value.trim(),
            cpf: document.getElementById('cadastro-cpf').value,
            telefone: document.getElementById('cadastro-telefone').value,
            senha: document.getElementById('cadastro-senha').value
        };
        const confirmacao = document.getElementById('cadastro-senha-confirma').value;

        if (Object.values(dados).some((v) => !v)) return mostrarErro('erro-cadastro', 'Preencha todos os campos.');
        if (dados.senha !== confirmacao) return mostrarErro('erro-cadastro', 'As senhas não conferem.');
        if (!cpfTemOnzeDigitos(dados.cpf)) return mostrarErro('erro-cadastro', 'O CPF precisa ter 11 dígitos.');

        const botao = formCadastro.querySelector('button[type="submit"]');
        try {
            const resultado = await comBotaoBloqueado(botao, () => chamarConta('/cadastro', { dados }));
            iniciarSessao(resultado);
            formCadastro.reset();
        } catch (erro) {
            mostrarErro('erro-cadastro', erro.message);
        }
    });

    btnSair?.addEventListener('click', async () => {
        try {
            await chamarConta('/logout', { dados: {}, comToken: true });
        } catch (erro) {
            // Mesmo sem conexão, o token local é removido
        }
        localStorage.removeItem(CHAVE_TOKEN);
        mostrarEstadoConta(null);
    });

    restaurarSessao();
}

configurarConta();
