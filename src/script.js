const main = document.querySelector('main');
const linksNav = document.querySelectorAll('#div-nav-down ul li a');
const categorias = document.querySelectorAll('.categoria');
const menu = document.querySelector('.header .menu');
const botaoMenu = document.querySelector('.btn-menu');

botaoMenu.addEventListener('click', () => {
    const aberto = menu.classList.toggle('aberto');
    botaoMenu.setAttribute('aria-expanded', String(aberto));
    botaoMenu.setAttribute('aria-label', aberto ? 'Fechar menu' : 'Abrir menu');
});

menu.querySelectorAll('.menu-links a').forEach((link) => {
    link.addEventListener('click', () => {
        menu.classList.remove('aberto');
        botaoMenu.setAttribute('aria-expanded', 'false');
        botaoMenu.setAttribute('aria-label', 'Abrir menu');
    });
});

const observador = new IntersectionObserver((entradas) => {
    entradas.forEach((entrada) => {
        if (!entrada.isIntersecting) return;

        const categoria = entrada.target;

        linksNav.forEach((link) => {
            link.classList.toggle('ativo', link.getAttribute('href') === '#' + categoria.id);
        });
    });
}, { root: window.matchMedia('(max-width: 768px)').matches ? null : main, threshold: 0.35 });

categorias.forEach((categoria) => observador.observe(categoria));

/* ===== Scroll suave ao clicar nos links da barra lateral ===== */
const MOBILE = window.matchMedia('(max-width: 768px)');
const movimentoReduzido = window.matchMedia('(prefers-reduced-motion: reduce)');

const DURACAO_ROLAGEM = 500; /* ms */
let rolagemAtiva = null;

/* Easing: começa devagar, acelera no meio e desacelera no fim */
function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/* Anima a posição de rolagem durante `duracao` ms, frame a frame */
function animarRolagem(obterPosicao, definirPosicao, destino, duracao) {
    if (rolagemAtiva !== null) cancelAnimationFrame(rolagemAtiva);

    const inicio = obterPosicao();
    const distancia = destino - inicio;

    if (distancia === 0 || duracao <= 0) {
        definirPosicao(destino);
        rolagemAtiva = null;
        return;
    }

    let instanteInicial = null;
    const passo = (agora) => {
        if (instanteInicial === null) instanteInicial = agora;
        const progresso = Math.min((agora - instanteInicial) / duracao, 1);
        definirPosicao(inicio + distancia * easeInOutCubic(progresso));
        rolagemAtiva = progresso < 1 ? requestAnimationFrame(passo) : null;
    };

    rolagemAtiva = requestAnimationFrame(passo);
}

/* Mobile: altura do cabeçalho + barra de navegação fixos no topo, para o destino não ficar escondido */
function alturaFixaMobile() {
    const cabecalho = document.querySelector('.header');
    const navegacao = document.querySelector('body > nav');
    const altura = (cabecalho ? cabecalho.offsetHeight : 0) + (navegacao ? navegacao.offsetHeight : 0);
    return altura + 8;
}

function rolarPara(destino) {
    const duracao = movimentoReduzido.matches ? 0 : DURACAO_ROLAGEM;

    /* Mobile: a janela rola. Desktop: o contentor é o main, que tem overflow próprio. */
    if (MOBILE.matches || !main) {
        const alvo = destino.getBoundingClientRect().top + window.scrollY - alturaFixaMobile();
        animarRolagem(() => window.scrollY, (y) => window.scrollTo(0, y), alvo, duracao);
        return;
    }

    const alvo = destino.getBoundingClientRect().top - main.getBoundingClientRect().top + main.scrollTop;
    animarRolagem(() => main.scrollTop, (y) => { main.scrollTop = y; }, alvo, duracao);
}

linksNav.forEach((link) => {
    link.addEventListener('click', (evento) => {
        const id = link.getAttribute('href');
        if (!id || !id.startsWith('#') || id === '#') return;

        const destino = document.querySelector(id);
        if (!destino) return;

        evento.preventDefault();
        rolarPara(destino);
        history.replaceState(null, '', id);
    });
});

/* ===== Carrinho (compartilhado entre index.html e carrinho.html via localStorage) ===== */
const CHAVE_CARRINHO = 'bgverso_carrinho';
const FRETE_CARRINHO = 17.32;
const QTD_MAX = 99;

