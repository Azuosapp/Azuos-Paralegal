// CI: marca o chamado como implementado (para não repetir) e adiciona nota ao autor.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

const sa = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const id = process.argv[2];
const nota = process.argv[3] || '🤖 Implementado automaticamente — PR aberto para revisão no GitHub.';
if (!id) { console.error('faltou o id'); process.exit(1); }

const ref = db.collection('azuos').doc('shared');
await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref);
  const data = snap.data() || {};
  const m = Array.isArray(data.manutencao) ? data.manutencao : [];
  const i = m.findIndex(t => t && t.id === id);
  if (i < 0) { console.log('chamado não encontrado:', id); return; }
  m[i]._auto_feito_em = new Date().toISOString();
  m[i].nota_admin = ((m[i].nota_admin ? m[i].nota_admin + '\n' : '') + nota).slice(0, 2000);
  m[i].updated_at = new Date().toISOString();
  tx.update(ref, { manutencao: m });
});
console.log('Chamado atualizado:', id);
