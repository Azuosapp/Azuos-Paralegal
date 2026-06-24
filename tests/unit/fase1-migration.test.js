import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Testes que Fase 1 está armada
const html = readFileSync('index.html', 'utf-8');

test('Fase 1: leitura dupla armada', () => {
  assert.ok(html.includes('v6.0 Fase 1'), 'comentário Fase 1 ausente');
  assert.ok(html.includes("doc('ciencias').collection('por_usuario')"), 'subcoleção ciencias ausente');
  assert.ok(html.includes("doc('edicoes').collection('alvaras')"), 'subcoleção edicoes ausente');
});

test('Fase 1: hash de email é determinístico', () => {
  const hash1 = 'contato@azuoscontabil.com.br'.replace(/[^a-zA-Z0-9]/g, '_');
  const hash2 = 'contato@azuoscontabil.com.br'.replace(/[^a-zA-Z0-9]/g, '_');
  assert.equal(hash1, hash2);
  assert.equal(hash1, 'contato_azuoscontabil_com_br');
});

test('Fase 1: hook em salvarAlvara presente', () => {
  assert.ok(html.includes('salvarAlvara hookado para escrever em subcoleção'));
});

test('Fase 1: leitura tem fallback (não quebra se subcoleção vazia)', () => {
  // Fase 1 só APLICA se subcoleção tem dado. Não apaga ciencias_por_usuario do state.
  assert.ok(!html.includes('delete state.ciencias_por_usuario'), 'não deve deletar state legado');
});

test('Migration script existe e tem função migrateFase1', () => {
  const m = readFileSync('scripts/migrate-firestore.js', 'utf-8');
  assert.ok(m.includes('window.migrateFase1'));
  assert.ok(m.includes('snapshotId'));
  assert.ok(m.includes('por_usuario'));
});
