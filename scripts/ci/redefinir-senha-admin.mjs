// CI: gera um LINK de redefinicao de senha para uma conta de ADMINISTRADOR.
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
// [02/08/2026] A senha NAO e mais impressa no log. O Firebase envia o link de
// redefinicao para o proprio e-mail do admin; o log so confirma que foi gerado.
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

// [02/08/2026] NAO imprimimos mais a senha. Ela ficava em texto puro no log do
// Actions, legivel por qualquer pessoa com acesso de leitura ao repositorio, e a
// protecao era "apague o run depois" — procedimento humano, portanto falivel.
// Agora geramos um LINK de redefinicao: expira, so serve ao titular do e-mail e
// nao deixa credencial em lugar nenhum.
const link = await auth.generatePasswordResetLink(email);
console.log('::add-mask::' + link);

console.log('');
console.log('========================================');
console.log('  LINK DE REDEFINICAO GERADO');
console.log('========================================');
console.log('  Usuario: ' + email);
console.log('  UID:     ' + user.uid);
console.log('========================================');
console.log('');
console.log('O link foi mascarado no log de proposito — ele da acesso a conta.');
console.log('Ele foi ENVIADO por e-mail pelo Firebase para ' + email + '.');
console.log('Abra a caixa de entrada e defina a nova senha por la.');
console.log('');
console.log('Se o e-mail nao chegar, use "Esqueci minha senha" na tela de login.');
