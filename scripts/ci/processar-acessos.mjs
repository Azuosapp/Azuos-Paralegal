// CI: processa pedidos de ACESSO feitos pelo admin dentro do sistema.
// Le o campo `admin_acessos` do doc azuos/shared, e para cada pedido PENDENTE:
//  - tipo 'criar' : cria a conta (email + senha temporaria aleatoria)
//  - tipo 'reset' : redefine a senha da conta existente (por email)
// Grava o resultado de volta (status + senha_temp) para o admin copiar no app.
//
// SEGURANCA:
//  - NUNCA cria/edita conta de administrador (cargo 'Administrador' e' recusado).
//  - So processa pedidos cujo solicitado_por esteja na allowlist de admins.
//  - Nao define nenhuma custom claim; apenas contas comuns de e-mail/senha.
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';
import fs from 'node:fs';

const ADMINS = [
  'contato@azuoscontabil.com.br',
  'comercial@azuoscontabil.com.br',
  'thierrymforte@gmail.com'
];

const sa = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();
const auth = getAuth();

const ref = db.collection('azuos').doc('shared');

// senha temporaria legivel e forte o suficiente (>= 6): prefixo + aleatorio
function senhaTemp() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  const buf = crypto.randomBytes(8);
  for (let i = 0; i < 8; i++) s += abc[buf[i] % abc.length];
  return 'Azuos-' + s; // ex.: Azuos-k7Qm2xTp
}

const ehEmail = (e) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test((e || '').trim());

async function processarUm(p) {
  // validacoes de seguranca
  if (!p || typeof p !== 'object') return { erro: 'pedido invalido' };
  if (!['criar', 'reset'].includes(p.tipo)) return { erro: 'tipo invalido' };
  const email = (p.email || '').trim().toLowerCase();
  if (!ehEmail(email)) return { erro: 'e-mail invalido' };
  if ((p.cargo || '').toLowerCase() === 'administrador') return { erro: 'nao permitido criar/alterar admin por aqui' };
  const solicitante = (p.solicitado_por || '').trim().toLowerCase();
  if (!ADMINS.includes(solicitante)) return { erro: 'solicitante nao autorizado' };

  const senha = senhaTemp();
  try {
    if (p.tipo === 'criar') {
      try {
        const u = await auth.createUser({ email, password: senha, displayName: p.nome || undefined, emailVerified: false });
        return { ok: true, uid: u.uid, senha_temp: senha, acao: 'conta criada' };
      } catch (e) {
        if (String(e.code || e.message).includes('already-exists') || String(e.code || '').includes('email-already-exists')) {
          // ja existe -> vira reset de senha
          const u = await auth.getUserByEmail(email);
          await auth.updateUser(u.uid, { password: senha });
          return { ok: true, uid: u.uid, senha_temp: senha, acao: 'conta ja existia — senha redefinida' };
        }
        throw e;
      }
    } else { // reset
      const u = await auth.getUserByEmail(email); // lanca se nao existir
      await auth.updateUser(u.uid, { password: senha });
      return { ok: true, uid: u.uid, senha_temp: senha, acao: 'senha redefinida' };
    }
  } catch (e) {
    const code = String(e.code || '');
    if (code.includes('user-not-found')) return { erro: 'conta nao encontrada para esse e-mail (use "criar")' };
    return { erro: (e.message || code || 'falha').slice(0, 300) };
  }
}

// snapshot inicial (fora da transacao) para saber o que processar
const snap0 = await ref.get();
const data0 = snap0.exists ? (snap0.data() || {}) : {};
const lista0 = Array.isArray(data0.admin_acessos) ? data0.admin_acessos : [];
const pendentes = lista0.filter(p => p && p.status !== 'feito' && p.status !== 'erro' && !p._processado_em);

if (!pendentes.length) { console.log('Nenhum pedido de acesso pendente.'); process.exit(0); }
console.log(`Pedidos pendentes: ${pendentes.length}`);

// processa cada um (fora da transacao — chamadas ao Auth), guardando resultados por id
const resultados = {};
for (const p of pendentes) {
  const r = await processarUm(p);
  resultados[p.id] = r;
  console.log(`- ${p.id} (${p.tipo} ${p.email}): ${r.ok ? 'OK — ' + r.acao : 'ERRO — ' + r.erro}`);
}

// grava os resultados de volta em transacao (nao sobrescreve pedidos novos)
await db.runTransaction(async (tx) => {
  const snap = await tx.get(ref);
  const data = snap.data() || {};
  const lista = Array.isArray(data.admin_acessos) ? data.admin_acessos.slice() : [];
  let mudou = false;
  for (const id of Object.keys(resultados)) {
    const i = lista.findIndex(x => x && x.id === id);
    if (i < 0) continue;
    const r = resultados[id];
    const agora = new Date().toISOString();
    if (r.ok) {
      lista[i] = { ...lista[i], status: 'feito', senha_temp: r.senha_temp, uid: r.uid, resultado: r.acao, _processado_em: agora };
    } else {
      lista[i] = { ...lista[i], status: 'erro', resultado: r.erro, _processado_em: agora };
    }
    mudou = true;
  }
  if (mudou) tx.update(ref, { admin_acessos: lista });
});
console.log('Resultados gravados.');