function lerCarrinho() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CARRINHO)) || {};
    } catch (erro) {
        return {};
    }
}

function salvarCarrinho(carrinho) {
    localStorage.setItem(CHAVE_CARRINHO, JSON.stringify(carrinho));
}

/* ===== Pedidos finalizados (guardados ao finalizar em carrinho.html, exibidos em pedidos.html) ===== */
const CHAVE_PEDIDOS = 'bgverso_pedidos';

function lerPedidosRealizados() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_PEDIDOS)) || [];
    } catch (erro) {
        return [];
    }
}

function salvarPedidosRealizados(pedidos) {
    localStorage.setItem(CHAVE_PEDIDOS, JSON.stringify(pedidos));
}

function formatarPreco(valor) {
    return 'R$ ' + valor.toFixed(2).replace('.', ',');
}

/* Lê os dados de um cartão (index.html ou item do carrinho) */
function dadosDoCartao(cartao) {
    return {
        id: cartao.dataset.id,
        produto: Number(cartao.dataset.produto),
        nome: cartao.dataset.nome,
        imagem: cartao.dataset.imagem,
        preco: Number(cartao.dataset.preco)
    };
}

/* +1 adiciona ao carrinho; -1 remove; ao chegar a zero o item sai do carrinho */
function alterarQuantidade(dados, delta) {
    const carrinho = lerCarrinho();
    const atual = carrinho[dados.id] ? carrinho[dados.id].qtd : 0;
    const nova = Math.min(Math.max(atual + delta, 0), QTD_MAX);

    if (nova === 0) {
        delete carrinho[dados.id];
    } else {
        carrinho[dados.id] = { ...dados, qtd: nova };
    }

    salvarCarrinho(carrinho);
    return nova;
}

/* index.html: mostra no cartão a quantidade já guardada no carrinho */
function sincronizarCartoes() {
    const carrinho = lerCarrinho();
    document.querySelectorAll('.sabor[data-id]').forEach((cartao) => {
        cartao.dataset.nome = cartao.querySelector('p').textContent.trim();
        cartao.dataset.imagem = cartao.querySelector('img').getAttribute('src');

        const qtd = carrinho[cartao.dataset.id] ? carrinho[cartao.dataset.id].qtd : 0;
        const qtdEl = cartao.querySelector('.qtd');
        qtdEl.dataset.qtd = qtd;
        qtdEl.textContent = '(' + qtd + ')';
    });
}

/* Imagem do produto pelo código (itens antigos do carrinho podem ter guardado a imagem anterior) */
function imagemDoItem(item) {
    return Number.isInteger(item.produto)
        ? 'src/img/produtos/produto-' + item.produto + '.svg'
        : item.imagem;
}

/* carrinho.html: monta a lista de itens a partir do carrinho guardado */
function renderizarCarrinho() {
    const lista = document.getElementById('lista-itens');
    if (!lista) return;

    const carrinho = lerCarrinho();
    const ids = Object.keys(carrinho);
    lista.innerHTML = '';

    if (!ids.length) {
        const vazio = document.createElement('p');
        vazio.className = 'carrinho-vazio';
        vazio.textContent = 'Seu carrinho está vazio.';
        lista.appendChild(vazio);
        return;
    }

    ids.forEach((id) => {
        const item = carrinho[id];
        const cartao = document.createElement('div');
        cartao.className = 'cartao item-carrinho';
        cartao.dataset.id = item.id;
        cartao.dataset.produto = item.produto;
        cartao.dataset.nome = item.nome;
        cartao.dataset.imagem = item.imagem;
        cartao.dataset.preco = item.preco;

        const img = document.createElement('img');
        img.src = imagemDoItem(item);
        img.alt = item.nome;

        const descricao = document.createElement('p');
        descricao.className = 'item-descricao';
        descricao.textContent = item.nome;

        const preco = document.createElement('p');
        preco.className = 'item-preco';
        preco.textContent = formatarPreco(item.qtd * item.preco);

        const controles = document.createElement('div');
        controles.className = 'item-quantidade';
        controles.innerHTML = '<button class="btn-qtd" type="button" data-acao="mais" aria-label="Aumentar quantidade">+</button>'
            + '<span class="qtd" data-qtd="' + item.qtd + '">(' + item.qtd + ')</span>'
            + '<button class="btn-qtd" type="button" data-acao="menos" aria-label="Diminuir quantidade">-</button>';

        cartao.append(img, descricao, preco, controles);
        lista.appendChild(cartao);
    });
}

