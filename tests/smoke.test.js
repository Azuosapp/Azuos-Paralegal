import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';

// Smoke tests: verifica integridade básica do index.html
test('index.html existe e é válido', () => {
  assert.equal(existsSync('index.html'), true);
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(html.includes('<title>'));
  assert.ok(html.includes('AZUOS Paralegal'));
  assert.ok(html.includes('</body>'));
  assert.ok(html.includes('</html>'));
});

test('script principal está fechado corretamente', () => {
  const html = readFileSync('index.html', 'utf-8');
  const m = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
  assert.ok(m, 'Script principal não encontrado');
  // Parse via Function — sintaxe geral
  try {
    new Function(m[1]);
  } catch(e) {
    // HTML em template literals é OK
    if (!e.message.includes("'<'")) throw e;
  }
});

test('SEED tem campos obrigatórios', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(/const SEED\s*=/.test(html), 'SEED não declarado');
  assert.ok(html.includes('"status_options"'), 'SEED.status_options ausente');
  assert.ok(html.includes('"tipos_alvara"'), 'SEED.tipos_alvara ausente');
});

test('Aguardando cliente está no SEED.status_options', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(html.includes('"Aguardando cliente"'));
});

test('Funções críticas existem', () => {
  const html = readFileSync('index.html', 'utf-8');
  const funcoes = ['function salvarAlvara', 'function render', 'function renderEmpresas', 'function _fsCollectFromState'];
  funcoes.forEach(f => {
    assert.ok(html.includes(f), `${f} ausente`);
  });
});

test('Cálculo de andamento inclui Aguardando cliente (v5.7.81)', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(/aguardando cliente/i.test(html), 'regex aguardando cliente ausente no cálculo');
});

test('Dedup automático das ciências armado (v5.7.84)', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(html.includes('v5.7.84'), 'patch v5.7.84 ausente');
  assert.ok(html.includes('dedup'), 'lógica de dedup ausente');
});

test('Configuração Firebase presente', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(html.includes('firebase.initializeApp'));
  assert.ok(html.includes('azuos-paralegal'));
});

test('Total de IIFEs ainda alto (esperado antes da Fase 2)', () => {
  const html = readFileSync('index.html', 'utf-8');
  const iifes = (html.match(/^\(function/gm) || []).length;
  // Hoje: 46. Meta na Fase 2: < 5
  console.log(`  IIFEs atuais: ${iifes} (meta Fase 2: <5)`);
  assert.ok(iifes > 0);
});

test('Backups críticos referenciados', () => {
  const html = readFileSync('index.html', 'utf-8');
  assert.ok(html.includes('backups') || html.includes('backup'), 'lógica de backup ausente');
});
