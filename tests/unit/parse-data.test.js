import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseDataBR, diffDiasBR } from '../../src/utils.js';

test('formato dd/mm/aaaa OK', () => {
  const d = parseDataBR('15/06/2026');
  assert.equal(d.getDate(), 15);
  assert.equal(d.getMonth(), 5);
  assert.equal(d.getFullYear(), 2026);
});

test('vazio retorna null', () => {
  assert.equal(parseDataBR(''), null);
  assert.equal(parseDataBR(null), null);
  assert.equal(parseDataBR(undefined), null);
});

test('formato inválido retorna null', () => {
  assert.equal(parseDataBR('15-06-2026'), null);
  assert.equal(parseDataBR('2026/06/15'), null);
  assert.equal(parseDataBR('abc'), null);
});

test('diffDias - diferença de 10 dias', () => {
  assert.equal(diffDiasBR('30/06/2026', '20/06/2026'), 10);
});

test('diffDias - diferença negativa', () => {
  assert.equal(diffDiasBR('20/06/2026', '30/06/2026'), -10);
});

test('diffDias - input inválido retorna null', () => {
  assert.equal(diffDiasBR('abc', '20/06/2026'), null);
});
