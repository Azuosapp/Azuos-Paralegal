import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

/* Auditorias do Centro de Inteligência — cobertura de COMPORTAMENTO.
 *
 * Por que estes testes existem. Em 04/08/2026 veio o relato: "todo momento que
 * entramos os totalizadores ficam maiores e nunca diminuem, mesmo o pessoal
 * atualizando". As 16 auditorias que alimentam esses números eram, até aqui, o
 * maior bloco de regra de negócio do projeto SEM um único teste que as executasse —
 * public/inteligencia.js tem 1.436 linhas e nenhuma cobertura de comportamento.
 *
 * A afirmação que estes testes travam é a que o usuário faz na prática: preencher
 * o campo TEM de tirar o alvará da contagem. Se algum dia a contagem parar de cair,
 * um destes testes quebra antes de chegar na equipe.
 *
 * Carregamos o módulo real num sandbox, com um `state` montado à mão. Reescrever a
 * lógica no teste confirmaria a cópia, não o código que roda. */
function carregarInteligencia(state) {
  const src = readFileSync('public/inteligencia.js', 'utf-8');
  const ctx = {
    window: {},
    document: { getElementById: () => null, querySelectorAll: () => [], addEventListener: () => {} },
    state,
    console: { log() {}, warn() {}, error() {} },
    JSON, Object, Array, String, Number, Boolean, Math, Date, RegExp, Set, Map,
    isNaN, parseInt, parseFloat,
    setTimeout: () => {}, setInterval: () => {},
    localStorage: { getItem: () => null, setItem() {} },
    // o módulo usa o parser de data do app; replicamos o formato BR que ele espera
    parseDataBR(v) {
      const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(v || '').trim());
      if (!m) return null;
      const d = new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));
      return isNaN(d.getTime()) ? null : d;
    },
  };
  ctx.globalThis = ctx;
  vm.createContext(ctx);
  vm.runInContext(src, ctx, { filename: 'public/inteligencia.js' });
  return ctx;
}

function dataBR(deslocamentoDias) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function baseComUmAlvara(campos) {
  return {
    empresas: [{ id: 1, nome: 'ACME', cidade: 'Goiânia' }],
    usuarios: [{ nome: 'Leyla', email: 'leyla@x', ativo: true }],
    sessao: { email: 'leyla@x', nome: 'Leyla', cargo: 'Administrador' },
    alvaras: [Object.assign({
      id: 10, empresa_id: 1, empresa: 'ACME', cidade: 'Goiânia',
      tipo: 'BOMBEIROS', status: 'Em andamento', responsavel: 'Leyla',
      vencimento: '', proxima_atualizacao: '',
    }, campos)],
  };
}

/* ---- O caso do relato: preencher tem de TIRAR da contagem ---- */

test('próxima atualização vazia entra na contagem', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ proxima_atualizacao: '' }));
  assert.equal(ctx.window._auditProxItens().length, 1);
});

test('preencher a próxima atualização TIRA da contagem — o total precisa cair', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ proxima_atualizacao: dataBR(30) }));
  assert.equal(ctx.window._auditProxItens().length, 0,
    'o alvará continuou contando depois de atualizado — é exatamente o relato da equipe');
});

test('os marcadores de vazio da planilha contam como vazio', () => {
  for (const vazio of ['', '-', '—', 'null', '   ']) {
    const ctx = carregarInteligencia(baseComUmAlvara({ proxima_atualizacao: vazio }));
    assert.equal(ctx.window._auditProxItens().length, 1, `"${vazio}" deveria contar como vazio`);
  }
});

/* ---- Vencidos crônicos ---- */

test('vencido há mais de 30 dias entra na contagem', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-45) }));
  assert.equal(ctx.window._auditVencidos30Itens().length, 1);
});

test('vencido há menos de 30 dias ainda NÃO é crônico', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-10) }));
  assert.equal(ctx.window._auditVencidos30Itens().length, 0);
});

test('status terminal só sai da contagem se houver próxima atualização agendada', () => {
  const semAgenda = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-60), status: 'Concluído', proxima_atualizacao: '' }));
  assert.equal(semAgenda.window._auditVencidos30Itens().length, 1,
    'venceu, está Concluído e ninguém reagendou: é atraso crônico e deve aparecer');

  const comAgenda = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-60), status: 'Concluído', proxima_atualizacao: dataBR(15) }));
  assert.equal(comAgenda.window._auditVencidos30Itens().length, 0);
});

test('"Sem obrigatoriedade" nunca é apontado', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-500), status: 'Sem obrigatoriedade' }));
  assert.equal(ctx.window._auditVencidos30Itens().length, 0);
});

