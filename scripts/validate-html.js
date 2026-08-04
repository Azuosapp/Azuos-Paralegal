#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf-8');
const errors = [];

if (!html.includes('<body')) errors.push('<body> ausente');
if (!html.includes('</body>')) errors.push('</body> ausente');
if (!html.includes('</html>')) errors.push('</html> ausente');

// [04/08/2026] ESTE VALIDADOR NAO VALIDAVA SINTAXE. Conserto abaixo.
//
// A versao anterior tentava capturar o script principal com
//     html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/)
// O ULTIMO </script> antes de </body> e o do <script src="/gestao.js">, entao o
// regex capturava ~612 mil dos 613 mil caracteres do arquivo: HTML, tags <script
// src=...>, tudo. new Function(code) falhava SEMPRE com "Unexpected token '<'" —
// e a linha seguinte, `if (!e.message.includes("'<'"))`, engolia exatamente esse
// erro. Ou seja: o unico criterio que o proprio arquivo chamava de "confiavel"
// estava desligado, e o CI carimbava "valido".
//
// Comprovado antes de mexer: injetei `function quebrado( { ;` no index.html e
// rodei o validador antigo. Saida: "✓ index.html válido", exit=0.
//
// Agora cada bloco <script> INLINE (sem src=) e validado separadamente. Blocos com
// src= sao arquivos externos, conferidos por `node --check` nos modulos.
const blocosInline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g)];
if (!blocosInline.length) {
  errors.push('Nenhum bloco <script> inline encontrado');
} else {
  // O maior bloco e o script principal; e nele que ficam as contagens.
  const principal = blocosInline.reduce((a, b) => (b[2].length > a[2].length ? b : a));
  const code = principal[2];

  blocosInline.forEach((m, i) => {
    const attrs = m[1] || '';
    const corpo = m[2];
    if (/\btype\s*=\s*["']?module/.test(attrs)) return; // ESM: import/export nao passa em new Function
    if (!corpo.trim()) return;
    try {
      new Function(corpo);
    } catch (e) {
      const linha = html.slice(0, m.index).split('\n').length;
      errors.push(`Parse JS no bloco <script> #${i + 1} (linha ~${linha}): ${e.message}`);
    }
  });

  const versoes = (code.match(/v5\.\d+\.\d+/g) || []).length;
  const iifes = (code.match(/^\(function/gm) || []).length;
  const observers = (code.match(/new MutationObserver/g) || []).length;
  const fileKB = Math.round(html.length / 1024);
  console.log(`📊 ${fileKB}KB | ${versoes} menções v5.x | ${iifes} IIFEs no topo | ${observers} MutationObservers`);

  // === Estágio 3 (parte 3): CONGELAMENTO ANTI-REMENDO (v6.1.3) ===
  // Não removemos os remendos existentes (muitos são correções de bug), mas
  // IMPEDIMOS que novos sejam criados: mudanças devem virar MÓDULO em public/.
  // [04/08/2026] Os numeros CAIRAM de 51 para 47 sem ninguem remover codigo: a
  // captura antiga pegava o arquivo inteiro (HTML incluso) e contava de mais. 47 e
  // a contagem verdadeira do script principal. Manter 51 aqui seria deixar folga
  // para quatro remendos novos entrarem sem o CI reclamar.
  //
  // CONVENCAO: estes numeros so DESCEM. Ao remover um remendo, baixe o teto no
  // mesmo commit. Subir exige justificativa explicita na descricao do PR — senao a
  // trava anti-remendo vira apenas um numero maior a cada mes.
  const MAX_IIFES = 47;
  const MAX_OBSERVERS = 11;
  if (iifes > MAX_IIFES) {
    errors.push(`Remendo novo detectado: ${iifes} IIFEs no topo (limite ${MAX_IIFES}). ` +
      `Não adicione novos IIFEs de patch — faça a mudança como MÓDULO em public/*.js.`);
  }
  if (observers > MAX_OBSERVERS) {
    errors.push(`MutationObservers acima do limite: ${observers} (limite ${MAX_OBSERVERS}). ` +
      `Evite novos observers globais; centralize no módulo apropriado.`);
  }
}

if (errors.length === 0) {
  console.log('✓ index.html válido');
  process.exit(0);
}
console.error('✗ inválido:');
errors.forEach(e => console.error('  -', e));
process.exit(1);
