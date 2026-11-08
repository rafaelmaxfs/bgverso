/* ===== Dados e endereço do cliente (perfil.html): salvos no localStorage para o checkout ===== */
const CHAVE_PERFIL = 'bgverso_perfil';
const CAMPOS_PERFIL = ['nome', 'sobrenome', 'email', 'cpf', 'telefone', 'whatsapp'];

function lerPerfilSalvo() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_PERFIL)) || {};
    } catch (erro) {
        return {};
    }
}

function salvarPerfilDaPagina() {
    const dados = {};
    CAMPOS_PERFIL.forEach((id) => {
        const el = document.getElementById(id);
        dados[id] = el ? el.value.trim() : '';
    });
    localStorage.setItem(CHAVE_PERFIL, JSON.stringify(dados));
}

function restaurarPerfilNaPagina() {
    const dados = lerPerfilSalvo();
    CAMPOS_PERFIL.forEach((id) => {
        const el = document.getElementById(id);
        if (el && dados[id]) el.value = dados[id].slice(0, el.maxLength > 0 ? el.maxLength : undefined);
    });
}

restaurarPerfilNaPagina();

/* Salva ao sair de qualquer campo de Dados (evento change) */
document.addEventListener('change', (evento) => {
    if (evento.target.closest('.cartao-dados')) salvarPerfilDaPagina();
});

/* ----- Endereços salvos: cada endereço é um cartão editável (nome + campos + remover) ----- */
/* [campo, rótulo, tamanho máximo, placeholder] */
const CAMPOS_FORM_ENDERECO = [
    ['cep', 'CEP:', 9, '00000-000'],
    ['numero', 'Número:', 10, ''],
    ['rua', 'Rua:', 100, ''],
    ['complemento', 'Complemento (opcional):', 50, ''],
    ['bairro', 'Bairro:', 60, ''],
    ['referencia', 'Ponto de referência (opcional):', 100, ''],
    ['cidade', 'Cidade:', 60, ''],
    ['uf', 'UF:', 2, 'SP']
];

/* CEP: 00000-000 (máximo de 8 dígitos) */
function mascaraCepEndereco(valor) {
    const d = valor.replace(/\D/g, '').slice(0, 8);
    return d.length > 5 ? d.slice(0, 5) + '-' + d.slice(5) : d;
}

function criarCampoEndereco(endereco, [campo, rotulo, tamanhoMaximo, placeholder]) {
    const bloco = document.createElement('div');
    const id = 'end-' + endereco.id + '-' + campo;

    const label = document.createElement('label');
    label.htmlFor = id;
    label.textContent = rotulo;

    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.maxLength = tamanhoMaximo;
    input.placeholder = placeholder;
    input.value = endereco[campo] || '';
    input.dataset.campo = campo;

    bloco.append(label, input);
    return bloco;
}

function criarCartaoEndereco(endereco) {
    const cartao = document.createElement('div');
    cartao.className = 'cartao coluna cartao-endereco';
    cartao.dataset.id = endereco.id;

    const apelido = document.createElement('input');
    apelido.type = 'text';
    apelido.className = 'apelido-endereco';
    apelido.maxLength = 30;
    apelido.value = endereco.apelido || '';
    apelido.dataset.campo = 'apelido';
    apelido.setAttribute('aria-label', 'Nome do endereço');

    const grade = document.createElement('div');
    grade.className = 'grade-campos';
    CAMPOS_FORM_ENDERECO.forEach((config) => grade.appendChild(criarCampoEndereco(endereco, config)));

    const acoes = document.createElement('div');
    acoes.className = 'acoes-form';

    const remover = document.createElement('button');
    remover.className = 'btn secundario';
    remover.type = 'button';
    remover.dataset.acao = 'remover-endereco';
    remover.dataset.id = endereco.id;
    remover.textContent = 'Remover';

    acoes.appendChild(remover);
    cartao.append(apelido, grade, acoes);
    return cartao;
}

function renderizarEnderecos() {
    const lista = document.getElementById('lista-enderecos');
    if (!lista) return;

    const enderecos = lerEnderecos();
    lista.innerHTML = '';

    if (!enderecos.length) {
        const vazio = document.createElement('p');
        vazio.textContent = 'Nenhum endereço salvo.';
        lista.appendChild(vazio);
        return;
    }

    enderecos.forEach((endereco) => lista.appendChild(criarCartaoEndereco(endereco)));
}

/* Grava no armazenamento os valores atuais do cartão (nome e campos) */
function salvarEnderecoDoCartao(cartao) {
    const enderecos = lerEnderecos();
    const indice = enderecos.findIndex((e) => e.id === cartao.dataset.id);
    if (indice < 0) return;

    const atualizado = { ...enderecos[indice] };
    cartao.querySelectorAll('[data-campo]').forEach((campo) => {
        atualizado[campo.dataset.campo] = campo.value.trim();
    });

    enderecos[indice] = atualizado;
    salvarEnderecos(enderecos);
}

function adicionarEndereco() {
    const novo = { id: gerarIdEndereco(), apelido: 'Novo endereço' };
    CAMPOS_ENDERECO.forEach((campo) => { novo[campo] = ''; });

    const enderecos = lerEnderecos();
    enderecos.push(novo);
    salvarEnderecos(enderecos);

    renderizarEnderecos();
    atualizarPesquisa();

    const lista = document.getElementById('lista-enderecos');
    const apelido = lista.lastElementChild.querySelector('.apelido-endereco');
    apelido.focus();
    apelido.select();
}

function configurarEnderecos() {
    const lista = document.getElementById('lista-enderecos');
    const botaoAdicionar = document.getElementById('btn-adicionar-endereco');
    if (!lista || !botaoAdicionar) return;

    botaoAdicionar.addEventListener('click', adicionarEndereco);

    lista.addEventListener('input', (evento) => {
        const campo = evento.target;
        if (campo.dataset.campo === 'cep') campo.value = mascaraCepEndereco(campo.value);
        if (campo.dataset.campo === 'numero') campo.value = campo.value.replace(/\D/g, '');
    });

    lista.addEventListener('change', (evento) => {
        const cartao = evento.target.closest('.cartao-endereco');
        if (cartao) salvarEnderecoDoCartao(cartao);
    });

    lista.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-acao="remover-endereco"]');
        if (!botao) return;
        salvarEnderecos(lerEnderecos().filter((e) => e.id !== botao.dataset.id));
        renderizarEnderecos();
        atualizarPesquisa();
    });
}

renderizarEnderecos();
configurarEnderecos();
