import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM, VirtualConsole } from 'jsdom';
import { readFileSync } from 'node:fs';

/**
 * E2E light: carrega DOM (sem executar JS pesado) e valida estrutura.
 * Para testar lógica de negócio, ver tests/unit/* (rodam módulos puros).
 *
 * Por que não executar o JS inteiro?
 * - 6900 linhas com setTimeouts/setIntervals fazem JSDOM travar (40s+)
 * - Lógica pura já está em src/utils.js — testada em unit/
 * - Quando Fase 2 completa modularizar, este arquivo vira de verdade.
 */

function loadDomOnly() {
  const html = readFileSync('index.html', 'utf-8');
  const virtualConsole = new VirtualConsole();
  return new JSDOM(html, {
    runScripts: 'outside-only', // NÃO executa o script principal
    pretendToBeVisual: true,
    url: 'https://azuos-paralegal.web.app/',
    virtualConsole
  });
}

test('DOM: title correto', () => {
  const dom = loadDomOnly();
  const title = dom.window.document.querySelector('title');
  assert.ok(title);
  assert.match(title.textContent, /AZUOS Paralegal/);
});

test('DOM: <body> existe', () => {
  const dom = loadDomOnly();
  assert.ok(dom.window.document.body);
});

test('DOM: container #app existe (mount point do app)', () => {
  const dom = loadDomOnly();
  const app = dom.window.document.getElementById('app');
  assert.ok(app, 'div#app ausente');
});

test('DOM: script principal está presente e tem firebase config', () => {
  const dom = loadDomOnly();
  const scripts = dom.window.document.querySelectorAll('script');
  let hasFirebaseConfig = false;
  scripts.forEach(s => {
    if (s.textContent.includes('firebase.initializeApp') || s.textContent.includes('apiKey')) {
      hasFirebaseConfig = true;
    }
  });
  assert.ok(hasFirebaseConfig, 'config Firebase ausente');
});

test('DOM: meta charset UTF-8', () => {
  const dom = loadDomOnly();
  const meta = dom.window.document.querySelector('meta[charset]');
  assert.ok(meta);
  assert.match(meta.getAttribute('charset').toLowerCase(), /utf-8/);
});

test('DOM: Tailwind CSS carregado', () => {
  const dom = loadDomOnly();
  const html = dom.window.document.documentElement.outerHTML;
  assert.ok(html.includes('tailwindcss') || html.includes('tailwind'), 'Tailwind ausente');
});

test('DOM: Firebase SDK carregado via CDN', () => {
  const dom = loadDomOnly();
  const scripts = dom.window.document.querySelectorAll('script[src]');
  let hasFirebaseCDN = false;
  scripts.forEach(s => {
    const src = s.getAttribute('src') || '';
    if (src.includes('firebase')) hasFirebaseCDN = true;
  });
  assert.ok(hasFirebaseCDN, 'Firebase SDK não importado via <script src>');
});
