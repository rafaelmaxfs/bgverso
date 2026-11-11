/* ===== Finalizar pedido (carrinho.html): gera o JSON no formato lido pelo ImportadorJson (C#) ===== */

function exigir(condicao, mensagem) {
    if (!condicao) throw new Error(mensagem);
}

function soDigitos(valor) {
    return String(valor || '').replace(/\D/g, '');
}

function valorCampo(id) {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
}

function lerPerfilPedido() {
    try {
        return JSON.parse(localStorage.getItem('bgverso_perfil')) || {};
    } catch (erro) {
        return {};
    }
}

/* Endereço salvo escolhido no select do carrinho (lista guardada pelo perfil.html) */
function enderecoSalvoSelecionado() {
    const select = document.getElementById('endereco-salvo');
    if (!select) return null;
    return lerEnderecos().find((endereco) => endereco.id === select.value) || null;
}

/* Copia os campos de um endereço salvo para o formulário do checkout (campos vazios se não houver endereço) */
function preencherCamposEndereco(endereco) {
    CAMPOS_ENDERECO.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = (endereco && endereco[id]) || '';
    });
}

/* Monta o select com os endereços salvos. Ao abrir, só preenche se os campos estiverem vazios (não sobrescreve o que já foi digitado) */
function preencherEnderecoSalvo() {
    const select = document.getElementById('endereco-salvo');
    if (!select) return;

    const enderecos = lerEnderecos();
    select.innerHTML = '';

    if (!enderecos.length) {
        const opcao = document.createElement('option');
        opcao.value = '';
        opcao.textContent = 'Nenhum endereço salvo';
        select.appendChild(opcao);
        return;
    }

    enderecos.forEach((endereco) => {
        const opcao = document.createElement('option');
        opcao.value = endereco.id;
        opcao.textContent = endereco.apelido || 'Sem nome';
        select.appendChild(opcao);
    });

    const jaPreenchido = CAMPOS_ENDERECO.some((id) => {
        const el = document.getElementById(id);
        return el && el.value;
    });
    if (!jaPreenchido) preencherCamposEndereco(enderecos[0]);

    select.addEventListener('change', () => preencherCamposEndereco(enderecoSalvoSelecionado()));
}

/* Data local no formato "AAAA-MM-DDTHH:MM:SS" (lido pelo C# como DateTime) */
function dataLocalIso(data) {
    const p = (n) => String(n).padStart(2, '0');
    return data.getFullYear() + '-' + p(data.getMonth() + 1) + '-' + p(data.getDate())
        + 'T' + p(data.getHours()) + ':' + p(data.getMinutes()) + ':' + p(data.getSeconds());
}

function montarPedido(agora) {
    const itensCarrinho = Object.values(lerCarrinho());
    exigir(itensCarrinho.length > 0, 'Seu carrinho está vazio.');

    const perfil = lerPerfilPedido();
    const cpf = soDigitos(perfil.cpf);
    const telefone = soDigitos(perfil.telefone);
    exigir(perfil.nome && perfil.sobrenome && perfil.email, 'Preencha nome, sobrenome e e-mail em Perfil.');
    exigir(cpf.length === 11, 'Preencha um CPF válido em Perfil.');
    exigir(telefone.length >= 10, 'Preencha um telefone válido em Perfil.');

    const cep = soDigitos(valorCampo('cep'));
    const numero = soDigitos(valorCampo('numero'));
    const rua = valorCampo('rua');
    const bairro = valorCampo('bairro');
    const cidade = valorCampo('cidade');
    const uf = valorCampo('uf').toUpperCase();
    exigir(cep.length === 8, 'Preencha o CEP do endereço.');
    exigir(rua && numero && bairro, 'Preencha rua, número e bairro.');
    exigir(cidade && uf.length === 2, 'Preencha cidade e UF.');

    const pagamento = document.querySelector('input[name="pagamento"]:checked');
    const forma = pagamento ? pagamento.value : 'pix';

    let cartao = null;
    if (forma === 'cartao') {
        const cartoes = lerCartoes();
        exigir(cartoes.length > 0, 'Cadastre um cartão em Perfil para pagar com cartão.');
        const c = cartoes[0]; /* Limitação: usa o primeiro cartão salvo */
        cartao = {
            bandeira: c.bandeira,
            ultimos4: c.final,
            nome_titular: c.titular,
            validade: c.validade
        };
    }

    const itens = itensCarrinho.map((item) => {
        exigir(Number.isInteger(item.produto), `Item "${item.nome}" sem código de produto. Esvazie o carrinho e adicione novamente.`);
        return {
            id_produto: item.produto,
            nome: item.nome,
            quantidade: item.qtd,
            preco_unitario: item.preco
        };
    });

    return {
        criado_em: dataLocalIso(agora),
        forma_pagamento: forma,
        cartao: cartao,
        usuario: {
            nome: perfil.nome,
            sobrenome: perfil.sobrenome,
            email: perfil.email,
            cpf: cpf,
            telefone: telefone
        },
        endereco: {
            apelido: enderecoSalvoSelecionado()?.apelido || 'Minha casa',
            cep: cep,
            rua: rua,
            numero: numero,
            complemento: valorCampo('complemento') || null,
            bairro: bairro,
            cidade: cidade,
            uf: uf,
            referencia: valorCampo('referencia') || null,
            frete: FRETE_CARRINHO
        },
        itens: itens
    };
}

