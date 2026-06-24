import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dedupCiencias } from '../../src/utils.js';

test('array vazio retorna vazio', () => {
  assert.deepEqual(dedupCiencias([]), []);
});

test('null retorna vazio', () => {
  assert.deepEqual(dedupCiencias(null), []);
});

test('sem duplicatas mantém tudo', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {key:'B', ciencia_em:'2026-01-02'}
  ];
  assert.equal(dedupCiencias(inp).length, 2);
});

test('dedup mantém mais recente', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {key:'A', ciencia_em:'2026-06-18'},
    {key:'A', ciencia_em:'2026-03-15'}
  ];
  const out = dedupCiencias(inp);
  assert.equal(out.length, 1);
  assert.equal(out[0].ciencia_em, '2026-06-18');
});

test('idempotente', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {key:'A', ciencia_em:'2026-06-18'},
    {key:'B', ciencia_em:'2026-02-10'}
  ];
  const out1 = dedupCiencias(inp);
  const out2 = dedupCiencias(out1);
  assert.deepEqual(out1, out2);
});

test('entries sem key são ignoradas (não quebra)', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {ciencia_em:'2026-01-02'},
    null
  ];
  assert.equal(dedupCiencias(inp).length, 1);
});

test('objeto-indexado (não-array) também funciona', () => {
  const inp = {
    "0": {key:'A', ciencia_em:'2026-01-01'},
    "1": {key:'A', ciencia_em:'2026-06-18'},
    "2": {key:'B', ciencia_em:'2026-02-10'}
  };
  const out = dedupCiencias(inp);
  assert.equal(out.length, 2);
});

test('5787 entries com 1 unique → 1 (case Camila)', () => {
  const inp = [];
  for (let i = 0; i < 5787; i++) {
    inp.push({key:'CAMILA_ALVARA_X', ciencia_em:'2026-06-18T19:21:12.487Z'});
  }
  const out = dedupCiencias(inp);
  assert.equal(out.length, 1);
});
