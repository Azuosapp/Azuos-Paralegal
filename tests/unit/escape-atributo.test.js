import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* escJs / escUrl — escape para dado que cai DENTRO de atributo (v7.11.0)
 *
 * O ponto destes testes: esc() troca ' por &#39;, o que está CERTO em contexto de
 * texto e ERRADO dentro de onclick="...". O parser HTML decodifica a entidade de
 * volta para aspa ANTES de o JavaScript ser compilado, e o escape se desfaz no meio
 * do caminho. O sistema tinha 8 pontos assim, mais dois onde alguém escreveu
 * esc(x).replace(/'/g,"\\'") — o esc() já tinha convertido a aspa, então o replace
 * não achava nada: parecia proteção e era no-op.
 *
 * O teste "simulaAtributo" reproduz a decodificação do parser, que é justamente o
 * passo que torna esc() insuficiente. Sem ele, um teste ingênuo aprovaria esc(). */
function carregarEscapes() {
  const html = readFileSync('index.html', 'utf-8');
  const ini = html.indexOf('function esc(s)');
  const fim = html.indexOf('window.escUrl = escUrl;');
  assert.ok(ini > 0 && fim > ini, 'não encontrei as funções de escape no index.html');
  const ctx = { window: {}, String, RegExp };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(html.slice(ini, fim + 40), ctx, { filename: 'index.html (escapes)' });
  return ctx;
}

/* O que o navegador faz com o valor de um atributo antes de compilar o JS:
   decodifica as entidades HTML. É por isso que &#39; não protege nada aqui. */
function simulaAtributo(valorDoAtributo) {
  return valorDoAtributo
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

const PAYLOAD = "'-alert(document.domain)-'";

test('esc() NÃO protege dentro de atributo — a aspa volta antes do JS compilar', () => {
  const { esc } = carregarEscapes();
  const compilado = simulaAtributo(`f('${esc(PAYLOAD)}')`);
  assert.ok(compilado.includes("''-alert"), 'este teste existe para documentar a falha do esc() aqui');
});

test('escJs() resiste: a aspa não reaparece depois da decodificação', () => {
  const { escJs } = carregarEscapes();
  const compilado = simulaAtributo(`f('${escJs(PAYLOAD)}')`);
  assert.ok(!/'\s*-\s*alert/.test(compilado), `a aspa escapou: ${compilado}`);
  assert.ok(compilado.includes('\\x27'), 'deveria usar \\x27, que o parser HTML não desfaz');
});

test('escJs() escapa a barra invertida antes de tudo (senão dá para escapar o escape)', () => {
  const { escJs } = carregarEscapes();
  const saida = escJs("\\'; alert(1); //");
  assert.ok(saida.startsWith('\\\\'), 'a barra invertida precisa ser duplicada primeiro');
});

test('escJs() remove quebras de linha, inclusive U+2028 e U+2029', () => {
  const { escJs } = carregarEscapes();
  const saida = escJs('a\r\nb c d');
  assert.equal(saida, 'abcd');
});

test('escUrl() recusa javascript:, em qualquer caixa ou disfarçado', () => {
  const { escUrl } = carregarEscapes();
  assert.equal(escUrl('javascript:alert(1)'), '');
  assert.equal(escUrl('JaVaScRiPt:alert(1)'), '');
  assert.equal(escUrl('  javascript:alert(1)'), '');
  assert.equal(escUrl('java\nscript:alert(1)'), '');
  assert.equal(escUrl('javascript:alert(1)'), '');
});

test('escUrl() recusa aspa que quebraria o atributo e permitiria onerror', () => {
  const { escUrl } = carregarEscapes();
  assert.equal(escUrl('x" onerror="alert(1)'), '');
});

test('escUrl() aceita o que o app realmente usa: data URL de imagem, PDF e https', () => {
  const { escUrl } = carregarEscapes();
  assert.ok(escUrl('data:image/jpeg;base64,AAAA').startsWith('data:image/jpeg'));
  assert.ok(escUrl('data:application/pdf;base64,AAAA').startsWith('data:application/pdf'));
  assert.ok(escUrl('https://exemplo.com/foto.png').startsWith('https://'));
  assert.equal(escUrl('/logo.png'), '/logo.png');
});

test('escUrl() recusa data: de tipo não previsto (ex.: text/html)', () => {
  const { escUrl } = carregarEscapes();
  assert.equal(escUrl('data:text/html;base64,PHNjcmlwdD4='), '');
});

/* Guarda de código: a armadilha esc(x).replace(/'/...) não pode voltar. Ela é
   silenciosa — parece proteção e não é —, então vale travar por texto. */
test('não existe mais o padrão esc(...).replace de aspas, que era no-op', () => {
  for (const arq of ['index.html', 'public/gestao.js']) {
    const txt = readFileSync(arq, 'utf-8');
    const achou = /_?esc\([^)]*\)\.replace\(\/'\/g/.test(txt);
    assert.ok(!achou, `${arq} voltou a usar esc(...).replace(/'/g, ...), que não protege nada`);
  }
});
