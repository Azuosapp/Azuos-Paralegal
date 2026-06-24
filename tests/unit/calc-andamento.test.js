import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calcAndamento } from '../../src/utils.js';

test('vazio retorna 0%', () => {
  assert.deepEqual(calcAndamento([]), { pct: 0, completos: 0, total: 0 });
});

test('null/undefined retorna 0%', () => {
  assert.deepEqual(calcAndamento(null), { pct: 0, completos: 0, total: 0 });
  assert.deepEqual(calcAndamento(undefined), { pct: 0, completos: 0, total: 0 });
});

test('Sem obrigatoriedade ignorado', () => {
  const r = calcAndamento([{status:'Sem obrigatoriedade'}, {status:'Sem obrigatoriedade'}]);
  assert.deepEqual(r, { pct: 0, completos: 0, total: 0 });
});

test('100% concluído', () => {
  assert.equal(calcAndamento([{status:'Concluído'}, {status:'Pago'}]).pct, 100);
});

test('50% misturado', () => {
  assert.equal(calcAndamento([{status:'Concluído'}, {status:'Não iniciado'}]).pct, 50);
});

test('Aguardando cliente conta (v5.7.81)', () => {
  assert.equal(calcAndamento([{status:'Aguardando cliente'}, {status:'Não iniciado'}]).pct, 50);
});

test('Aguardando pagamento NÃO conta', () => {
  assert.equal(calcAndamento([{status:'Aguardando pagamento'}, {status:'Concluído'}]).pct, 50);
});

test('Isento conta', () => {
  assert.equal(calcAndamento([{status:'Isento'}, {status:'Não iniciado'}]).pct, 50);
});

test('Serviço paralisado conta (v5.7.75)', () => {
  assert.equal(calcAndamento([{status:'Serviço paralisado'}, {status:'Não iniciado'}]).pct, 50);
});

test('Formalizado e Formalizado com o cliente contam (v5.7.74)', () => {
  assert.equal(calcAndamento([{status:'Formalizado'}]).pct, 100);
  assert.equal(calcAndamento([{status:'Formalizado com o cliente'}]).pct, 100);
});

test('Encaminhado NÃO conta', () => {
  assert.equal(calcAndamento([{status:'Encaminhado'}, {status:'Concluído'}]).pct, 50);
});

test('Arquivado com pendências NÃO conta (diferente de Arquivado pelo cliente)', () => {
  assert.equal(calcAndamento([{status:'Arquivado com pendências'}, {status:'Concluído'}]).pct, 50);
});

test('Em vigor (vencimento) conta', () => {
  assert.equal(calcAndamento([{status:'Em vigor (vencimento)'}, {status:'Não iniciado'}]).pct, 50);
});

test('null/undefined em status são ignorados', () => {
  const r = calcAndamento([{status:null}, {status:undefined}, {status:''}, {status:'Concluído'}]);
  assert.deepEqual(r, { pct: 100, completos: 1, total: 1 });
});
