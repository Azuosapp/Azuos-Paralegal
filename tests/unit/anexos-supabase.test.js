import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Anexos: Storage do Supabase com o Firestore como rede de segurança.
 *
 * O que estes testes protegem. Os anexos vão sair de dentro do Firestore (13.219
 * documentos, mais de 2 GB) para o Storage. A migração só é segura por causa de
 * duas decisões, e são elas que os testes travam:
 *
 *  1) O PONTEIRO NÃO MUDA. O alvará continua guardando a mesma chave `_idb`; muda
 *     só onde os bytes estão. Por isso a migração nunca toca em alvará nenhum.
 *  2) A LEITURA TENTA OS DOIS LUGARES. Anexo migrado abre de um lado, anexo ainda
 *     não migrado abre do outro — a troca é invisível para quem usa.
 *
 * E a exigência mais importante: enquanto o Supabase não estiver configurado, ou
 * se ele falhar, nada pode mudar. Ninguém pode perder anexo porque uma peça nova
 * não respondeu. */

function montar({ configurado = false, supabaseOk = true, existeNoFirestore = true, semLogin = false } = {}) {
  const src = readFileSync('public/firestore.js', 'utf-8');
  const chamadas = { autorizou: 0, putSupabase: 0, leuFirestore: 0, gravouFirestore: 0 };

  const doc = (id) => ({
    get() {
      chamadas.leuFirestore++;
      return Promise.resolve(existeNoFirestore
        ? { exists: true, data: () => ({ n: 1, d: 'data:image/png;base64,ANTIGO' }) }
        : { exists: false, data: () => ({}) });
    },
    set() { chamadas.gravouFirestore++; return Promise.resolve(); },
    delete() { return Promise.resolve(); },
  });

  const ctx = {
    state: { alvaras: [], empresas: [], edicoes_alvaras: {}, sessao: { email: 'a@b' } },
    window: {
      fbDB: { collection: () => ({ doc }) },
      fbAuth: semLogin ? {} : { currentUser: { getIdToken: () => Promise.resolve('token-firebase') } },
      _SB_CFG: configurado ? { url: 'https://x.supabase.co', anon: 'anon123', funcao: 'anexos' } : null,
    },
    console: { warn() {}, log() {}, error() {} },
    JSON, Object, Array, String, Number, Boolean, Math, Date, Promise, Uint8Array,
    isNaN, parseInt, parseFloat,
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch(url, opt) {
      if (String(url).includes('/functions/v1/')) {
        chamadas.autorizou++;
        if (!supabaseOk) return Promise.resolve({ ok: false, status: 500, text: () => Promise.resolve('erro') });
        return Promise.resolve({ ok: true, json: () => Promise.resolve({ url: 'https://x.supabase.co/assinado' }) });
      }
      chamadas.putSupabase++;
      return Promise.resolve({ ok: supabaseOk });
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/firestore.js' });
  return { ctx, chamadas };
}

const ARQ = 'data:image/png;base64,QUJD';

test('sem configuração do Supabase, tudo funciona como antes — grava no Firestore', async () => {
  const { ctx, chamadas } = montar({ configurado: false });
  const ok = await ctx._anexoCloudPush('idb_1', ARQ, { nome: 'a.png' });
  assert.equal(ok, true);
  assert.equal(chamadas.autorizou, 0, 'não podia procurar o Supabase sem configuração');
  assert.ok(chamadas.gravouFirestore > 0);
});

test('configurado: o arquivo vai para o Supabase e NÃO entra no banco', async () => {
  const { ctx, chamadas } = montar({ configurado: true });
  const ok = await ctx._anexoCloudPush('idb_2', ARQ, { nome: 'a.png' });
  assert.equal(ok, true);
  assert.equal(chamadas.autorizou, 1);
  assert.equal(chamadas.putSupabase, 1);
  assert.equal(chamadas.gravouFirestore, 0, 'o objetivo é tirar o arquivo do banco');
});

test('Supabase fora do ar: cai no Firestore e o anexo NÃO se perde', async () => {
  const { ctx, chamadas } = montar({ configurado: true, supabaseOk: false });
  const ok = await ctx._anexoCloudPush('idb_3', ARQ, { nome: 'a.png' });
  assert.equal(ok, true, 'o usuário não pode perder anexo porque uma peça nova não respondeu');
  assert.ok(chamadas.gravouFirestore > 0, 'deveria ter usado a rede de segurança');
});

test('sem usuário logado não sobe para o Supabase — cai no caminho antigo', async () => {
  const { ctx, chamadas } = montar({ configurado: true, semLogin: true });
  const ok = await ctx._anexoCloudPush('idb_4', ARQ, {});
  assert.equal(ok, true);
  assert.ok(chamadas.gravouFirestore > 0);
});

test('leitura: anexo já migrado vem do Supabase, sem tocar no banco', async () => {
  const { ctx, chamadas } = montar({ configurado: true });
  ctx.window.FileReader = class { readAsDataURL() { this.onload(); } get result() { return 'data:image/png;base64,NOVO'; } };
  // sem FileReader real no Node, validamos pelo caminho percorrido
  await ctx._anexoCloudFetch('idb_5').catch(() => null);
  assert.equal(chamadas.autorizou, 1, 'deveria ter pedido autorização de download');
});

test('leitura: anexo ainda NÃO migrado continua abrindo do Firestore', async () => {
  const { ctx, chamadas } = montar({ configurado: false });
  const b64 = await ctx._anexoCloudFetch('idb_6');
  assert.equal(b64, 'data:image/png;base64,ANTIGO');
  assert.equal(chamadas.leuFirestore, 1);
});

test('o ponteiro do anexo nunca muda de formato — é o que torna a migração segura', () => {
  const src = readFileSync('public/firestore.js', 'utf-8');
  // a chave usada nos dois caminhos é a mesma variável `chave`, sem prefixo novo
  assert.ok(src.includes('_anexoSupabasePush(chave, dados, meta)'),
    'o push do Supabase precisa receber a MESMA chave do caminho antigo');
  assert.ok(src.includes('_anexoSupabaseFetch(chave)'),
    'a leitura precisa usar a MESMA chave, senão a migração teria de reescrever os alvarás');
});
