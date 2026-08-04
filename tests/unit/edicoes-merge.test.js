import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Testes de COMPORTAMENTO das correções da v7.7.0.
 *
 * Os defeitos que estes testes travam custaram caro em produção:
 *  - anexo que só existia do lado local era descartado ao adotar o remoto
 *    (13.219 arquivos órfãos na nuvem, gente reenviando o mesmo arquivo);
 *  - o merge devolvia "mudou" só porque o carimbo de auditoria avançou, e
 *    "mudou" dispara saveState() + re-render — a tela piscando;
 *  - itens de histórico sem id sumiam do lado local (620 viravam 500).
 *
 * Carregamos public/firestore.js de verdade num sandbox, em vez de reescrever a
 * lógica no teste. Reescrever é como um teste passa enquanto o sistema quebra:
 * ele confirma a cópia, não o código que roda. */
function carregarFirestoreJs(estadoInicial) {
  const src = readFileSync('public/firestore.js', 'utf-8');
  const ctx = {
    state: estadoInicial,
    window: {},
    console: { warn() {}, log() {}, error() {} },
    JSON, Object, Array, String, Number, Boolean, Math, Date, Promise, isNaN, parseInt, parseFloat,
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  // 'use strict' no topo do arquivo impede declaração implícita; o script declara
  // tudo com var/function, que viram propriedades do contexto.
  vm.runInContext(src, ctx, { filename: 'public/firestore.js' });
  return ctx;
}

test('anexo que só existe no lado local NÃO é descartado ao adotar o remoto', () => {
  const ctx = carregarFirestoreJs({ edicoes_alvaras: {}, alvaras: [], empresas: [] });

  // local: dois anexos, um deles ainda não conhecido pela nuvem
  const local = {
    _editado_em: '2026-08-04T10:00:00.000Z',
    anexos: [
      { _idb: 'idb_1', nome: 'alvara.pdf', dados: '' },
      { _idb: 'idb_2', nome: 'bombeiros.pdf', dados: 'data:application/pdf;base64,AAA' },
    ],
  };
  // remoto: mais recente, mas só conhece o primeiro anexo
  const remoto = {
    _editado_em: '2026-08-04T11:00:00.000Z',
    anexos: [{ _idb: 'idb_1', nome: 'alvara.pdf', dados: '' }],
  };

  const saida = ctx._mesclarAnexosLocais(remoto, local);
  // join em vez de deepEqual: o array nasce dentro do sandbox e tem outro
  // prototype, entao deepStrictEqual recusa dois valores identicos.
  const ids = Array.from(saida.anexos, a => a._idb).sort().join(',');
  assert.equal(ids, 'idb_1,idb_2', 'o anexo local sumiu ao adotar o remoto');
});

test('o base64 local é reanexado casando por _idb, não por nome', () => {
  const ctx = carregarFirestoreJs({ edicoes_alvaras: {}, alvaras: [], empresas: [] });

  // Dois arquivos com o MESMO nome e _idb diferentes: casar por nome trocaria um
  // arquivo pelo outro — foi por isso que a chave virou _idb.
  const local = {
    anexos: [
      { _idb: 'idb_A', nome: 'CERTIFICADO.pdf', dados: 'data:application/pdf;base64,AAA' },
      { _idb: 'idb_B', nome: 'CERTIFICADO.pdf', dados: 'data:application/pdf;base64,BBB' },
    ],
  };
  const remoto = {
    anexos: [
      { _idb: 'idb_A', nome: 'CERTIFICADO.pdf', dados: '' },
      { _idb: 'idb_B', nome: 'CERTIFICADO.pdf', dados: '' },
    ],
  };

  const saida = ctx._mesclarAnexosLocais(remoto, local);
  const porId = {};
  saida.anexos.forEach(a => { porId[a._idb] = a.dados; });
  assert.equal(porId['idb_A'], 'data:application/pdf;base64,AAA');
  assert.equal(porId['idb_B'], 'data:application/pdf;base64,BBB');
});

test('carimbo novo com os mesmos valores NÃO conta como mudança (não acorda a tela)', () => {
  const conteudo = { status: 'Concluído', observacao: 'ok', empresa: 'ACME' };
  const state = {
    alvaras: [],
    empresas: [],
    edicoes_alvaras: {
      '10': Object.assign({}, conteudo, { _editado_em: '2026-08-04T10:00:00.000Z', _editado_por: 'a@x' }),
    },
  };
  const ctx = carregarFirestoreJs(state);

  // mesmo conteúdo, carimbo mais novo — era isto que devolvia true a cada snapshot
  const remotas = {
    '10': Object.assign({}, conteudo, { _editado_em: '2026-08-04T10:00:05.000Z', _editado_por: 'b@x' }),
  };
  assert.equal(ctx._mesclarEdicoesAlvaras(remotas), false, 'carimbo novo não pode contar como mudança');

  // e o carimbo mais recente ainda foi adotado
  assert.equal(state.edicoes_alvaras['10']._editado_em, '2026-08-04T10:00:05.000Z');
});

test('mudança de VALOR de verdade continua contando como mudança', () => {
  const state = {
    alvaras: [],
    empresas: [],
    edicoes_alvaras: {
      '10': { status: 'Não iniciado', _editado_em: '2026-08-04T10:00:00.000Z' },
    },
  };
  const ctx = carregarFirestoreJs(state);
  const remotas = { '10': { status: 'Concluído', _editado_em: '2026-08-04T10:00:05.000Z' } };
  assert.equal(ctx._mesclarEdicoesAlvaras(remotas), true);
  assert.equal(state.edicoes_alvaras['10'].status, 'Concluído');
});

test('edição de alvará que só existe no remoto é trazida', () => {
  const state = { alvaras: [], empresas: [], edicoes_alvaras: {} };
  const ctx = carregarFirestoreJs(state);
  assert.equal(ctx._mesclarEdicoesAlvaras({ '77': { status: 'Pago' } }), true);
  assert.equal(state.edicoes_alvaras['77'].status, 'Pago');
});

test('remoto mais ANTIGO não sobrescreve a edição local', () => {
  const state = {
    alvaras: [],
    empresas: [],
    edicoes_alvaras: { '5': { status: 'Concluído', _editado_em: '2026-08-04T12:00:00.000Z' } },
  };
  const ctx = carregarFirestoreJs(state);
  ctx._mesclarEdicoesAlvaras({ '5': { status: 'Não iniciado', _editado_em: '2026-08-04T09:00:00.000Z' } });
  assert.equal(state.edicoes_alvaras['5'].status, 'Concluído', 'edição recente foi perdida para uma antiga');
});

test('histórico: item local SEM id sobrevive à união', () => {
  const ctx = carregarFirestoreJs({ edicoes_alvaras: {}, alvaras: [], empresas: [] });
  const local = [{ texto: 'local sem id' }, { id: 1, texto: 'com id' }];
  const remoto = [{ id: 2, texto: 'remoto' }];
  const saida = ctx._uniPorId(local, remoto);
  assert.equal(saida.length, 3, 'o item local sem id foi descartado');
  assert.ok(saida.some(x => x.texto === 'local sem id'));
});

test('histórico: item sem id presente dos dois lados não duplica', () => {
  const ctx = carregarFirestoreJs({ edicoes_alvaras: {}, alvaras: [], empresas: [] });
  const item = { texto: 'mesmo item' };
  const saida = ctx._uniPorId([item], [{ texto: 'mesmo item' }]);
  assert.equal(saida.length, 1);
});

test('a sobreposição das edições vence o valor da base nos alvarás', () => {
  const state = {
    empresas: [],
    alvaras: [{ id: 3, status: 'Não iniciado', observacao: 'da planilha' }],
    edicoes_alvaras: { '3': { status: 'Concluído' } },
  };
  const ctx = carregarFirestoreJs(state);
  ctx._aplicarEdicoesNosArrays();
  assert.equal(state.alvaras[0].status, 'Concluído');
  assert.equal(state.alvaras[0].observacao, 'da planilha', 'campo sem edição não podia mudar');
});

/* ---- id determinístico de empresa (v7.9.0) ----
 * Antes, empresa nova recebia `++_proxId` calculado sobre a base LOCAL. Dois
 * navegadores geravam ids diferentes para a MESMA empresa, e o vínculo
 * alvará→empresa passava a apontar para empresas distintas conforme quem abriu. */
function carregarLib() {
  const src = readFileSync('public/lib.js', 'utf-8');
  const ctx = { window: {}, console, Math, String, Number, Date, isNaN, parseInt, parseFloat };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/lib.js' });
  return ctx;
}

test('mesma empresa gera o MESMO id em qualquer navegador', () => {
  const a = carregarLib(), b = carregarLib();   // duas "máquinas" independentes
  const id1 = a._idEmpresaDeterministico('ACME COMERCIO LTDA', '12.345.678/0001-90');
  const id2 = b._idEmpresaDeterministico('ACME COMERCIO LTDA', '12.345.678/0001-90');
  assert.equal(id1, id2);
  assert.ok(id1 >= 1000000, 'id novo não pode cair na faixa dos ids sequenciais antigos');
});

test('o CNPJ manda: mesma empresa com o nome digitado diferente dá o mesmo id', () => {
  const c = carregarLib();
  assert.equal(
    c._idEmpresaDeterministico('ACME COMERCIO LTDA', '12.345.678/0001-90'),
    c._idEmpresaDeterministico('Acme Comércio', '12345678000190')
  );
});

test('sem CNPJ, cai no nome normalizado (espaços e caixa não contam)', () => {
  const c = carregarLib();
  assert.equal(
    c._idEmpresaDeterministico('  Padaria   Central ', ''),
    c._idEmpresaDeterministico('PADARIA CENTRAL', null)
  );
});

test('empresas diferentes geram ids diferentes', () => {
  const c = carregarLib();
  assert.notEqual(
    c._idEmpresaDeterministico('ACME LTDA', '12.345.678/0001-90'),
    c._idEmpresaDeterministico('BETA LTDA', '98.765.432/0001-10')
  );
});

test('sem nome e sem CNPJ devolve 0, para quem chama decidir', () => {
  const c = carregarLib();
  assert.equal(c._idEmpresaDeterministico('', ''), 0);
  assert.equal(c._idEmpresaDeterministico(null, undefined), 0);
});