/* carrinho.html: subtotal, frete e total */
function atualizarResumo() {
    const carrinho = lerCarrinho();
    const subtotal = Object.values(carrinho).reduce((soma, item) => soma + item.qtd * item.preco, 0);
    const frete = subtotal > 0 ? FRETE_CARRINHO : 0;

    const elementos = {
        subtotal: formatarPreco(subtotal),
        frete: formatarPreco(frete),
        total: formatarPreco(subtotal + frete),
        'valor-frete': formatarPreco(frete)
    };

    Object.entries(elementos).forEach(([id, texto]) => {
        const el = document.getElementById(id);
        if (el) el.textContent = texto;
    });
}

document.addEventListener('click', (evento) => {
    const botao = evento.target.closest('[data-acao]');
    if (!botao || (botao.dataset.acao !== 'mais' && botao.dataset.acao !== 'menos')) return;

    const cartao = botao.closest('[data-id]');
    if (!cartao) return;

    alterarQuantidade(dadosDoCartao(cartao), botao.dataset.acao === 'mais' ? 1 : -1);

    sincronizarCartoes();
    renderizarCarrinho();
    atualizarResumo();
    atualizarPesquisa();
});

/* ===== Pedidos realizados (pedidos.html): só os pedidos finalizados neste navegador ===== */
function criarAvisoPedidos(texto) {
    const aviso = document.createElement('p');
    aviso.className = 'pedidos-vazio';
    aviso.textContent = texto;
    return aviso;
}

/* Itens no formato "(1x) Nome, (2x) Nome" */
function textoItensPedido(pedido) {
    return pedido.itens
        .map((item) => '(' + item.quantidade + 'x) ' + item.nome)
        .join(', ');
}

function criarCartaoPedido(pedido) {
    const cartao = document.createElement('div');
    cartao.className = 'cartao pedido-card';

    const info = document.createElement('div');
    info.className = 'pedido-info';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Código do pedido:';

    const codigo = document.createElement('p');
    codigo.className = 'pedido-codigo';
    codigo.textContent = pedido.codigo;

    const titulo = document.createElement('h2');
    titulo.textContent = 'Informações:';

    const realizado = document.createElement('p');
    realizado.className = 'itens-texto';
    realizado.textContent = 'Realizado em: ' + new Date(pedido.criado_em).toLocaleString('pt-BR');

    const itensTitulo = document.createElement('p');
    itensTitulo.className = 'itens-titulo';
    itensTitulo.textContent = 'Itens:';

    const itensTexto = document.createElement('p');
    itensTexto.className = 'itens-texto';
    itensTexto.textContent = textoItensPedido(pedido);

    const valor = document.createElement('p');
    valor.className = 'valor';
    valor.textContent = 'Valor: ' + formatarPreco(pedido.total);

    info.append(label, codigo, titulo, realizado, itensTitulo, itensTexto, valor);

    const entrega = document.createElement('div');
    entrega.className = 'pedido-entrega';

    const tituloEntrega = document.createElement('h2');
    tituloEntrega.textContent = 'Entrega:';

    /* Sem acompanhamento de status no site: o pedido aparece sempre como confirmado */
    const etapas = document.createElement('ul');
    etapas.className = 'etapas';
    ['Pedido confirmado', 'Pedido sendo preparado', 'Pedido Pronto', 'Pedido saiu pra entrega', 'Pedido entregue']
        .forEach((texto, indice) => {
            const etapa = document.createElement('li');
            if (indice === 0) etapa.className = 'concluida';
            etapa.textContent = texto;
            etapas.appendChild(etapa);
        });

    entrega.append(tituloEntrega, etapas);
    cartao.append(info, entrega);
    return cartao;
}

/* pedidos.html: "Pedidos em curso" e "Histórico" mostram os pedidos finalizados (mais recente primeiro) */
function renderizarPedidosRealizados() {
    const pedidos = lerPedidosRealizados();

    ['lista-pedidos-realizados', 'lista-historico-pedidos'].forEach((id) => {
        const lista = document.getElementById(id);
        if (!lista) return;

        lista.innerHTML = '';

        if (!pedidos.length) {
            lista.appendChild(criarAvisoPedidos('Você ainda não tem pedidos.'));
            return;
        }

        pedidos.forEach((pedido) => lista.appendChild(criarCartaoPedido(pedido)));
    });
}