/* Registro do pedido finalizado, lido por pedidos.html (subtotal + frete, arredondado em centavos) */
/* itensCarrinho: itens do carrinho na mesma ordem de pedido.itens (guarda o id do cartão para "Pedir novamente") */
function montarRegistroPedido(pedido, agora, itensCarrinho) {
    const subtotal = pedido.itens.reduce((soma, item) => soma + item.quantidade * item.preco_unitario, 0);
    return {
        codigo: 'BG-' + String(agora.getTime()).slice(-6),
        criado_em: pedido.criado_em,
        forma_pagamento: pedido.forma_pagamento,
        itens: pedido.itens.map((item, indice) => ({
            id: itensCarrinho[indice].id,
            produto: item.id_produto,
            imagem: itensCarrinho[indice].imagem,
            nome: item.nome,
            quantidade: item.quantidade,
            preco_unitario: item.preco_unitario
        })),
        total: Math.round((subtotal + pedido.endereco.frete) * 100) / 100
    };
}

function salvarPedidoRealizado(registro) {
    const pedidos = lerPedidosRealizados();
    pedidos.unshift(registro);
    salvarPedidosRealizados(pedidos);
}


/* Endereço do servidor C# (DeliveryApp/ServidorPedidos.cs) que grava o pedido no MySQL */
const URL_SERVIDOR_PEDIDOS = 'http://localhost:5050/pedidos';

/* Envia o pedido ao C#. Lança erro se o servidor não estiver ligado ou se a gravação falhar */
async function enviarPedido(pedido) {
    let resposta;
    try {
        resposta = await fetch(URL_SERVIDOR_PEDIDOS, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pedidos: [pedido] })
        });
    } catch (erro) {
        throw new Error('Não foi possível conectar ao sistema de pedidos. Verifique se o programa DeliveryApp está aberto.');
    }

    const dados = await resposta.json().catch(() => ({}));
    if (!resposta.ok) {
        throw new Error('Pedido não foi gravado: ' + (dados.erro || (dados.erros || []).join('; ') || resposta.status));
    }
    return dados;
}

document.getElementById('finalizar-pedido')?.addEventListener('click', async () => {
    const botao = document.getElementById('finalizar-pedido');
    try {
        const agora = new Date();
        const pedido = montarPedido(agora);
        const itensCarrinho = Object.values(lerCarrinho());

        botao.disabled = true;
        const resultado = await enviarPedido(pedido);
        salvarPedidoRealizado(montarRegistroPedido(pedido, agora, itensCarrinho));

        salvarCarrinho({});
        renderizarCarrinho();
        atualizarResumo();
        atualizarPesquisa();
        alert(resultado.importados > 0 ? 'Pedido finalizado e gravado no banco!' : 'Este pedido já estava gravado.');
    } catch (erro) {
        alert(erro.message);
    } finally {
        botao.disabled = false;
    }
});

preencherEnderecoSalvo();
