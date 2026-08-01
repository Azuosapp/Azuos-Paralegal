// CI: redefine a senha de uma conta de ADMINISTRADOR e imprime a nova senha no log.
//
// POR QUE ISTO EXISTE (e por que e' uma excecao deliberada):
// O motor normal de acessos (scripts/ci/processar-acessos.mjs) RECUSA de proposito
// mexer em conta de administrador — a trava existe pra impedir que alguem escale
// privilegio pelo app. Ela continua valendo. Este script e' o caminho de fora,
// usado pelo DONO quando o admin perdeu a senha e nao consegue nem entrar pra
// pedir reset (o galo-e-ovo: criar acesso exige estar logado como admin).
//
// LIMITES DE SEGURANCA:
//  - So aceita e-mail que ja e' administrador reconhecido (lista ADMINS abaixo).
//    Nao cria conta nova, nao promove ninguem, nao mexe em custom claims.
//  - A conta precisa JA EXISTIR no Firebase Auth. Se nao existir, falha.
//  - No Paralegal o cargo vem do e-mail (mapa em index.html), nao de um campo no
//    banco — por isso redefinir a senha ja devolve o acesso de admin, sem promover.
//
// ATENCAO: a senha e' impressa no log do Actions. Apague o run depois de copiar
// (gh run delete <id>) e troque a senha no primeiro acesso.
import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'node:crypto';
import fs from 'node:fs';

// mesma lista de admins do motor de acessos — manter as duas em sincronia
const ADMINS = [
  'contato@azuoscontabil.com.br',
  'comercial@azuoscontabil.com.br',
  'thierrymforte@gmail.com'
];

const email = (process.env.EMAIL_ALVO || '').trim().toLowerCase();

if (!email) {
  console.error('ERRO: informe o e-mail no input do workflow.');
  process.exit(1);
}
if (!ADMINS.includes(email)) {
  console.error(`ERRO: ${email} nao e' um administrador reconhecido.`);
  console.error('Admins aceitos: ' + ADMINS.join(', '));
  console.error('Para um admin NOVO nao basta rodar isto: e' + "' preciso criar a conta,");
  console.error('autorizar o e-mail em firestore.rules e mapear o cargo em index.html.');
  process.exit(1);
}

// senha legivel, sem caracteres ambiguos (0/O, 1/l) — 12 chars
function novaSenha() {
  const abc = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const buf = crypto.randomBytes(12);
  let s = '';
  for (let i = 0; i < 12; i++) s += abc[buf[i] % abc.length];
  return 'Azuos-' + s;
}

const sa = JSON.parse(fs.readFileSync('service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const auth = getAuth();

let user;
try {
  user = await auth.getUserByEmail(email);
} catch (e) {
  if (String(e.code || '').includes('user-not-found')) {
    console.error(`ERRO: nao existe conta no Firebase Auth para ${email}.`);
    console.error('Este script SO redefine senha de conta existente — ele nao cria.');
    process.exit(1);
  }
  throw e;
}

const senha = novaSenha();
await auth.updateUser(user.uid, { password: senha });

console.log('');
console.log('========================================');
console.log('  SENHA REDEFINIDA');
console.log('========================================');
console.log('  Usuario: ' + email);
console.log('  Senha:   ' + senha);
console.log('  UID:     ' + user.uid);
console.log('========================================');
console.log('');
console.log('Entre em https://azuos-paralegal.web.app e troque a senha.');
console.log('Depois de copiar, APAGUE este run: gh run delete <id>');