/* Produtos do cardápio (index.html) pelo nome guardado no pedido. Pedidos feitos antes de o item guardar o id
   usam esta tabela para continuar podendo ser repetidos. */
const PRODUTOS_POR_NOME = {
    'Smash Simples: Pão brioche, blend 90g, queijo cheddar fatiado e maionese da casa.': { id: 'classicos-1', produto: 1 },
    'Smash Duplo Bacon: Pão brioche, 2x blends 90g, 2x queijo cheddar, bacon crocante e maionese especial.': { id: 'classicos-2', produto: 2 },
    'Cheese Salada: Pão brioche, blend 150g, queijo prato, alface americana, tomate e molho verde.': { id: 'classicos-3', produto: 3 },
    'X-Bacon Especial: Pão com gergelim, blend 150g, queijo cheddar, muito bacon e molho barbecue.': { id: 'classicos-4', produto: 4 },
    'Classic Burger: Pão com gergelim, blend 150g, queijo cheddar, cebola roxa, picles e molho artesanal.': { id: 'classicos-5', produto: 5 },
    'Gourmet Trufado: Pão brioche, blend 180g, queijo emmental, cogumelos salteados e maionese trufada.': { id: 'gourmet-1', produto: 6 },
    'Costela Premium: Pão australiano, blend de costela 180g, queijo provolone e molho barbecue defumado.': { id: 'gourmet-2', produto: 7 },
    'Bacon Jam Burger: Pão australiano, blend 180g, cheddar fatiado, geleia de bacon artesanal e rúcula.': { id: 'gourmet-3', produto: 8 },
    'Cheddar Melt: Pão australiano, blend 180g, creme de cheddar cremoso e cebola caramelizada no shoyu.': { id: 'gourmet-4', produto: 9 },
    'Chicken Crispy: Pão brioche, sobrecoxa empanada super crocante, queijo prato, alface e maionese temperada.': { id: 'frango-veg-1', produto: 10 },
    'Chicken BBQ: Pão brioche, frango empanado, queijo cheddar, bacon e molho barbecue.': { id: 'frango-veg-2', produto: 11 },
    'Veggie Falafel: Pão brioche, halloumi ou hambúrguer de grão-de-bico, alface, tomate e maionese de ervas.': { id: 'frango-veg-3', produto: 12 },
    'Veggie Futuro: Pão com gergelim, blend vegetal, queijo vegano, cebola roxa, alface e tomate.': { id: 'frango-veg-4', produto: 13 },
    'Batata Frita Tradicional: Porção individual de batata palito crocante e sequinha.': { id: 'extras-1', produto: 14 },
    'Batata Rústica com Alecrim: Gomos temperados com sal grosso, alho e alecrim': { id: 'extras-2', produto: 15 },
    'Onion Rings: Anéis de cebola empanados com molho barbecue': { id: 'extras-3', produto: 16 },
    'Nuggets Crocantes: 8 unidades de filézinho de frango empanado': { id: 'extras-4', produto: 17 },
    'Sprite: Lata 350ml': { id: 'bebidas-1', produto: 18 },
    'Coca-Cola Zero: Lata 350ml': { id: 'bebidas-2', produto: 19 },
    'Suco de Laranja Natural: Copo 400ml': { id: 'bebidas-3', produto: 20 },
    'Suco de Limão: Copo 400ml': { id: 'bebidas-4', produto: 21 },
    'Suco de Limão: Copo 400ml': { id: 'bebidas-4', produto: 21 }
};

/* Dados para repor o item no carrinho, ou null se o produto não existir mais no cardápio */
function dadosParaRepetir(item) {
    if (item.id) return { id: item.id, produto: item.produto, imagem: item.imagem, nome: item.nome, preco: item.preco_unitario };
    const produto = PRODUTOS_POR_NOME[item.nome];
    if (!produto) return null;
    return {
        id: produto.id,
        produto: produto.produto,
        imagem: 'src/img/produtos/produto-' + produto.produto + '.svg',
        nome: item.nome,
        preco: item.preco_unitario
    };
}

