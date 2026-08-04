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
  const MAX_IIFES = 46;
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

/* === PORTA UNICA DE ESCRITA DAS EDICOES DE ALVARA (04/08/2026) ===============
   A revisao de arquitetura mapeou DOZE gravadores para edicoes_alvaras, em TRES
   destinos. Foi assim que, em 26/07, uma correcao redirecionou cinco e nao viu o
   sexto — que rodava a cada 20s e desfazia a migracao — e em 04/08 apareceu ainda
   um setimo, sobrescrevendo edicao boa com copia parcial.

   Quem escreve edicao de alvara usa window.salvarEdicaoDeAlvara(id, campos) ou
   window.publicarEdicoes(). Os primitivos ficam dentro de public/firestore.js.

   Esta regra e o ponto do exercicio: os doze gravadores anteriores foram escritos
   por gente atenta, entao confiar em atencao nao funciona. */
const ARQ_DONO = 'public/firestore.js';
const PROIBIDOS = [
  { termo: '_edicoesCloudSave',     alt: 'window.publicarEdicoes()' },
  { termo: '_edicoesCloudPublicar', alt: 'window.publicarEdicoes()' },
];
// Regra separada: devolver o campo legado para dentro do azuos/shared. Guardar
// edicoes_alvaras num BACKUP e legitimo (a coluna de backup nao e o dado vivo), e a
// primeira versao desta regra reprovava justamente isso. O que nao pode e a
// combinacao "shared" + "edicoes_alvaras" na mesma linha — e assim que o campo de
// 500 KB volta ao documento que ja passou de 1 MB e travou o sistema inteiro.
const LEGADO_NO_SHARED = (linha) =>
  linha.includes('edicoes_alvaras') && /\bshared\b/.test(linha);
const { readdirSync, statSync } = await import('node:fs');
const alvos = ['index.html'];
for (const d of ['public', 'src']) {
  try {
    readdirSync(d).filter(f => f.endsWith('.js')).forEach(f => alvos.push(`${d}/${f}`));
  } catch (e) { /* pasta ausente: nada a conferir */ }
}
for (const arq of alvos) {
  if (arq === ARQ_DONO) continue;
  let txt;
  try { txt = readFileSync(arq, 'utf-8'); } catch (e) { continue; }
  // Comentario de BLOCO precisa ser removido antes de quebrar em linhas — senao a
  // regra acusa o proprio comentario que explica a regra. Foi o que aconteceu na
  // primeira versao: o texto que documenta "nao grave edicoes_alvaras no shared"
  // era reprovado por conter essas duas palavras. Trocamos o miolo por linhas em
  // branco para os numeros de linha continuarem batendo com o arquivo real.
  const semBloco = txt.replace(/\/\*[\s\S]*?\*\//g, (m) => '\n'.repeat((m.match(/\n/g) || []).length));
  semBloco.split('\n').forEach((linha, i) => {
    const semComentario = linha.replace(/\/\/.*$/, '');
    for (const { termo, alt } of PROIBIDOS) {
      if (semComentario.includes(termo)) {
        errors.push(`${arq}:${i + 1} usa "${termo}" fora de ${ARQ_DONO}. ` +
          `Escrita de edicao de alvara passa por ${alt} — ver a porta unica em ${ARQ_DONO}.`);
      }
    }
    if (LEGADO_NO_SHARED(semComentario)) {
      errors.push(`${arq}:${i + 1} grava edicoes_alvaras dentro de azuos/shared. ` +
        `Esse campo saiu de la na v7.2.0 (o shared passou de 1 MB e travou TODAS as ` +
        `gravacoes). Use window.salvarEdicaoDeAlvara(id, campos).`);
    }
  });
}

if (errors.length === 0) {
  console.log('✓ index.html válido');
  process.exit(0);
}
console.error('✗ inválido:');
errors.forEach(e => console.error('  -', e));
process.exit(1);
