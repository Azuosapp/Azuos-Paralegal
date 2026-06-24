import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sanitizarFirestore, hashEmail, statusEhCompleto } from '../../src/utils.js';

test('sanitiza undefined → ""', () => {
  assert.deepEqual(sanitizarFirestore({a: undefined, b: 'ok'}), {a: '', b: 'ok'});
});

test('sanitiza recursivamente', () => {
  const r = sanitizarFirestore({nested: {x: undefined, y: 1}});
  assert.deepEqual(r, {nested: {x: '', y: 1}});
});

test('sanitiza arrays', () => {
  const r = sanitizarFirestore([1, undefined, 'a']);
  assert.deepEqual(r, [1, '', 'a']);
});

test('hashEmail é determinístico', () => {
  const h = hashEmail('contato@azuoscontabil.com.br');
  assert.equal(h, 'contato_azuoscontabil_com_br');
  assert.equal(hashEmail('contato@azuoscontabil.com.br'), h);
});

test('hashEmail só com alfanumérico', () => {
  const h = hashEmail('user+test@example.com');
  assert.match(h, /^[a-zA-Z0-9_]+$/);
});

test('statusEhCompleto reconhece todos os status que contam', () => {
  ['Concluído', 'Pago', 'Em vigor (vencimento)', 'Formalizado', 'Formalizado com o cliente',
   'Em andamento', 'Em andamento (pendência)', 'Arquivado pelo cliente', 'Serviço paralisado',
   'Isento', 'Aguardando cliente'].forEach(s => {
    assert.equal(statusEhCompleto(s), true, `${s} deveria ser completo`);
  });
});

test('statusEhCompleto rejeita os que NÃO contam', () => {
  ['Não iniciado', 'Aguardando pagamento', 'Arquivado com pendências', 'Encaminhado', '', null, undefined].forEach(s => {
    assert.equal(statusEhCompleto(s), false, `${s} NÃO deveria ser completo`);
  });
});