/* pedidos.html: "Pedir novamente" repõe no carrinho os itens do último pedido */
function renderizarPedirNovamente() {
    const lista = document.getElementById('lista-pedir-novamente');
    if (!lista) return;

    lista.innerHTML = '';

    const [ultimo] = lerPedidosRealizados();
    if (!ultimo) {
        lista.appendChild(criarAvisoPedidos('Você ainda não tem pedidos para repetir.'));
        return;
    }

    const cartao = document.createElement('div');
    cartao.className = 'cartao pedido-card';

    const info = document.createElement('div');
    info.className = 'pedido-info';

    const label = document.createElement('span');
    label.className = 'label';
    label.textContent = 'Último pedido:';

    const codigo = document.createElement('p');
    codigo.className = 'pedido-codigo';
    codigo.textContent = ultimo.codigo;

    const itensTexto = document.createElement('p');
    itensTexto.className = 'itens-texto';
    itensTexto.textContent = textoItensPedido(ultimo);

    const valor = document.createElement('p');
    valor.className = 'valor';
    valor.textContent = 'Valor: ' + formatarPreco(ultimo.total);

    info.append(label, codigo, itensTexto, valor);

    /* Itens que ainda existem no cardápio (pedidos antigos sem id são resolvidos pelo nome) */
    const repetiveis = ultimo.itens
        .map((item) => ({ item, dados: dadosParaRepetir(item) }))
        .filter((r) => r.dados);
    if (repetiveis.length) {
        const acoes = document.createElement('div');
        acoes.className = 'acoes';

        const botao = document.createElement('button');
        botao.className = 'btn';
        botao.type = 'button';
        botao.textContent = 'Pedir novamente';
        botao.addEventListener('click', () => {
            repetiveis.forEach(({ item, dados }) => alterarQuantidade(dados, item.quantidade));
            window.location.href = 'carrinho.html';
        });

        acoes.appendChild(botao);
        info.appendChild(acoes);
    }

    cartao.appendChild(info);
    lista.appendChild(cartao);
}

/* ===== Endereços salvos (perfil.html e carrinho.html): lista guardada em bgverso_enderecos ===== */
const CHAVE_ENDERECOS = 'bgverso_enderecos';
const CAMPOS_ENDERECO = ['cep', 'numero', 'rua', 'complemento', 'bairro', 'referencia', 'cidade', 'uf'];

function gerarIdEndereco() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function salvarEnderecos(enderecos) {
    localStorage.setItem(CHAVE_ENDERECOS, JSON.stringify(enderecos));
}

/* Lê a lista de endereços. Migração: a versão anterior guardava um único endereço dentro de 'bgverso_perfil' */
function lerEnderecos() {
    const salvos = localStorage.getItem(CHAVE_ENDERECOS);
    if (salvos !== null) {
        try {
            return JSON.parse(salvos) || [];
        } catch (erro) {
            return [];
        }
    }

    let perfil = {};
    try {
        perfil = JSON.parse(localStorage.getItem('bgverso_perfil')) || {};
    } catch (erro) {
        perfil = {};
    }

    const enderecos = [];
    if (CAMPOS_ENDERECO.some((campo) => perfil[campo])) {
        const antigo = { id: gerarIdEndereco(), apelido: 'Minha casa' };
        CAMPOS_ENDERECO.forEach((campo) => { antigo[campo] = perfil[campo] || ''; });
        enderecos.push(antigo);
    }

    salvarEnderecos(enderecos);
    return enderecos;
}


/* ===== Cartões: validação (perfil.html) ===== */
const CHAVE_CARTOES = 'bgverso_cartoes';

function lerCartoes() {
    try {
        return JSON.parse(localStorage.getItem(CHAVE_CARTOES)) || [];
    } catch (erro) {
        return [];
    }
}

function salvarCartoes(cartoes) {
    localStorage.setItem(CHAVE_CARTOES, JSON.stringify(cartoes));
}

function apenasDigitosCartao(valor) {
    return String(valor).replace(/\D/g, '');
}

/* Algoritmo de Luhn: valida o número pela soma de verificação */
function luhnValido(numero) {
    const d = apenasDigitosCartao(numero);
    if (d.length < 13 || d.length > 19) return false;
    let soma = 0;
    let dobrar = false;
    for (let i = d.length - 1; i >= 0; i--) {
        let n = Number(d[i]);
        if (dobrar) {
            n *= 2;
            if (n > 9) n -= 9;
        }
        soma += n;
        dobrar = !dobrar;
    }
    return soma % 10 === 0;
}

