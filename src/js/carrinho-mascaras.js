/* Máscara do CEP: 00000-000 (aceita apenas dígitos, máximo de 8) */
function mascaraCep(valor) {
    const digitos = valor.replace(/\D/g, '').slice(0, 8);
    return digitos.length > 5 ? digitos.slice(0, 5) + '-' + digitos.slice(5) : digitos;
}

/* Campo Número: aceita apenas dígitos */
function mascaraNumero(valor) {
    return valor.replace(/\D/g, '');
}

const inputCep = document.getElementById('cep');
const inputNumero = document.getElementById('numero');

inputCep.addEventListener('input', () => {
    inputCep.value = mascaraCep(inputCep.value);
});

inputNumero.addEventListener('input', () => {
    inputNumero.value = mascaraNumero(inputNumero.value);
});
