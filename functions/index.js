'use strict';
/**
 * AZUOS Paralegal — criacao/reset de acesso INSTANTANEO.
 *
 * Gatilho: quando o app (admin) cria um documento em 'azuos_acessos', esta funcao
 * dispara na hora (~1-3s), cria ou reseta a conta no Firebase Auth e grava a senha
 * temporaria de volta no proprio documento. O painel do app ouve em tempo real e
 * mostra "FEITO" com a senha para copiar.
 *
 * Gen 1 (firebase-functions/v1) — deploy mais simples (sem Eventarc).
 */
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

admin.initializeApp();

// Administradores autorizados a solicitar acesso (defesa em profundidade:
// o painel ja restringe no cliente; aqui reforcamos no servidor).
const ADMINS = [
  'contato@azuoscontabil.com.br',
  'comercial@azuoscontabil.com.br',
  'thierrymforte@gmail.com'
];

function gerarSenha() {
  const abc = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
  let s = '';
  for (let i = 0; i < 8; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return 'Azuos-' + s;
}

exports.processarAcesso = functions
  .region('us-central1')
  .firestore.document('azuos_acessos/{id}')
  .onCreate(async (snap) => {
    const p = (snap && snap.data()) || {};
    // ja processado? ignora
    if (p._processado_em) return null;
    if (p.status && p.status !== 'pendente') return null;

    const patch = { _processado_em: new Date().toISOString() };
    const email = String(p.email || '').trim().toLowerCase();
    const solicitante = String(p.solicitado_por || '').trim().toLowerCase();

    try {
      if (!ADMINS.includes(solicitante)) {
        return snap.ref.set(
          Object.assign({}, patch, { status: 'erro', resultado: 'Solicitante nao autorizado.' }),
          { merge: true }
        );
      }
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return snap.ref.set(
          Object.assign({}, patch, { status: 'erro', resultado: 'E-mail invalido.' }),
          { merge: true }
        );
      }

      const senha = gerarSenha();
      let uid, acao, user = null;
      try { user = await admin.auth().getUserByEmail(email); } catch (e) { user = null; }

      if (user) {
        await admin.auth().updateUser(user.uid, { password: senha });
        uid = user.uid; acao = 'senha redefinida';
      } else {
        const novo = await admin.auth().createUser({
          email,
          password: senha,
          displayName: (String(p.nome || '').trim()) || undefined
        });
        uid = novo.uid; acao = 'conta criada';
      }

      return snap.ref.set(
        Object.assign({}, patch, { status: 'feito', senha_temp: senha, uid: uid, resultado: acao }),
        { merge: true }
      );
    } catch (err) {
      return snap.ref.set(
        Object.assign({}, patch, { status: 'erro', resultado: String((err && err.message) || err) }),
        { merge: true }
      );
    }
  });
