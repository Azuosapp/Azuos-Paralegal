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

// Rodando de hora em hora sem ninguem olhando, um chamado que falha seria
// repescado para sempre — queimando execucoes e podendo abrir PRs repetidos.
// Por isso cada chamado tem no maximo MAX_TENTATIVAS; depois disso ele fica
// marcado para o admin resolver na mao e sai da fila automatica.
const MAX_TENTATIVAS = 3;

const elegivel = (t) =>
  t && t.status === 'aprovado' && !t._auto_feito_em && !t.arquivado && !t._auto_desistiu;

async function achar() {
  const snap = await db.collection('azuos').doc('shared').get();
  const data = snap.exists ? (snap.data() || {}) : {};
  const m = Array.isArray(data.manutencao) ? data.manutencao : [];
  return m
    .filter(t => elegivel(t) && (t._auto_tentativas || 0) < MAX_TENTATIVAS)
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''))[0];
}

// Marca a tentativa ANTES de rodar. Se o job morrer no meio, a contagem ja subiu,
// entao um chamado problematico nao trava a fila indefinidamente.
async function registrarTentativa(id) {
  const ref = db.collection('azuos').doc('shared');
  let n = 0;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? (snap.data() || {}) : {};
    const m = Array.isArray(data.manutencao) ? data.manutencao.slice() : [];
    const i = m.findIndex(x => x && x.id === id);
    if (i < 0) return;
    n = (m[i]._auto_tentativas || 0) + 1;
    m[i] = { ...m[i], _auto_tentativas: n };
    if (n >= MAX_TENTATIVAS) {
      m[i]._auto_desistiu = true;
      m[i].nota_admin = ((m[i].nota_admin ? m[i].nota_admin + '\n' : '') +
        '⚠️ A automacao tentou ' + n + 'x e nao concluiu. Saiu da fila automatica — precisa de revisao manual.');
    }
    tx.update(ref, { manutencao: m });
  });
  return n;
}

let t = null;
for (let i = 0; i < 6; i++) {
  t = await achar();
  if (t) break;
  console.log(`tentativa ${i + 1}: nenhum chamado aprovado ainda; aguardando...`);
  await sleep(3000);
}

if (!t) { setOut('has_ticket', 'false'); console.log('Nenhum chamado aprovado pendente (apos varias tentativas).'); process.exit(0); }

try {
  const n = await registrarTentativa(t.id);
  console.log(`Tentativa ${n} de ${MAX_TENTATIVAS} para o chamado ${t.id}.`);
} catch (e) {
  console.log('Aviso: nao consegui registrar a tentativa —', e.message);
}

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