/* Bandeira pelo prefixo (simplificado) */
function detectarBandeira(numero) {
    const d = apenasDigitosCartao(numero);
    if (/^4/.test(d)) return 'Visa';
    if (/^(5[1-5]|2(2[2-9]|[3-6]\d|7[01]|720))/.test(d)) return 'Mastercard';
    if (/^3[47]/.test(d)) return 'American Express';
    if (/^(401178|401179|431274|438935|451416|457393|504175|506699|509|627780|636297|636368|650|6516|6550)/.test(d)) return 'Elo';
    if (/^(6011|65|64[4-9])/.test(d)) return 'Discover';
    return 'Desconhecida';
}

function mascaraNumeroCartao(valor) {
    return apenasDigitosCartao(valor).slice(0, 19).replace(/(\d{4})(?=\d)/g, '$1 ');
}

function mascaraValidade(valor) {
    const d = apenasDigitosCartao(valor).slice(0, 4);
    return d.length > 2 ? d.slice(0, 2) + '/' + d.slice(2) : d;
}

/* Retorna null se válida; senão, a mensagem de erro */
function validarValidade(valor, agora = new Date()) {
    const m = /^(\d{2})\/(\d{2})$/.exec(valor);
    if (!m) return 'Informe a validade no formato MM/AA.';
    const mes = Number(m[1]);
    const ano = 2000 + Number(m[2]);
    if (mes < 1 || mes > 12) return 'Mês inválido.';
    const fimDaValidade = new Date(ano, mes, 0, 23, 59, 59);
    if (fimDaValidade < agora) return 'Cartão vencido.';
    return null;
}

/* Titular: pelo menos duas palavras, só letras e espaços */
function validarTitular(valor) {
    const nome = valor.trim().replace(/\s+/g, ' ');
    if (!/^[A-Za-zÀ-ÿ]+( [A-Za-zÀ-ÿ]+)+$/.test(nome)) {
        return 'Informe o nome completo, como está no cartão.';
    }
    return null;
}

/* CVV: 3 dígitos (4 para American Express) */
function validarCvv(valor, bandeira) {
    const esperado = bandeira === 'American Express' ? 4 : 3;
    if (apenasDigitosCartao(valor).length !== esperado) return 'O CVV deve ter ' + esperado + ' dígitos.';
    return null;
}

/* Valida tudo; devolve objeto com os erros (vazio se tudo certo) */
function validarCartao(dados, agora = new Date()) {
    const erros = {};
    const bandeira = detectarBandeira(dados.numero);

    if (!luhnValido(dados.numero)) erros.numero = 'Número de cartão inválido.';
    const erroTitular = validarTitular(dados.titular);
    if (erroTitular) erros.titular = erroTitular;
    const erroValidade = validarValidade(dados.validade, agora);
    if (erroValidade) erros.validade = erroValidade;
    const erroCvv = validarCvv(dados.cvv, bandeira);
    if (erroCvv) erros.cvv = erroCvv;

    return erros;
}

/* Registro salvo: sem número completo e sem CVV */
function criarRegistroCartao(dados) {
    const numero = apenasDigitosCartao(dados.numero);
    return {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
        bandeira: detectarBandeira(numero),
        titular: dados.titular.trim().replace(/\s+/g, ' ').toUpperCase(),
        final: numero.slice(-4),
        validade: dados.validade
    };
}

