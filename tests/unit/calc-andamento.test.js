import { test } from 'node:test';
import assert from 'node:assert/strict';

// Replica da função calcAndamento que está no index.html (linha 986)
// Quando modularizar (Fase 2), vai importar de src/utils/andamento.js
function calcAndamento(alvs) {
  const CONCLUIDO = ['Concluído','Pago'];
  const obrigatorios = alvs.filter(a => a.status && a.status !== 'Sem obrigatoriedade');
  if (obrigatorios.length === 0) return { pct: 0, completos: 0, total: 0 };
  const completos = obrigatorios.filter(a =>
    CONCLUIDO.includes(a.status)
    || a.status === 'Em vigor (vencimento)'
    || /^formalizado/i.test(a.status||'')
    || a.status === 'Pago'
    || /^em andamento/i.test(a.status||'')
    || a.status === 'Arquivado pelo cliente'
    || a.status === 'Serviço paralisado'
    || a.status === 'Isento'
    || /^aguardando cliente/i.test(a.status||'')
  );
  return {
    pct: Math.round(100 * completos.length / obrigatorios.length),
    completos: completos.length,
    total: obrigatorios.length
  };
}

test('vazio retorna 0%', () => {
  assert.deepEqual(calcAndamento([]), { pct: 0, completos: 0, total: 0 });
});

test('Sem obrigatoriedade ignorado', () => {
  const r = calcAndamento([{status:'Sem obrigatoriedade'}, {status:'Sem obrigatoriedade'}]);
  assert.deepEqual(r, { pct: 0, completos: 0, total: 0 });
});

test('100% concluído', () => {
  const r = calcAndamento([{status:'Concluído'}, {status:'Pago'}]);
  assert.equal(r.pct, 100);
});

test('50% misturado', () => {
  const r = calcAndamento([{status:'Concluído'}, {status:'Não iniciado'}]);
  assert.equal(r.pct, 50);
});

test('Aguardando cliente conta como completo (v5.7.81)', () => {
  const r = calcAndamento([{status:'Aguardando cliente'}, {status:'Não iniciado'}]);
  assert.equal(r.pct, 50);
});

test('Aguardando pagamento NÃO conta', () => {
  const r = calcAndamento([{status:'Aguardando pagamento'}, {status:'Concluído'}]);
  assert.equal(r.pct, 50);
});

test('Isento conta como completo', () => {
  const r = calcAndamento([{status:'Isento'}, {status:'Não iniciado'}]);
  assert.equal(r.pct, 50);
});

test('Serviço paralisado conta como completo (v5.7.75)', () => {
  const r = calcAndamento([{status:'Serviço paralisado'}, {status:'Não iniciado'}]);
  assert.equal(r.pct, 50);
});

test('Formalizado e variações contam (v5.7.74)', () => {
  const a = calcAndamento([{status:'Formalizado'}]);
  const b = calcAndamento([{status:'Formalizado com o cliente'}]);
  assert.equal(a.pct, 100);
  assert.equal(b.pct, 100);
});

test('Encaminhado NÃO conta', () => {
  const r = calcAndamento([{status:'Encaminhado'}, {status:'Concluído'}]);
  assert.equal(r.pct, 50);
});

test('Arquivado com pendências NÃO conta (status diferente de arquivado pelo cliente)', () => {
  const r = calcAndamento([{status:'Arquivado com pendências'}, {status:'Concluído'}]);
  assert.equal(r.pct, 50);
});
