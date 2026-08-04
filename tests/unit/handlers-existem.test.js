import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/* Todo handler inline precisa apontar para uma função que existe.
 *
 * Por que este teste existe. O index.html liga a interface ao código por atributos
 * como onclick="minhaFuncao(...)". Uma string não é verificada por nada: se a função
 * for renomeada ou removida, o atributo continua lá e o botão simplesmente não faz
 * nada. Nenhum erro no CI, nenhum erro na tela — só um clique que não responde.
 *
 * Em 04/08/2026 removi handleSyncDrive (207 linhas de código morto). O bind dela
 * estava atrás de um `if (_sd)` e por isso era inofensivo, mas o episódio deixou
 * claro que nada no projeto conferia esse vínculo. Este teste confere.
 *
 * Ele varre index.html e public/*.js atrás de nomes chamados em atributos de
 * evento e exige que cada um esteja declarado em algum lugar do código. */

const ARQUIVOS = ['index.html', 'public/gestao.js', 'public/inteligencia.js', 'public/zuzu.js'];

/* Nomes que o navegador oferece ou que vêm de bibliotecas externas: não são nossos
   para declarar. Manter esta lista curta e justificada. */
const EXTERNOS = new Set([
  'alert', 'confirm', 'prompt', 'event', 'window', 'document', 'this', 'console',
  'setTimeout', 'setInterval', 'clearInterval', 'clearTimeout', 'requestAnimationFrame',
  'return', 'if', 'for', 'while', 'switch', 'catch', 'var', 'let', 'const',
  'true', 'false', 'null', 'undefined', 'new', 'typeof', 'firebase', 'Number',
  'String', 'Boolean', 'Array', 'Object', 'JSON', 'Math', 'Date', 'Set', 'Map',
  'RegExp', 'parseInt', 'parseFloat', 'isNaN', 'encodeURIComponent', 'decodeURIComponent',
]);

/* Remove o conteúdo das strings antes de procurar chamadas. Sem isto o varredor
   acusa "scale()" de transform:'scale(1.03)' e nomes que aparecem dentro do texto
   de um confirm(). O que interessa é o CÓDIGO do handler, não os literais dele. */
function semLiterais(corpo) {
  return corpo
    // DESESCAPA primeiro. Dentro de um atributo HTML as strings do JS aparecem como
    // \'...\'; trocando a barra por espaço eu destruía a fronteira da string e o
    // conteúdo dela virava código aos olhos do varredor — era assim que
    // transform:'scale(1.03)' era acusado de chamar uma função chamada scale.
    .replace(/\\'/g, "'").replace(/\\"/g, '"')
    .replace(/'[^']*'/g, "''")
    .replace(/"[^"]*"/g, '""')
    .replace(/`[^`]*`/g, '``');
}

function fonteCompleta() {
  return ARQUIVOS.map((a) => {
    try { return readFileSync(a, 'utf-8'); } catch (e) { return ''; }
  }).join('\n');
}

/* Nomes declarados: function X(), window.X =, var/let/const X = function|=>,
   X: function (dentro de objeto), e X = function no escopo. */
function nomesDeclarados(src) {
  const nomes = new Set();
  const padroes = [
    /\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g,
    /window\.([A-Za-z_$][\w$]*)\s*=/g,
    /(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:function|\()/g,
    /\b([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?function\b/g,
  ];
  for (const p of padroes) {
    let m;
    while ((m = p.exec(src)) !== null) nomes.add(m[1]);
  }
  return nomes;
}

/* Nomes chamados dentro de um atributo de evento inline. */
function nomesChamadosEmHandlers(src) {
  const chamados = new Map(); // nome -> trecho de exemplo
  const atributo = /\son(?:click|change|input|submit|keyup|keydown|mouseover|mouseout|blur|focus)\s*=\s*(["'])([\s\S]*?)\1/gi;
  let m;
  while ((m = atributo.exec(src)) !== null) {
    const corpo = semLiterais(m[2]);
    // acentos entram no nome: sem isto, `_verCiências(` era lido como `ncias(`
    const chamada = /(?:^|[^.\w$\u00C0-\u024F])([A-Za-z_$\u00C0-\u024F][\w$\u00C0-\u024F]*)\s*\(/g;
    let c;
    while ((c = chamada.exec(corpo)) !== null) {
      const nome = c[1];
      if (EXTERNOS.has(nome)) continue;
      if (!chamados.has(nome)) chamados.set(nome, corpo.slice(0, 90));
    }
  }
  return chamados;
}

test('todo handler inline chama função que existe', () => {
  const src = fonteCompleta();
  const declarados = nomesDeclarados(src);
  const chamados = nomesChamadosEmHandlers(src);

  assert.ok(chamados.size > 20, `esperava dezenas de handlers, achei ${chamados.size} — o varredor deve estar quebrado`);

  const faltando = [];
  for (const [nome, exemplo] of chamados) {
    if (!declarados.has(nome)) faltando.push(`${nome}()  em: ${exemplo}`);
  }
  assert.deepEqual(faltando, [], 'handler aponta para função que não existe:\n  ' + faltando.join('\n  '));
});

test('handleSyncDrive não voltou — é código morto removido', () => {
  const src = fonteCompleta();
  // A nota de remoção cita o nome em comentário; o que não pode voltar é a chamada.
  const semComentarios = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
  const chamadaViva = /\bhandleSyncDrive\s*[(;=]/.test(semComentarios.replace(/handleSyncDriveAuto/g, ''));
  assert.equal(chamadaViva, false, 'handleSyncDrive voltou; se o botão for reativado, ligue em handleSyncDriveAuto');
});

test('existe exatamente UM caminho de sincronização com a planilha', () => {
  const html = readFileSync('index.html', 'utf-8');
  const definicoes = (html.match(/^async function handleSyncDrive\w*\(/gm) || []);
  assert.equal(definicoes.length, 1,
    `esperava 1 função de sincronização, achei ${definicoes.length}: ${definicoes.join(', ')}. ` +
    'Duas cópias significa que toda correção precisa ser escrita duas vezes — foi assim que ' +
    'o id de empresa e a sobreposição das edições precisaram de conserto em dobro.');
});
