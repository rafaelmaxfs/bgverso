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

/* Copia os dados da conta para a página de Perfil e para o perfil local (usado pelo checkout em pedido.js).
   Todos os campos de Dados são atualizados, com as mesmas máscaras de perfil-mascaras.js. */
const CAMPOS_DADOS_CONTA = ['nome', 'sobrenome', 'email', 'cpf', 'telefone', 'whatsapp'];

function preencherPerfilComConta(usuario) {
    let perfilAtual = {};
    try { perfilAtual = JSON.parse(localStorage.getItem('bgverso_perfil')) || {}; } catch (erro) { perfilAtual = {}; }

    const perfil = {
        ...perfilAtual,
        nome: usuario.nome || '',
        sobrenome: usuario.sobrenome || '',
        email: usuario.email || '',
        cpf: usuario.cpf || '',
        telefone: usuario.telefone || '',
        whatsapp: perfilAtual.whatsapp || ''
    };
    localStorage.setItem('bgverso_perfil', JSON.stringify(perfil));

    CAMPOS_DADOS_CONTA.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.value = perfil[id] || '';
        /* Aplica a máscara (CPF/telefone) e avisa os outros scripts que o valor mudou */
        el.dispatchEvent(new Event('input', { bubbles: true }));
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
        await sincronizarPerfilDoBanco();
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
async function iniciarSessao(resultado) {
    localStorage.setItem(CHAVE_TOKEN, resultado.token);
    preencherPerfilComConta(resultado.usuario);
    mostrarEstadoConta(resultado.usuario);
    await sincronizarPerfilDoBanco();
}

/* ----- Gravação no banco (PUT/POST/DELETE em /perfil) ----- */

/* Envia os dados pessoais da página ao banco. Em caso de erro, relê o banco para desfazer a edição local */
async function salvarDadosNoBanco() {
    if (!lerToken()) return;
    const valor = (id) => (document.getElementById(id)?.value || '').trim();
    try {
        const r = await chamarConta('/perfil', {
            metodo: 'PUT',
            dados: {
                nome: valor('nome'),
                sobrenome: valor('sobrenome'),
                email: valor('email'),
                cpf: valor('cpf'),
                telefone: valor('telefone')
            },
            comToken: true
        });
        preencherPerfilComConta(r.usuario);
        mostrarErro('erro-dados', '');
    } catch (erro) {
        mostrarErro('erro-dados', erro.message);
        await sincronizarPerfilDoBanco();
    }
}

/* Campos de Dados salvos ao sair do campo (mesmo gatilho de perfil.js) */
function configurarSalvarDados() {
    document.addEventListener('change', (evento) => {
        if (evento.target.closest('.cartao-dados')) salvarDadosNoBanco();
    });
}

/* Endereço alterado na lista. Se o id existe no banco (número), faz PUT; se não (id local), faz POST.
   Só grava quando o endereço está completo, para não gerar erro de validação a cada tecla. */
async function salvarEnderecoNoBanco(cartao) {
    if (!lerToken()) return;
    const campos = {};
    cartao.querySelectorAll('[data-campo]').forEach((el) => { campos[el.dataset.campo] = el.value.trim(); });
    if (!enderecoCompleto(campos)) return;

    const idBanco = /^\d+$/.test(cartao.dataset.id) ? cartao.dataset.id : null;
    try {
        if (idBanco) {
            await chamarConta('/perfil/enderecos/' + idBanco, { metodo: 'PUT', dados: campos, comToken: true });
        } else {
            await chamarConta('/perfil/enderecos', { dados: campos, comToken: true });
        }
        await sincronizarPerfilDoBanco();
    } catch (erro) {
        alert(erro.message);
        await sincronizarPerfilDoBanco();
    }
}

/* Campos mínimos exigidos pelo servidor (ver ValidarEndereco em Perfil.cs) */
function enderecoCompleto(c) {
    return c.cep.replace(/\D/g, '').length === 8 && c.rua && c.numero && c.bairro && c.cidade && c.uf.length === 2;
}

async function removerEnderecoNoBanco(id) {
    if (!lerToken()) return;
    try {
        await chamarConta('/perfil/enderecos/' + id, { metodo: 'DELETE', comToken: true });
    } catch (erro) {
        alert(erro.message);
        await sincronizarPerfilDoBanco();
    }
}

async function removerCartaoNoBanco(id) {
    if (!lerToken()) return;
    try {
        await chamarConta('/perfil/cartoes/' + id, { metodo: 'DELETE', comToken: true });
    } catch (erro) {
        alert(erro.message);
        await sincronizarPerfilDoBanco();
    }
}

/* Busca o perfil no banco (GET /perfil) e atualiza os espelhos usados pelo site:
   bgverso_perfil (dados), bgverso_enderecos (endereços) e bgverso_cartoes (cartões).
   O banco é a fonte da verdade; o navegador só guarda uma cópia. */
async function sincronizarPerfilDoBanco() {
    if (!lerToken()) return;
    try {
        const p = await chamarConta('/perfil', { metodo: 'GET', comToken: true });

        preencherPerfilComConta(p.usuario);

        /* Endereços: o campo "apelido" e os demais vêm do banco */
        const enderecos = p.enderecos.map((e) => ({ ...e }));
        salvarEnderecos(enderecos);

        /* Cartões: o formato do site é { id, bandeira, final, titular, validade } */
        salvarCartoes(p.cartoes.map((c) => ({ ...c })));

        renderizarEnderecos();
        renderizarCartoes();
        atualizarPesquisa();
    } catch (erro) {
        /* Sessão inválida: encerra a conta local. Outros erros mantêm a cópia atual */
        if (erro.status === 401) {
            localStorage.removeItem(CHAVE_TOKEN);
            mostrarEstadoConta(null);
        }
    }
}

/* Observa as ações da página (sem impedi-las: perfil.js já atualiza a tela e o localStorage) */
function configurarGravacaoDoPerfil() {
    /* Alteração de um campo de endereço */
    document.getElementById('lista-enderecos')?.addEventListener('change', (evento) => {
        const cartao = evento.target.closest('.cartao-endereco');
        if (cartao) salvarEnderecoNoBanco(cartao);
    });

    /* Remover endereço ou cartão (botões com data-acao, criados por perfil.js) */
    document.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-acao]');
        if (!botao) return;
        if (botao.dataset.acao === 'remover-endereco') removerEnderecoNoBanco(botao.dataset.id);
        if (botao.dataset.acao === 'remover-cartao') removerCartaoNoBanco(botao.dataset.id);
    });

    /* Cartão novo: o formulário (perfil.js) só salva quando a validação passa.
       Então, se o formulário foi válido, o último cartão salvo é o que deve ir ao banco. */
    /* Fase de captura: roda antes do handler de perfil.js, então a contagem "antes" é a real */
    let quantidadeAntes = 0;
    document.getElementById('form-cartao')?.addEventListener('submit', () => {
        quantidadeAntes = lerCartoes().length;
    }, true);
    document.getElementById('form-cartao')?.addEventListener('submit', () => {
        setTimeout(() => {
            if (lerCartoes().length <= quantidadeAntes) return;   /* validação falhou: nada novo foi salvo */
            enviarCartaoParaBanco({
                numero: document.getElementById('cartao-numero').value,
                titular: document.getElementById('cartao-titular').value,
                validade: document.getElementById('cartao-validade').value,
                cvv: document.getElementById('cartao-cvv').value
            });
        }, 0);
    });
}

/* Cartão novo: o servidor descarta o CVV e guarda só bandeira e últimos 4 dígitos */
async function enviarCartaoParaBanco(dados) {
    try {
        await chamarConta('/perfil/cartoes', { dados, comToken: true });
        await sincronizarPerfilDoBanco();
    } catch (erro) {
        alert(erro.message);
        await sincronizarPerfilDoBanco();
    }
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
            await iniciarSessao(resultado);
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
            await iniciarSessao(resultado);
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

    configurarSalvarDados();
    configurarGravacaoDoPerfil();
    restaurarSessao();
}

configurarConta();
