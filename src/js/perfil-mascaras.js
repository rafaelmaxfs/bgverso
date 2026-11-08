/* Mantém apenas dígitos, sem limite de tamanho */
function apenasDigitos(valor) {
    return valor.replace(/\D/g, '');
}

/* CPF: 000.000.000-00 (máximo de 11 dígitos) */
function mascaraCpf(valor) {
    const d = apenasDigitos(valor).slice(0, 11);
    let r = d.slice(0, 3);
    if (d.length > 3) r += '.' + d.slice(3, 6);
    if (d.length > 6) r += '.' + d.slice(6, 9);
    if (d.length > 9) r += '-' + d.slice(9, 11);
    return r;
}

/* Telefone: (00) 0000-0000 ou (00) 00000-0000 (máximo de 11 dígitos) */
function mascaraTelefone(valor) {
    const d = apenasDigitos(valor).slice(0, 11);
    if (!d.length) return '';
    const tamanhoBloco = d.length > 10 ? 5 : 4;
    let r = '(' + d.slice(0, 2);
    if (d.length > 2) r += ') ' + d.slice(2, 2 + tamanhoBloco);
    if (d.length > 2 + tamanhoBloco) r += '-' + d.slice(2 + tamanhoBloco);
    return r;
}

const mascaras = [
    ['cpf', mascaraCpf],
    ['telefone', mascaraTelefone],
    ['whatsapp', mascaraTelefone]
];

mascaras.forEach(([id, aplicarMascara]) => {
    const campo = document.getElementById(id);
    if (!campo) return;
    campo.addEventListener('input', () => {
        campo.value = aplicarMascara(campo.value);
    });
});
