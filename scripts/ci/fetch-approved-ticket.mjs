// CI: lê o chamado de manutenção APROVADO mais antigo ainda não implementado.
// Escreve os detalhes em .ci-ticket.md e expõe outputs para o workflow.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

const sa = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const outFile = process.env.GITHUB_OUTPUT || '/dev/stdout';
const setOut = (k, v) => fs.appendFileSync(outFile, `${k}=${v}\n`);

const snap = await db.collection('azuos').doc('shared').get();
const data = snap.exists ? (snap.data() || {}) : {};
const m = Array.isArray(data.manutencao) ? data.manutencao : [];
const pend = m
  .filter(t => t && t.status === 'aprovado' && !t._auto_feito_em && !t.arquivado)
  .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

const t = pend[0];
if (!t) { setOut('has_ticket', 'false'); console.log('Nenhum chamado aprovado pendente.'); process.exit(0); }

const md = [
  '# Chamado de manutenção',
  '',
  '- Tipo: ' + (t.tipo === 'melhoria' ? 'Melhoria (nova funcionalidade)' : 'Bug (correção)'),
  '- Título: ' + (t.titulo || ''),
  '- Tela indicada: ' + (t.pagina || '(não informado)'),
  '',
  '## Detalhes do que foi relatado',
  (t.descricao || '(sem detalhes)'),
  ''
].join('\n');
fs.writeFileSync('.ci-ticket.md', md, 'utf8');

setOut('has_ticket', 'true');
setOut('ticket_id', t.id);
setOut('ticket_titulo', String(t.titulo || 'chamado').replace(/[\r\n]+/g, ' ').slice(0, 120));
console.log('Chamado selecionado:', t.id, '-', t.titulo);
