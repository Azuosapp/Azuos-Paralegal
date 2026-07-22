// CI (uso manual/teste): semeia um chamado de manutencao APROVADO no banco,
// para validar o fluxo ponta a ponta sem depender do navegador.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';
initializeApp({ credential: cert(JSON.parse(fs.readFileSync('service-account.json', 'utf8'))) });
const db = getFirestore();
const ref = db.collection('azuos').doc('shared');
const t = {
  id: 'mnt_test_' + Date.now(), tipo: 'melhoria',
  titulo: '[TESTE AUTOMACAO] Aviso de revisao na tela de Manutencao',
  descricao: 'Adicionar, logo abaixo do paragrafo cinza de subtitulo da tela de Manutencao (dentro da funcao renderManutencao no index.html), um texto pequeno em cinza com exatamente este conteudo: "Seu chamado e revisado pelo administrador antes de ser atendido." E apenas um texto informativo — mudanca minima, sem alterar nenhuma logica. Respeite a trava anti-patch.',
  pagina: 'Manutencao', prints: [], autor_nome: 'Teste CI', autor_email: '',
  status: 'aprovado', nota_admin: '', obs_interna: '', arquivado: false,
  created_at: new Date().toISOString(), updated_at: new Date().toISOString()
};
await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref);
  const data = snap.data() || {};
  const m = Array.isArray(data.manutencao) ? data.manutencao : [];
  m.unshift(t);
  tx.update(ref, { manutencao: m });
});
console.log('Chamado de teste semeado:', t.id);
