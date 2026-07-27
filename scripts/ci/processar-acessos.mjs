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

const COL = db.collection('azuos_acessos'); // colecao propria (fora do doc 'shared')

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

// le a colecao inteira e filtra os pendentes (colecao pequena)
const qs = await COL.get();
const pendentes = [];
qs.forEach(doc => {
  const p = { id: doc.id, ...doc.data() };
  if (p.status !== 'feito' && p.status !== 'erro' && !p._processado_em && !p.arquivado) pendentes.push(p);
});

if (!pendentes.length) { console.log('Nenhum pedido de acesso pendente.'); process.exit(0); }
console.log(`Pedidos pendentes: ${pendentes.length}`);

// processa e grava o resultado em cada doc (por documento — sem disputa)
for (const p of pendentes) {
  const r = await processarUm(p);
  const agora = new Date().toISOString();
  const patch = r.ok
    ? { status: 'feito', senha_temp: r.senha_temp, uid: r.uid, resultado: r.acao, _processado_em: agora }
    : { status: 'erro', resultado: r.erro, _processado_em: agora };
  await COL.doc(p.id).set(patch, { merge: true });
  console.log(`- ${p.id} (${p.tipo} ${p.email}): ${r.ok ? 'OK — ' + r.acao : 'ERRO — ' + r.erro}`);
}
console.log('Resultados gravados.');
