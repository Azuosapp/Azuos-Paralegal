import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Publicação das edições: correta E barata.
 *
 * Duas exigências que brigam entre si, e o teste existe para as duas ao mesmo tempo:
 *
 *  1) Nunca publicar por cima do trabalho de outra pessoa. Foi o defeito que fez
 *     três contas destravadas apagarem edições recentes ao voltarem a gravar.
 *  2) Não queimar leitura à toa. O projeto tem teto diário; a primeira versão da
 *     correção relia TODOS os chunks a cada gravação, o que multiplica leitura por
 *     15 pessoas o dia inteiro — e leitura demais derruba o sistema para todos,
 *     que é o mesmo sintoma que estávamos consertando.
 *
 * A solução é ler só o carimbo (1 leitura) e mesclar apenas quando ele mudou. */

function montar({ verRemoto, falharMeta = false, edicoesLocais = {}, verNosso = 0 }) {
  const src = readFileSync('public/firestore.js', 'utf-8');
  const leituras = [];
  const escritas = [];

  function doc(id) {
    return {
      get() {
        leituras.push(id);
        if (id.endsWith('meta') && falharMeta) return Promise.reject(new Error('rede'));
        if (id.endsWith('meta')) {
          return Promise.resolve(
            verRemoto
              ? { exists: true, data: () => ({ n: 1, ver: verRemoto, count: 1 }) }
              : { exists: false, data: () => ({}) }
          );
        }
        // chunk: devolve uma edição remota mais nova, para dar o que mesclar
        return Promise.resolve({
          exists: true,
          data: () => ({ d: JSON.stringify({ 99: { status: 'Pago', _editado_em: '2099-01-01T00:00:00.000Z' } }) }),
        });
      },
      set(v) { escritas.push(id); return Promise.resolve(v); },
      delete() { escritas.push('del:' + id); return Promise.resolve(); },
    };
  }

  const state = { alvaras: [], empresas: [], edicoes_alvaras: edicoesLocais, sessao: { email: 'a@b', nome: 'A' } };
  const ctx = {
    state,
    window: { fbDB: { collection: () => ({ doc }) }, _edicoesVer: verNosso },
    console: { warn() {}, log() {}, error() {} },
    JSON, Object, Array, String, Number, Boolean, Math, Date, Promise, isNaN, parseInt, parseFloat,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/firestore.js' });
  return { ctx, state, leituras, escritas };
}

test('remoto igual ao nosso: publica sem baixar os chunks — 1 leitura só', async () => {
  const { ctx, leituras } = montar({ verRemoto: 1000, verNosso: 1000 });
  await ctx.publicarEdicoes();
  assert.deepEqual(leituras, ['edicoes_meta'],
    `esperava só a leitura do carimbo, houve: ${leituras.join(', ')}`);
});

test('remoto mais novo: baixa os chunks e mescla antes de publicar', async () => {
  const { ctx, state, leituras } = montar({ verRemoto: 2000, verNosso: 1000 });
  await ctx.publicarEdicoes();
  assert.ok(leituras.length > 1, 'deveria ter lido os chunks quando o remoto mudou');
  assert.equal(state.edicoes_alvaras['99'].status, 'Pago',
    'a edição que só existia na nuvem se perdeu — é exatamente a perda que a releitura evita');
});

test('nuvem ainda sem meta: publica direto, sem tentar baixar chunk', async () => {
  const { ctx, leituras } = montar({ verRemoto: 0, verNosso: 0 });
  await ctx.publicarEdicoes();
  assert.deepEqual(leituras, ['edicoes_meta']);
});

/* Escrevi este teste esperando que, ao falhar a leitura do carimbo, o código
   mesclasse mesmo assim. Ele falhou e me mostrou que isso é impossível: os chunks
   são localizados pelo MESMO documento de meta que acabou de falhar. A escolha real
   é entre publicar às cegas e não publicar — e publicar às cegas foi o que apagou o
   trabalho da equipe. Perder uma tentativa de envio se recupera na próxima
   gravação; sobrescrever o trabalho de outra pessoa, não. */
test('falha ao ler o carimbo: NÃO publica — recusa-se a gravar às cegas', async () => {
  const { ctx, escritas } = montar({ verRemoto: 2000, verNosso: 2000, falharMeta: true });
  const r = await ctx.publicarEdicoes();
  assert.equal(r, false, 'deveria sinalizar falha para quem chamou tentar de novo');
  assert.deepEqual(escritas, [],
    'gravou sem saber o que havia na nuvem — é assim que edição alheia some');
});

test('o estado local é preservado quando a publicação é recusada', async () => {
  const meu = { 5: { status: 'Concluído', _editado_em: '2026-08-04T12:00:00.000Z' } };
  const { ctx, state } = montar({ verRemoto: 2000, verNosso: 2000, falharMeta: true, edicoesLocais: meu });
  await ctx.publicarEdicoes();
  assert.equal(state.edicoes_alvaras['5'].status, 'Concluído',
    'o trabalho da pessoa não pode sumir da tela por causa de uma falha de rede');
});

test('salvarEdicaoDeAlvara grava o campo e carimba quem editou', async () => {
  const { ctx, state } = montar({ verRemoto: 1000, verNosso: 1000 });
  await ctx.salvarEdicaoDeAlvara(7, { status: 'Concluído' });
  assert.equal(state.edicoes_alvaras['7'].status, 'Concluído');
  assert.equal(state.edicoes_alvaras['7']._editado_por, 'a@b');
  assert.ok(state.edicoes_alvaras['7']._editado_em, 'faltou o carimbo de quando');
});

test('salvarEdicaoDeAlvara espelha no alvará em memória, para a tela não ficar atrás', async () => {
  const { ctx, state } = montar({ verRemoto: 1000, verNosso: 1000 });
  state.alvaras.push({ id: 7, status: 'Não iniciado' });
  await ctx.salvarEdicaoDeAlvara(7, { status: 'Concluído' });
  assert.equal(state.alvaras[0].status, 'Concluído');
});

test('salvarEdicaoDeAlvara recusa chamada sem id, sem gravar nada', async () => {
  const { ctx, escritas } = montar({ verRemoto: 1000, verNosso: 1000 });
  const r = await ctx.salvarEdicaoDeAlvara(null, { status: 'X' });
  assert.equal(r, false);
  assert.deepEqual(escritas, []);
});

/* ---- assinatura do documento compartilhado ----
 * O azuos/shared tem um onSnapshot por pessoa conectada: cada gravação vira uma
 * leitura para cada navegador aberto. Pular gravação sem mudança é o que segura o
 * consumo diário. A parte frágil é excluir o campo volátil — sem isso a comparação
 * nunca casa e a economia some em silêncio, que é exatamente o defeito que o
 * carimbo edicoes_ver teve. */
function carregarLibDoc() {
  const src = readFileSync('public/lib.js', 'utf-8');
  const ctx = { window: {}, console, Math, String, Number, Date, JSON, Object, Array, isNaN, parseInt, parseFloat };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/lib.js' });
  return ctx;
}

test('mesmo conteúdo com carimbo de tempo diferente dá a MESMA assinatura', () => {
  const c = carregarLibDoc();
  const a = c._assinaturaDocumento({ manutencao: [1, 2], last_modified_at: 'AAA' });
  const b = c._assinaturaDocumento({ manutencao: [1, 2], last_modified_at: 'ZZZ' });
  assert.equal(a, b, 'o campo volátil entrou na conta — a economia de leitura não funcionaria');
});

test('mudança de verdade muda a assinatura', () => {
  const c = carregarLibDoc();
  const a = c._assinaturaDocumento({ manutencao: [1, 2] });
  const b = c._assinaturaDocumento({ manutencao: [1, 2, 3] });
  assert.notEqual(a, b, 'mudança real precisa gerar gravação');
});

test('ordem das chaves não altera a assinatura', () => {
  const c = carregarLibDoc();
  const a = c._assinaturaDocumento({ x: 1, y: 2 });
  const b = c._assinaturaDocumento({ y: 2, x: 1 });
  assert.equal(a, b, 'o Firestore pode devolver as chaves em outra ordem');
});

test('devolve null quando não dá para serializar — quem chama deve gravar', () => {
  const c = carregarLibDoc();
  const circular = { a: 1 };
  circular.eu = circular;
  assert.equal(c._assinaturaDocumento(circular), null);
  assert.equal(c._assinaturaDocumento(null), null);
  assert.equal(c._assinaturaDocumento('texto'), null);
});
