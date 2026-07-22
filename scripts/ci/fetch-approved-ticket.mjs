// CI: le o chamado de manutencao APROVADO mais antigo ainda nao implementado.
// Resiliente: tenta varias vezes (concorrencia entre navegadores pode sobrescrever
// a lista por instantes). Escreve os detalhes em .ci-ticket.md e expoe outputs.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'node:fs';

const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || fs.readFileSync('service-account.json', 'utf8');
initializeApp({ credential: cert(JSON.parse(raw)) });
const db = getFirestore();

const outFile = process.env.GITHUB_OUTPUT || '/dev/stdout';
const setOut = (k, v) => fs.appendFileSync(outFile, `${k}=${v}\n`);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function achar() {
  const snap = await db.collection('azuos').doc('shared').get();
  const data = snap.exists ? (snap.data() || {}) : {};
  const m = Array.isArray(data.manutencao) ? data.manutencao : [];
  return m
    .filter(t => t && t.status === 'aprovado' && !t._auto_feito_em && !t.arquivado)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
}

let t = null;
for (let i = 0; i < 6; i++) {
  t = await achar();
  if (t) break;
  console.log(`tentativa ${i + 1}: nenhum chamado aprovado ainda; aguardando...`);
  await sleep(3000);
}

if (!t) { setOut('has_ticket', 'false'); console.log('Nenhum chamado aprovado pendente (apos varias tentativas).'); process.exit(0); }

const md = [
  '# Chamado de manutencao',
  '',
  '- Tipo: ' + (t.tipo === 'melhoria' ? 'Melhoria (nova funcionalidade)' : 'Bug (correcao)'),
  '- Titulo: ' + (t.titulo || ''),
  '- Tela indicada: ' + (t.pagina || '(nao informado)'),
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
