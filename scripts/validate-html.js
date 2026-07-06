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
    if (!e.message.includes("'<'")) {
      errors.push(`Parse JS: ${e.message}`);
    }
  }

  const versoes = (code.match(/v5\.\d+\.\d+/g) || []).length;
  const iifes = (code.match(/^\(function/gm) || []).length;
  const observers = (code.match(/new MutationObserver/g) || []).length;
  const fileKB = Math.round(html.length / 1024);
  console.log(`📊 ${fileKB}KB | ${versoes} menções v5.x | ${iifes} IIFEs no topo | ${observers} MutationObservers`);

  // === Estágio 3 (parte 3): CONGELAMENTO ANTI-REMENDO (v6.1.3) ===
  // Não removemos os remendos existentes (muitos são correções de bug), mas
  // IMPEDIMOS que novos sejam criados: mudanças devem virar MÓDULO em public/.
  const MAX_IIFES = 51;       // baseline congelado
  const MAX_OBSERVERS = 11;   // baseline congelado
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
