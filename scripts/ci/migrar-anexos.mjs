/**
 * AZUOS Paralegal — anexos do Firestore para o Storage do Supabase.
 *
 * TRES ACOES, escolhidas por MODO:
 *   medir   — so conta e mede. Nao escreve nada, nao apaga nada.
 *   orfaos  — lista os anexos que NENHUM alvara referencia. Nao apaga.
 *   migrar  — copia para o Storage, CONFERE que chegou e so entao apaga do banco.
 *
 * POR QUE NAO USA A CHAVE-MESTRA DO SUPABASE. Ela da acesso total ao banco
 * COMPARTILHADO com o Trilha (alunos, feed, financeiro). Guarda-la nos segredos
 * deste repositorio ampliaria a exposicao dela para toda pessoa com acesso de
 * escrita aqui. Em vez disso, este script se autentica como um usuario autorizado
 * (custom token do Admin SDK, o mesmo padrao do verificar-regras.yml) e pede
 * autorizacao a MESMA Edge Function que o app usa. Se a funcao recusar o script,
 * ela tambem recusaria o app — o caminho testado e o caminho real.
 *
 * ORDEM SEGURA, e ela nao e negociavel: sobe -> confere que chegou com o tamanho
 * certo -> so entao apaga do Firestore. Nunca apagar antes de confirmar. Se algo
 * falhar no meio, o anexo continua nos dois lugares, o que e recuperavel; o
 * contrario nao e.
 */
import admin from 'firebase-admin';

const PROJ = 'azuos-paralegal';
const SB_URL = 'https://vjwtvnttlywamibuwyqm.supabase.co';
const FUNCAO = 'anexos';
const IDENTIDADE = 'contato@azuoscontabil.com.br';   // precisa estar na lista da funcao

const MODO = (process.env.MODO || 'medir').toLowerCase();
const LIMITE = Number(process.env.LIMITE || 0) || Infinity;
const WEB_KEY = process.env.WEB_API_KEY;
const SB_ANON = process.env.SB_ANON;

admin.initializeApp({ credential: admin.credential.applicationDefault(), projectId: PROJ });
const db = admin.firestore();

/* ---- vira "a pessoa", sem precisar da senha dela ---- */
async function tokenDeUsuario() {
  const u = await admin.auth().getUserByEmail(IDENTIDADE);
  const custom = await admin.auth().createCustomToken(u.uid);
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${WEB_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: custom, returnSecureToken: true }),
  });
  const j = await r.json();
  if (!j.idToken) throw new Error('nao autentiquei: ' + JSON.stringify(j.error?.message || j));
  return j.idToken;
}