/* ---- Cadastro ---- */

test('alvará sem status é falha de cadastro; preencher resolve', () => {
  const vazio = carregarInteligencia(baseComUmAlvara({ status: '' }));
  assert.equal(vazio.window._auditSemStatusItens().length, 1);
  const cheio = carregarInteligencia(baseComUmAlvara({ status: 'Em andamento' }));
  assert.equal(cheio.window._auditSemStatusItens().length, 0);
});

/* Atenção ao contrato: esta auditoria olha EMPRESAS, não alvarás, e só as ATIVO.
   Escrevi o teste primeiro assumindo alvarás e ele falhou — o código estava certo.
   Fica registrado aqui para o próximo não repetir a suposição. */
test('empresa ATIVO sem responsável é apontada; atribuir resolve', () => {
  const semResp = baseComUmAlvara({});
  semResp.empresas = [{ id: 1, nome: 'ACME', cidade: 'Goiânia', status: 'ATIVO', responsavel: '' }];
  assert.equal(carregarInteligencia(semResp).window._auditSemRespItens().length, 1);

  const comResp = baseComUmAlvara({});
  comResp.empresas = [{ id: 1, nome: 'ACME', cidade: 'Goiânia', status: 'ATIVO', responsavel: 'Leyla' }];
  assert.equal(carregarInteligencia(comResp).window._auditSemRespItens().length, 0);
});

test('empresa INATIVO sem responsável não é apontada', () => {
  const st = baseComUmAlvara({});
  st.empresas = [{ id: 1, nome: 'ACME', status: 'INATIVO', responsavel: '' }];
  assert.equal(carregarInteligencia(st).window._auditSemRespItens().length, 0);
});

test('responsável fora da lista de usuários é apontado', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ responsavel: 'Fulano Que Nao Existe' }));
  assert.equal(ctx.window._auditRespInvalidoItens().length, 1);
});

test('status desatualizado: venceu e o status não virou Vencido', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-5), status: 'Em andamento' }));
  assert.equal(ctx.window._auditStatusDesatualizadoItens().length, 1);
  const ok = carregarInteligencia(baseComUmAlvara({ vencimento: dataBR(-5), status: 'Vencido' }));
  assert.equal(ok.window._auditStatusDesatualizadoItens().length, 0);
});

/* ---- Vínculo alvará -> empresa ----
 * Esta é a auditoria que o id de empresa gerado por navegador alimentava: cada
 * máquina dava um id diferente para a mesma empresa, e o alvará virava órfão
 * em umas e não em outras. Ver _idEmpresaDeterministico em public/lib.js. */

test('alvará apontando para empresa inexistente é órfão', () => {
  const st = baseComUmAlvara({});
  st.alvaras[0].empresa_id = 99999;
  const ctx = carregarInteligencia(st);
  assert.equal(ctx.window._auditOrfaosItens().length, 1);
});

test('alvará com empresa existente não é órfão', () => {
  const ctx = carregarInteligencia(baseComUmAlvara({}));
  assert.equal(ctx.window._auditOrfaosItens().length, 0);
});

test('cache desatualizado: o nome guardado no alvará difere do cadastro', () => {
  const st = baseComUmAlvara({});
  st.alvaras[0].empresa = 'NOME ANTIGO LTDA';
  const ctx = carregarInteligencia(st);
  assert.equal(ctx.window._auditCacheDesatualizadoItens().length, 1);
});

/* ---- Degenerados: base vazia não pode explodir nem inventar pendência ---- */

test('base vazia devolve zero em todas as auditorias, sem lançar erro', () => {
  const ctx = carregarInteligencia({ alvaras: [], empresas: [], usuarios: [], sessao: { email: 'a@b', nome: 'A' } });
  const nomes = Object.keys(ctx.window).filter((k) => /^_audit.*Itens$/.test(k));
  assert.ok(nomes.length >= 10, `esperava as auditorias expostas, achei ${nomes.length}`);
  for (const n of nomes) {
    const r = ctx.window[n]();
    assert.ok(Array.isArray(r), `${n} não devolveu lista`);
    assert.equal(r.length, 0, `${n} inventou pendência numa base vazia`);
  }
});

test('alvará nulo ou sem id na lista não derruba as auditorias', () => {
  const st = baseComUmAlvara({});
  st.alvaras.push(null, {}, { id: 2 });
  const ctx = carregarInteligencia(st);
  const nomes = Object.keys(ctx.window).filter((k) => /^_audit.*Itens$/.test(k));
  for (const n of nomes) {
    assert.doesNotThrow(() => ctx.window[n](), `${n} quebrou com item degenerado`);
  }
});
