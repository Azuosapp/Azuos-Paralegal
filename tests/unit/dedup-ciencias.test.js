import { test } from 'node:test';
import assert from 'node:assert/strict';

// Replica da lógica de dedup do v5.7.84
function dedupCiencias(arr) {
  if (!arr || typeof arr !== 'object') return arr;
  const porKey = {};
  Object.keys(arr).forEach(idx => {
    const e = arr[idx];
    if (!e || !e.key) return;
    const ex = porKey[e.key];
    if (!ex || (e.ciencia_em && ex.ciencia_em && e.ciencia_em > ex.ciencia_em)) {
      porKey[e.key] = e;
    }
  });
  return Object.values(porKey);
}

test('array vazio retorna vazio', () => {
  assert.deepEqual(dedupCiencias([]), []);
});

test('sem duplicatas mantém tudo', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {key:'B', ciencia_em:'2026-01-02'}
  ];
  const out = dedupCiencias(inp);
  assert.equal(out.length, 2);
});

test('dedup mantém mais recente', () => {
  const inp = [
    {key:'A', ciencia_em:'2026-01-01'},
    {key:'A', ciencia_em:'2026-06-18'},  // mais recente
    {key:'A', ciencia_em:'2026-03-15'}
  ];
  const out = dedupCiencias(inp);
  assert.equal(out.length, 1);
  assert.equal(out[0].ciencia_em, '2026-06-18');
});

test('idempotente: rodar 2x dá mesmo resultado', () => {
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
    {ciencia_em:'2026-01-02'},  // sem key
    null
  ];
  const out = dedupCiencias(inp);
  assert.equal(out.length, 1);
});
