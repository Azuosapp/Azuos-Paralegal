import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classesDeStatus, statusEhPendente, STATUS_PENDENTES } from '../../src/status-classes.js';

test('classes do Concluído', () => {
  const c = classesDeStatus('Concluído');
  assert.equal(c.bg, 'bg-emerald-100');
});

test('status desconhecido retorna DEFAULT (não quebra)', () => {
  const c = classesDeStatus('xpto inexistente');
  assert.equal(c.bg, 'bg-slate-100');
});

test('null/undefined retorna DEFAULT', () => {
  assert.ok(classesDeStatus(null).bg);
  assert.ok(classesDeStatus(undefined).bg);
});

test('Aguardando cliente tem classes amarelas', () => {
  assert.equal(classesDeStatus('Aguardando cliente').bg, 'bg-yellow-100');
});

test('STATUS_PENDENTES inclui os esperados', () => {
  assert.ok(STATUS_PENDENTES.includes('Não iniciado'));
  assert.ok(STATUS_PENDENTES.includes('Aguardando cliente'));
  assert.ok(STATUS_PENDENTES.includes('Em andamento'));
});

test('Concluído NÃO é pendente', () => {
  assert.equal(statusEhPendente('Concluído'), false);
});
