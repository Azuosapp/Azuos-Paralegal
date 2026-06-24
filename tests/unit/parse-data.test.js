import { test } from 'node:test';
import assert from 'node:assert/strict';

// Replica simplificada de parseDataBR
function parseDataBR(s) {
  if (!s) return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [_, d, mo, y] = m;
  return new Date(parseInt(y), parseInt(mo)-1, parseInt(d));
}

test('formato dd/mm/aaaa OK', () => {
  const d = parseDataBR('15/06/2026');
  assert.equal(d.getDate(), 15);
  assert.equal(d.getMonth(), 5); // junho = 5
  assert.equal(d.getFullYear(), 2026);
});

test('vazio retorna null', () => {
  assert.equal(parseDataBR(''), null);
  assert.equal(parseDataBR(null), null);
});

test('formato inválido retorna null', () => {
  assert.equal(parseDataBR('15-06-2026'), null);
  assert.equal(parseDataBR('2026/06/15'), null);
});

test('diferença de 10 dias correta', () => {
  const venc = parseDataBR('30/06/2026');
  const prox = parseDataBR('20/06/2026');
  const diff = Math.round((venc - prox) / (1000*60*60*24));
  assert.equal(diff, 10);
});