async function autorizar(idToken, acao, chave) {
  const r = await fetch(`${SB_URL}/functions/v1/${FUNCAO}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: SB_ANON, Authorization: `Bearer ${idToken}` },
    body: JSON.stringify({ acao, chave }),
  });
  if (!r.ok) throw new Error(`funcao ${acao} HTTP ${r.status}: ${(await r.text()).slice(0, 140)}`);
  return (await r.json()).url;
}

/* ---- quais chaves de anexo os alvaras realmente referenciam ---- */
async function chavesEmUso() {
  const usadas = new Set();
  const anota = (lista) => {
    (Array.isArray(lista) ? lista : []).forEach((a) => { if (a && a._idb) usadas.add(String(a._idb)); });
  };

  const meta = await db.doc('azuos/edicoes_meta').get();
  const n = (meta.exists && meta.data().n) || 0;
  let bruto = '';
  for (let i = 0; i < n; i++) {
    const d = await db.doc(`azuos/edicoes_${i}`).get();
    bruto += ((d.exists && d.data()) || {}).d || '';
  }
  const eds = JSON.parse(bruto || '{}');
  Object.values(eds).forEach((e) => { anota(e && e.anexos); anota(e && e.conversas); });

  const mAlv = await db.doc('azuos/alvaras_meta').get();
  const nA = (mAlv.exists && mAlv.data().n) || 0;
  let brutoA = '';
  for (let i = 0; i < nA; i++) {
    const d = await db.doc(`azuos/alvaras_${i}`).get();
    brutoA += ((d.exists && d.data()) || {}).d || '';
  }
  JSON.parse(brutoA || '[]').forEach((a) => anota(a && a.anexos));

  // prints dos chamados de manutencao vivem no shared
  const sh = await db.doc('azuos/shared').get();
  ((sh.exists && sh.data().manutencao) || []).forEach((t) => anota(t && t.prints));

  return usadas;
}

/* ---- inventario dos anexos, sem baixar o base64 ---- */
async function inventario() {
  const snap = await db.collection('azuos').select('ts', 'nome', 'n').get();
  const itens = [];
  snap.forEach((d) => {
    if (!d.id.startsWith('anx_') || d.id.includes('__')) return;
    const v = d.data() || {};
    itens.push({ id: d.id, chave: d.id.slice(4), ts: v.ts || 0, nome: v.nome || '', n: v.n || 1 });
  });
  return itens;
}

async function baixarBase64(chave, n) {
  if (n <= 1) {
    const d = await db.doc(`azuos/anx_${chave}`).get();
    return ((d.exists && d.data()) || {}).d || '';
  }
  let full = '';
  for (let j = 0; j < n; j++) {
    const d = await db.doc(`azuos/anx_${chave}__${j}`).get();
    full += ((d.exists && d.data()) || {}).d || '';
  }
  return full;
}

function bytesDeDataUrl(dataUrl) {
  const virgula = dataUrl.indexOf(',');
  const tipo = dataUrl.slice(5, virgula).split(';')[0] || 'application/octet-stream';
  return { tipo, bytes: Buffer.from(dataUrl.slice(virgula + 1), 'base64') };
}

/* ============================ acoes ============================ */

async function medir() {
  const itens = await inventario();
  const usadas = await chavesEmUso();
  const orfaos = itens.filter((i) => !usadas.has(i.chave));
  const fatiados = itens.filter((i) => i.n > 1);

  console.log('ANEXOS NO FIRESTORE');
  console.log('  total ......................... ' + itens.length);
  console.log('  referenciados por algum alvara  ' + (itens.length - orfaos.length));
  console.log('  ORFAOS (ninguem aponta) ....... ' + orfaos.length);
  console.log('  fatiados (arquivo > 0,8 MB) ... ' + fatiados.length);
  console.log('');
  console.log('  chaves referenciadas que NAO existem mais como anexo: '
    + [...usadas].filter((k) => !itens.some((i) => i.chave === k)).length);
  console.log('');
  console.log('  os 5 mais recentes:');
  itens.sort((a, b) => b.ts - a.ts).slice(0, 5).forEach((a) => {
    const q = a.ts ? new Date(a.ts).toISOString().slice(0, 16).replace('T', ' ') : 'sem data';
    console.log('    ' + q + '  ' + (a.nome || a.id).slice(0, 46));
  });
}

async function listarOrfaos() {
  const itens = await inventario();
  const usadas = await chavesEmUso();
  const orfaos = itens.filter((i) => !usadas.has(i.chave)).sort((a, b) => a.ts - b.ts);

  console.log('ORFAOS: ' + orfaos.length + ' de ' + itens.length + ' anexos');
  console.log('(anexo que NENHUM alvara, conversa ou chamado referencia)');
  console.log('');
  const porNome = {};
  orfaos.forEach((o) => { const k = o.nome || '(sem nome)'; porNome[k] = (porNome[k] || 0) + 1; });
  const repetidos = Object.entries(porNome).filter(([, c]) => c > 1).sort((a, b) => b[1] - a[1]);
  console.log('  nomes que aparecem mais de uma vez (reenvio da mesma pessoa):');
  repetidos.slice(0, 15).forEach(([n, c]) => console.log('    ' + String(c).padStart(3) + 'x  ' + n.slice(0, 60)));
  console.log('');
  console.log('  amostra dos 25 mais antigos:');
  orfaos.slice(0, 25).forEach((o) => {
    const q = o.ts ? new Date(o.ts).toISOString().slice(0, 10) : 'sem data';
    console.log('    ' + q + '  ' + o.id.padEnd(28) + (o.nome || '').slice(0, 44));
  });
  console.log('');
  console.log('NADA FOI APAGADO. Esta acao so lista.');
}

async function migrar() {
  const idToken = await tokenDeUsuario();
  const itens = (await inventario()).sort((a, b) => a.ts - b.ts);
  const alvo = itens.slice(0, LIMITE === Infinity ? itens.length : LIMITE);
  console.log('MIGRANDO ' + alvo.length + ' de ' + itens.length + ' anexos');
  console.log('ordem: sobe -> confere -> so entao apaga\n');

  let ok = 0, pulados = 0, falhas = 0, bytesMovidos = 0;
  for (const it of alvo) {
    try {
      const b64 = await baixarBase64(it.chave, it.n);
      if (!b64 || b64.indexOf('data:') !== 0) { pulados++; continue; }
      const { tipo, bytes } = bytesDeDataUrl(b64);

      const urlUp = await autorizar(idToken, 'upload', it.chave);
      const put = await fetch(urlUp, { method: 'PUT', headers: { 'Content-Type': tipo }, body: bytes });
      if (!put.ok) throw new Error('upload HTTP ' + put.status);

      // CONFERE que chegou, e com o tamanho certo. Sem esta checagem, "apagar
      // depois de subir" vira "apagar depois de tentar subir".
      const urlDown = await autorizar(idToken, 'download', it.chave);
      const head = await fetch(urlDown, { method: 'HEAD' });
      const tam = Number(head.headers.get('content-length') || 0);
      if (!head.ok || tam !== bytes.length) {
        throw new Error(`conferencia falhou: enviei ${bytes.length}B, la tem ${tam}B`);
      }

      // so agora
      const apagar = [db.doc(`azuos/anx_${it.chave}`).delete()];
      for (let j = 0; j < it.n; j++) apagar.push(db.doc(`azuos/anx_${it.chave}__${j}`).delete().catch(() => {}));
      await Promise.all(apagar);

      ok++; bytesMovidos += bytes.length;
      if (ok % 50 === 0) console.log('  ' + ok + ' movidos (' + Math.round(bytesMovidos / 1048576) + ' MB)');
    } catch (e) {
      falhas++;
      console.log('  FALHA ' + it.id + ': ' + ((e && e.message) || e));
      if (falhas > 25) { console.log('  >>> falhas demais, parando para nao insistir no erro'); break; }
    }
  }
  console.log('');
  console.log('RESULTADO: ' + ok + ' migrados, ' + pulados + ' pulados (sem conteudo), ' + falhas + ' falhas');
  console.log('           ' + Math.round(bytesMovidos / 1048576) + ' MB saiu do Firestore');
}

const acoes = { medir, orfaos: listarOrfaos, migrar };
if (!acoes[MODO]) { console.log('MODO invalido: ' + MODO); process.exit(1); }
await acoes[MODO]();
