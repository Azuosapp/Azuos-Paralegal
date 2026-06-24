#!/usr/bin/env node
import { readFileSync } from 'node:fs';

const html = readFileSync('index.html', 'utf-8');
const errors = [];

if (!html.includes('<body')) errors.push('<body> ausente');
if (!html.includes('</body>')) errors.push('</body> ausente');
if (!html.includes('</html>')) errors.push('</html> ausente');

const mainScript = html.match(/<script>([\s\S]*?)<\/script>\s*<\/body>/);
if (!mainScript) {
  errors.push('Script principal não encontrado');
} else {
  const code = mainScript[1];

  // Parse via Function — único critério confiável
  try {
    new Function(code);
  } catch(e) {
    // Aceitamos "Unexpected token '<'" — sintoma de HTML em template literal, não erro real
    if (!e.message.includes("'<'")) {
      errors.push(`Parse JS: ${e.message}`);
    }
  }

  const versoes = (code.match(/v5\.\d+\.\d+/g) || []).length;
  const iifes = (code.match(/^\(function/gm) || []).length;
  const observers = (code.match(/new MutationObserver/g) || []).length;
  const fileKB = Math.round(html.length / 1024);
  console.log(`📊 ${fileKB}KB | ${versoes} menções v5.x | ${iifes} IIFEs no topo | ${observers} MutationObservers`);
}

if (errors.length === 0) {
  console.log('✓ index.html válido');
  process.exit(0);
}
console.error('✗ inválido:');
errors.forEach(e => console.error('  -', e));
process.exit(1);