/* ===== Pesquisa na barra lateral (todas as páginas) ===== */
/* Normaliza para comparar: minúsculas e sem acentos */
function normalizarTexto(texto) {
    return String(texto)
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

/* Cartões que podem ser filtrados (o texto de cada um é comparado com o termo) */
const SELETOR_CARTOES = '.sabor, .pedido-card, .item-carrinho, .cartao-salvo, .cartao-dados, .cartao-endereco';

function filtrarPagina(termo) {
    const alvo = normalizarTexto(termo);
    const cartoes = document.querySelectorAll(SELETOR_CARTOES);
    let visiveis = 0;

    cartoes.forEach((cartao) => {
        const corresponde = !alvo || normalizarTexto(cartao.textContent).includes(alvo);
        cartao.hidden = !corresponde;
        if (corresponde) visiveis++;
    });

    /* Esconde a secção quando todos os cartões dela ficaram ocultos */
    document.querySelectorAll('.categoria').forEach((secao) => {
        const cartoesDaSecao = secao.querySelectorAll(SELETOR_CARTOES);
        if (!cartoesDaSecao.length) return;
        const algumVisivel = [...cartoesDaSecao].some((c) => !c.hidden);
        secao.hidden = !!alvo && !algumVisivel;
    });

    let aviso = document.getElementById('aviso-pesquisa');
    if (alvo && visiveis === 0) {
        if (!aviso) {
            aviso = document.createElement('p');
            aviso.id = 'aviso-pesquisa';
            aviso.className = 'aviso-pesquisa';
            aviso.setAttribute('role', 'status');
            document.querySelector('main').prepend(aviso);
        }
        aviso.textContent = 'Nenhum resultado para «' + termo.trim() + '».';
        aviso.hidden = false;
    } else if (aviso) {
        aviso.hidden = true;
    }
}

/* Reaplica o termo atual do campo; chamada após qualquer renderização que recria cartões */
function atualizarPesquisa() {
    const campo = document.getElementById('pesquisa');
    filtrarPagina(campo ? campo.value : '');
}

function configurarPesquisa() {
    const campo = document.getElementById('pesquisa');
    if (!campo) return;

    campo.addEventListener('input', atualizarPesquisa);
    campo.addEventListener('search', atualizarPesquisa);
    campo.addEventListener('keydown', (evento) => {
        if (evento.key === 'Escape') {
            campo.value = '';
            atualizarPesquisa();
        }
    });
}

configurarPesquisa();

/* ===== Cartões: lista e formulário (perfil.html) ===== */
function renderizarCartoes() {
    const lista = document.getElementById('lista-cartoes');
    if (!lista) return;

    const cartoes = lerCartoes();
    lista.innerHTML = '';

    if (!cartoes.length) {
        const vazio = document.createElement('p');
        vazio.textContent = 'Nenhum cartão salvo.';
        lista.appendChild(vazio);
        return;
    }

    cartoes.forEach((cartao) => {
        const linha = document.createElement('div');
        linha.className = 'cartao-salvo';

        const texto = document.createElement('p');
        texto.textContent = cartao.bandeira + ' final ' + cartao.final + ' · ' + cartao.titular + ' · validade ' + cartao.validade;

        const remover = document.createElement('button');
        remover.className = 'btn secundario';
        remover.type = 'button';
        remover.dataset.acao = 'remover-cartao';
        remover.dataset.id = cartao.id;
        remover.textContent = 'Remover';

        linha.append(texto, remover);
        lista.appendChild(linha);
    });
}

function configurarFormularioCartao() {
    const form = document.getElementById('form-cartao');
    if (!form) return;

    const numero = document.getElementById('cartao-numero');
    const titular = document.getElementById('cartao-titular');
    const validade = document.getElementById('cartao-validade');
    const cvv = document.getElementById('cartao-cvv');

    numero.addEventListener('input', () => { numero.value = mascaraNumeroCartao(numero.value); });
    validade.addEventListener('input', () => { validade.value = mascaraValidade(validade.value); });
    cvv.addEventListener('input', () => { cvv.value = apenasDigitosCartao(cvv.value).slice(0, 4); });

    const mapaErros = { numero, titular, validade, cvv };

    form.addEventListener('submit', (evento) => {
        evento.preventDefault();

        const dados = {
            numero: numero.value,
            titular: titular.value,
            validade: validade.value,
            cvv: cvv.value
        };
        const erros = validarCartao(dados);

        Object.entries(mapaErros).forEach(([chave, campo]) => {
            const erroEl = document.getElementById('erro-' + campo.id);
            erroEl.textContent = erros[chave] || '';
            campo.setAttribute('aria-invalid', erros[chave] ? 'true' : 'false');
        });

        if (Object.keys(erros).length) return;

        const cartoes = lerCartoes();
        cartoes.push(criarRegistroCartao(dados));
        salvarCartoes(cartoes);

        form.reset();
        renderizarCartoes();
        atualizarPesquisa();
    });

    document.addEventListener('click', (evento) => {
        const botao = evento.target.closest('[data-acao="remover-cartao"]');
        if (!botao) return;
        salvarCartoes(lerCartoes().filter((c) => c.id !== botao.dataset.id));
        renderizarCartoes();
        atualizarPesquisa();
    });
}

sincronizarCartoes();
renderizarCarrinho();
atualizarResumo();
renderizarCartoes();
configurarFormularioCartao();
renderizarPedidosRealizados();
renderizarPedirNovamente();
atualizarPesquisa();
