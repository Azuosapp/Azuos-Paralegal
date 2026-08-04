/* Azuos Paralegal — camada Firestore (Estagio 3 parte 2: relocada verbatim) */
'use strict';

function _semAnexosPesados(edicoes) {
  var out = {};
  try {
    Object.keys(edicoes || {}).forEach(function(id){
      var e = edicoes[id];
      if (e && Array.isArray(e.anexos) && e.anexos.length) {
        var copia = Object.assign({}, e);
        copia.anexos = e.anexos.map(function(a){
          var m = Object.assign({}, a);
          if (m.dados && String(m.dados).indexOf('data:')===0) { m.dados = ''; m._local = true; } // metadados sem base64
          return m;
        });
        out[id] = copia;
      } else {
        out[id] = e;
      }
    });
  } catch(err) { return edicoes || {}; }
  return out;
}

/* [v7.0.0] CIENCIAS EM DOCUMENTO PROPRIO, uma por pessoa.
   Motivo em _fsCollectFromState: azuos/shared estourou 1 MB e travou todas as
   gravacoes do sistema. Aqui as ciencias saem de la e passam a viver em
   por_usuario/{chave}, onde crescem sem derrubar o resto. */
function _cienciaChaveDoc(id){
  return String(id||'').toLowerCase().trim().replace(/[^a-z0-9]+/g,'_').slice(0,120) || 'sem_chave';
}
function _cienciasSalvarMinhas(){
  try{
    if(!window.fbDB || !state.sessao) return Promise.resolve(false);
    var chaves = [state.sessao.email, state.sessao.nome].filter(Boolean);
    var mapa = state.ciencias_por_usuario || {};
    var ps = [];
    chaves.forEach(function(k){
      var lista = mapa[k];
      if(!Array.isArray(lista)) return;
      ps.push(window.fbDB.collection('por_usuario').doc(_cienciaChaveDoc(k)).set({
        chave: k, ciencias: lista, atualizado_em: new Date().toISOString()
      }, {merge:true}));
    });
    if(!ps.length) return Promise.resolve(false);
    return Promise.all(ps).then(function(){ return true; })
      .catch(function(e){ console.warn('[ciencias] salvar:', (e&&e.message)||e); return false; });
  }catch(e){ return Promise.resolve(false); }
}
/* [v7.3.0] Salva as ciencias de TODAS as pessoas presentes no mapa, nao so as do
   usuario logado. Isto e pre-requisito para apagar o campo legado do 'shared':
   aquele campo carrega as ciencias da equipe inteira, e _cienciasSalvarMinhas
   grava apenas as chaves de quem esta logado. Apagar depois dela destruiria as
   ciencias de quem ainda nao abriu o sistema — cenario real, porque navegadores
   antigos regravam o campo com dados que podem nao estar no destino. */
function _cienciasSalvarMapa(mapa){
  try{
    if(!window.fbDB || !mapa || typeof mapa !== 'object') return Promise.resolve(false);
    var chaves = Object.keys(mapa).filter(function(k){ return Array.isArray(mapa[k]); });
    if(!chaves.length) return Promise.resolve(false);
    var chaveItem = function(x){ return (typeof x === 'string') ? x : JSON.stringify(x); };
    // uniao com o destino, para nunca reduzir o que ja esta la
    var ps = chaves.map(function(k){
      var ref = window.fbDB.collection('por_usuario').doc(_cienciaChaveDoc(k));
      return ref.get().then(function(d){
        var jaLa = (d.exists && Array.isArray((d.data()||{}).ciencias)) ? d.data().ciencias : [];
        var vistos = {}; jaLa.forEach(function(x){ vistos[chaveItem(x)] = 1; });
        var uni = jaLa.slice();
        mapa[k].forEach(function(x){ var c = chaveItem(x); if(!vistos[c]){ vistos[c]=1; uni.push(x); } });
        if(uni.length === jaLa.length) return true;   // nada novo, nao grava a toa
        return ref.set({ chave:k, ciencias:uni, atualizado_em:new Date().toISOString() }, {merge:true}).then(function(){ return true; });
      });
    });
    return Promise.all(ps).then(function(rs){ return rs.every(Boolean); })
      .catch(function(e){ console.warn('[ciencias mapa]', (e&&e.message)||e); return false; });
  }catch(e){ return Promise.resolve(false); }
}
window._cienciasSalvarMapa = _cienciasSalvarMapa;
function _cienciasCarregarTodas(){
  try{
    if(!window.fbDB) return Promise.resolve(false);
    return window.fbDB.collection('por_usuario').get().then(function(qs){
      var mudou = false;
      state.ciencias_por_usuario = state.ciencias_por_usuario || {};
      qs.forEach(function(d){
        var dd = d.data() || {};
        var k = dd.chave;
        if(!k || !Array.isArray(dd.ciencias)) return;
        var atual = state.ciencias_por_usuario[k];
        // uniao: nunca descarta ciencia que so existe de um lado
        // [v7.0.1] compara por VALOR: se a ciencia for objeto, indexOf compara
        // referencia e todo item vindo do servidor entraria duplicado.
        var chave = function(x){ return (typeof x === 'string') ? x : JSON.stringify(x); };
        var uni = Array.isArray(atual) ? atual.slice() : [];
        var vistos = {}; uni.forEach(function(x){ vistos[chave(x)] = 1; });
        dd.ciencias.forEach(function(x){ var c = chave(x); if(!vistos[c]){ vistos[c]=1; uni.push(x); } });
        if(!atual || uni.length !== atual.length){ state.ciencias_por_usuario[k] = uni; mudou = true; }
      });
      return mudou;
    }).catch(function(e){ console.warn('[ciencias] carregar:', (e&&e.message)||e); return false; });
  }catch(e){ return Promise.resolve(false); }
}
window._cienciasSalvarMinhas = _cienciasSalvarMinhas;
window._cienciasCarregarTodas = _cienciasCarregarTodas;

/* [v7.2.0] EDICOES DE ALVARA EM CHUNKS, fora do azuos/shared.
   Era o maior campo restante: 505 KB para 1175 alvaras editados, crescendo a cada
   edicao. Medimos a composicao antes de mexer e nao havia vilao unico (conversas
   51 KB, empresa 40, _editado_por 30, _editado_em 30, anexos 28...), entao trimar
   campos so adiaria o estouro de 1 MB — que ja aconteceu uma vez e travou TODAS
   as gravacoes do sistema.
   Mesmo padrao ja usado pelos alvaras: azuos/edicoes_meta + azuos/edicoes_N.
   Para nao perder o tempo real, o 'shared' guarda so um carimbo minusculo
   (edicoes_ver); quando ele muda, os outros navegadores recarregam os chunks. */
var _EDIC_PREFIX = 'edicoes_';
var _EDIC_CH = 800000;   // ~0.8MB por chunk, margem do limite de 1MB

/* [v7.7.0] Assinatura de CONTEUDO, ignorando os carimbos de auditoria.
   _editado_em muda a cada gravacao mesmo quando nenhum valor mudou. Comparar o
   objeto inteiro fazia o merge devolver "mudou" toda vez, e "mudou" dispara
   saveState() + re-render — era um dos motores da tela piscando. */
function _assinConteudoEdicao(e){
  try{
    if(!e || typeof e !== 'object') return '';
    var c = {};
    Object.keys(e).sort().forEach(function(k){
      if(k === '_editado_em' || k === '_editado_por' || k === '_editado_manualmente') return;
      c[k] = e[k];
    });
    return JSON.stringify(c);
  }catch(err){ return ''; }
}

function _mesclarEdicoesAlvaras(remotas){
  var mudou = false;
  try{
    if(!remotas || typeof remotas !== 'object') return false;
    state.edicoes_alvaras = state.edicoes_alvaras || {};
    Object.keys(remotas).forEach(function(aid){
      var r = remotas[aid];
      var l = state.edicoes_alvaras[aid];
      if(!l){ state.edicoes_alvaras[aid] = r; mudou = true; return; }
      // vence o mais RECENTE por alvara (timestamps ISO comparam como string).
      var tR = (r && r._editado_em) ? r._editado_em : '';
      var tL = (l && l._editado_em) ? l._editado_em : '';
      // ao adotar o remoto, preserva os anexos que so existem localmente
      if(tR > tL){
        var novo = _mesclarAnexosLocais(r, l);
        var antes = _assinConteudoEdicao(l);
        state.edicoes_alvaras[aid] = novo;
        // So conta como mudanca se algum VALOR mudou. Carimbo novo com os mesmos
        // dados nao pode acordar a tela.
        if(_assinConteudoEdicao(novo) !== antes) mudou = true;
      }
    });
  }catch(e){ console.warn('[edicoes merge]', (e&&e.message)||e); }
  // reaplica por cima dos alvaras: sem isto a edicao existe no estado mas a TELA
  // continua mostrando o valor da base (que veio da planilha).
  if (mudou) { try{ _aplicarEdicoesNosArrays(); }catch(e){} }
  return mudou;
}
/* [v7.7.0] LER ANTES DE PUBLICAR — corrige perda de anexo e de edicao alheia.
   _edicoesCloudSave publicava o mapa inteiro com .set(), sem olhar o que havia na
   nuvem. Qualquer navegador com copia velha que salvasse QUALQUER coisa apagava o
   trabalho recente de todo mundo. Foi o que estourou hoje: as tres contas que
   passaram semanas com a gravacao recusada tinham mapa antigo e, ao serem
   destravadas, comecaram a publicar esse mapa por cima do atual.
   Agora relemos a nuvem e unimos antes de publicar. A janela de corrida encolhe
   para o intervalo entre a leitura e a escrita; nao vai a zero — a solucao
   definitiva e um documento por alvara, que fica anotado como proximo passo. */
function _edicoesCloudSave(){
  try{
    if(!window.fbDB) return Promise.resolve(false);
    // Serializa as gravacoes: sem isto, duas chamadas simultaneas leem o mesmo
    // remoto e a segunda desfaz a uniao da primeira.
    var anterior = window._edicoesSalvandoP || Promise.resolve();
    var p = anterior.catch(function(){}).then(function(){
      return _edicoesCloudLoad().catch(function(){ return null; }).then(function(remotas){
        if(remotas) { try{ _mesclarEdicoesAlvaras(remotas); }catch(e){} }
        return _edicoesCloudPublicar();
      });
    });
    window._edicoesSalvandoP = p.catch(function(){});
    return p;
  }catch(e){ return Promise.resolve(false); }
}
function _edicoesCloudPublicar(){
  try{
    if(!window.fbDB) return Promise.resolve(false);
    var C = window.fbDB.collection('azuos');
    var limpo = _semAnexosPesados(state.edicoes_alvaras || {});
    var json = JSON.stringify(limpo);
    var chunks = [];
    for(var i=0;i<json.length;i+=_EDIC_CH) chunks.push(json.slice(i, i+_EDIC_CH));
    if(!chunks.length) chunks = ['{}'];
    var ver = Date.now();
    var ps = [ C.doc(_EDIC_PREFIX+'meta').set({ n: chunks.length, count: Object.keys(limpo).length, ver: ver, ts: ver }) ];
    for(var j=0;j<chunks.length;j++) ps.push(C.doc(_EDIC_PREFIX+j).set({ d: chunks[j] }));
    // apaga chunks sobrando de uma versao anterior maior
    for(var z=chunks.length; z<chunks.length+20; z++) ps.push(C.doc(_EDIC_PREFIX+z).delete().catch(function(){}));
    return Promise.all(ps).then(function(){
      window._edicoesVer = ver;
      console.log('[edicoes] salvas na nuvem:', Object.keys(limpo).length, 'em', chunks.length, 'chunk(s)');
      return ver;
    }).catch(function(e){ console.warn('[edicoes save]', (e&&e.message)||e); return false; });
  }catch(e){ return Promise.resolve(false); }
}
function _edicoesCloudLoad(){
  try{
    if(!window.fbDB) return Promise.resolve(null);
    var C = window.fbDB.collection('azuos');
    return C.doc(_EDIC_PREFIX+'meta').get().then(function(meta){
      if(!meta || !meta.exists) return null;
      var m = meta.data() || {}; var n = m.n || 0;
      if(!n) return null;
      var ps = []; for(var j=0;j<n;j++) ps.push(C.doc(_EDIC_PREFIX+j).get());
      return Promise.all(ps).then(function(docs){
        var full=''; for(var k=0;k<docs.length;k++) full += ((docs[k] && docs[k].data()) || {}).d || '';
        if(!full) return null;
        try{
          var obj = JSON.parse(full);
          window._edicoesVer = m.ver || m.ts || 0;
          return obj;
        }catch(e){ console.warn('[edicoes load parse]', e && e.message); return null; }
      });
    }).catch(function(e){ console.warn('[edicoes load]', (e&&e.message)||e); return null; });
  }catch(e){ return Promise.resolve(null); }
}
/* Campo legado no 'shared': absorve para os chunks e so entao apaga a origem.
   Mesmo cuidado da migracao das ciencias — nunca apagar antes de guardar. */
function _absorverEdicoesLegado(){
  try{
    if(window._absorvendoEdicoes) return;
    window._absorvendoEdicoes = true;
    _edicoesCloudSave().then(function(ver){
      if(!ver){ window._absorvendoEdicoes = false; return; }
      try{
        _fsDocRef().update({ edicoes_alvaras: firebase.firestore.FieldValue.delete(), edicoes_ver: ver })
          .then(function(){ console.log('[FS] campo legado edicoes_alvaras removido do shared'); })
          .catch(function(e){ console.warn('[FS] limpeza edicoes:', (e&&e.message)||e); });
      }catch(e){}
      window._absorvendoEdicoes = false;
    });
  }catch(e){ window._absorvendoEdicoes = false; }
}
/* ============================================================================
   PORTA UNICA DE ESCRITA DAS EDICOES DE ALVARA  —  [04/08/2026]
   ============================================================================
   Por que isto existe. A revisao de arquitetura mapeou DOZE gravadores para o
   mesmo dado (edicoes_alvaras), em TRES destinos diferentes: os chunks
   azuos/edicoes_*, a subcolecao azuos/edicoes/alvaras e o campo legado dentro de
   azuos/shared. Esse e o modo de falha estrutural deste sistema, nao descuido: em
   26/07 uma correcao redirecionou cinco gravadores e nao viu o sexto, que rodava a
   cada 20 segundos e desfazia a migracao; em 04/08 encontramos ainda um setimo,
   que sobrescrevia as edicoes boas com uma copia parcial. Cada rodada de conserto
   descobre mais um.

   A partir daqui existem DUAS funcoes publicas, e nenhuma outra:

     salvarEdicaoDeAlvara(alvaraId, campos)  -> grava a edicao de UM alvara
     publicarEdicoes()                       -> publica o mapa atual (uso em lote)

   E uma regra no CI (scripts/validate-html.js) recusa qualquer referencia a
   _edicoesCloudSave, _edicoesCloudPublicar ou edicoes_alvaras: fora deste arquivo.
   E a regra, e nao a disciplina de quem edita, que impede o decimo terceiro
   gravador de nascer — os doze anteriores foram todos escritos por gente atenta.
   ============================================================================ */

function salvarEdicaoDeAlvara(alvaraId, campos){
  try{
    if(alvaraId == null) return Promise.resolve(false);
    if(!campos || typeof campos !== 'object') return Promise.resolve(false);
    var id = String(alvaraId);
    var quem = (state.sessao && (state.sessao.email || state.sessao.nome)) || '';
    state.edicoes_alvaras = state.edicoes_alvaras || {};
    state.edicoes_alvaras[id] = Object.assign(
      {}, state.edicoes_alvaras[id] || {}, campos,
      { _editado_em: new Date().toISOString(), _editado_por: quem, _editado_manualmente: true }
    );
    // Espelha no alvara em memoria, para a tela nao ficar atras do dado.
    try{
      var alv = (state.alvaras || []).find(function(a){ return a && String(a.id) === id; });
      if (alv) Object.assign(alv, campos);
    }catch(e){}
    return _edicoesCloudSave();
  }catch(e){ console.warn('[salvarEdicaoDeAlvara]', (e&&e.message)||e); return Promise.resolve(false); }
}

function publicarEdicoes(){
  return _edicoesCloudSave();
}

window.salvarEdicaoDeAlvara = salvarEdicaoDeAlvara;
window.publicarEdicoes = publicarEdicoes;
window._edicoesCloudSave = _edicoesCloudSave;   // uso INTERNO deste arquivo
window._edicoesCloudLoad = _edicoesCloudLoad;
window._mesclarEdicoesAlvaras = _mesclarEdicoesAlvaras;

function _fsPushFotosSeNecessario(remoteFotos){
  // v6.3.2 — se este navegador tem foto que a nuvem ainda nao tem, empurra automaticamente.
  try{
    remoteFotos = remoteFotos || {};
    var precisa=false;
    (state.usuarios||[]).forEach(function(u){
      if(u && u.email && u.foto && String(u.foto).length>50){
        if(remoteFotos[(u.email||'').toLowerCase()] !== u.foto) precisa=true;
      }
    });
    if(precisa && typeof saveState==='function'){ saveState(); }
  }catch(e){}
}
function _coletarFotosUsuarios(){
  var m = {};
  try{ if(state.fotos_usuarios && typeof state.fotos_usuarios==='object'){ Object.keys(state.fotos_usuarios).forEach(function(k){ var v=state.fotos_usuarios[k]; if(v && String(v).length>30) m[(k||'').toLowerCase().trim()]=v; }); } }catch(e){}
  (state.usuarios||[]).forEach(function(u){ if(u && u.email && u.foto && String(u.foto).length>30){ m[(u.email||'').toLowerCase().trim()] = u.foto; } });
  return m;
}
function _fsCollectFromState() {
  var out = {
    // [v7.0.0] ciencias_por_usuario SAIU daqui. Em 30/07/2026 o documento
    // azuos/shared chegou a 1049 KB, acima do limite de 1 MB do Firestore, e
    // TODA gravacao passou a falhar para todo mundo — foi por isso que nenhum
    // chamado de Manutencao chegava ao admin, mesmo com permissao em ordem.
    // As ciencias eram 466 KB desse total e agora moram em por_usuario/{chave},
    // um documento por pessoa (colecao que ja existia e ja estava liberada nas
    // regras). Ver _cienciasSalvarMinhas / _cienciasCarregarTodas.
    empresas_manuais: state.empresas_manuais || [],
    manutencao: state.manutencao || [],
    resumo_visto_por_usuario: state.resumo_visto_por_usuario || {},
    historico: (state.historico || []).slice(0, 500),
    // [v7.2.0] edicoes_alvaras SAIU daqui (eram 505 KB e cresciam a cada edicao).
    // Agora vivem em azuos/edicoes_meta + azuos/edicoes_N; aqui fica so o carimbo
    // de versao, que avisa os outros navegadores para recarregarem os chunks.
    edicoes_ver: (window._edicoesVer || 0),
    edicoes_empresas: state.edicoes_empresas || {},
    usuarios_removidos: state.usuarios_removidos || [],
    fotos_usuarios: _coletarFotosUsuarios(),
    last_modified_by: state.sessao?.nome || 'desconhecido',
    last_modified_at: firebase.firestore.FieldValue.serverTimestamp()
  };
  // v6.2.2 — SOMENTE o administrador grava/altera a config de premiacao (valores/status).
  // Clientes nao-admin nao enviam esse campo, entao nunca sobrescrevem o valor definido pelo gestor.
  if (state.sessao && state.sessao.cargo === 'Administrador' && state.gamificacao) {
    out.gamificacao = state.gamificacao;
  }
  // v6.26.0 — protecao da estrutura: so o admin grava a config (senha/hash)
  if (state.sessao && state.sessao.cargo === 'Administrador' && state.trava_edicao) {
    out.trava_edicao = state.trava_edicao;
  }
  // [v6.0.38] trava de atualizacao pela planilha: so o admin grava; todos leem
  if (state.sessao && state.sessao.cargo === 'Administrador' && typeof state.trava_planilha !== 'undefined') {
    out.trava_planilha = !!state.trava_planilha;
  }
  // [v6.0.47] pedidos de acesso saem do doc 'shared' (disputado) e vao para a colecao
  // propria 'azuos_acessos'. Nao coletamos mais admin_acessos aqui.
  return out;
}

// v6.0.7 — reanexa o base64 local aos anexos vindos da nuvem (que vem sem 'dados').
// [v7.7.0] Passou a fazer UNIAO de verdade, e a casar por _idb em vez de por nome.
//
// Antes ele so reanexava o base64 de anexos que JA existiam no remoto, e o base64
// local e justamente enxugado no fluxo normal — entao o mapa de origem vinha vazio e
// a funcao nao fazia nada. Um anexo que existisse so do lado local era simplesmente
// descartado ao adotar o remoto. Era um dos caminhos pelos quais o anexo "sumia"
// depois de salvo (medimos 13.219 arquivos na nuvem, muitos deles a mesma pessoa
// reenviando o mesmo arquivo por nao ver o anterior).
//
// Casar por nome tambem estava errado: dois arquivos com o mesmo nome em alvaras
// diferentes, ou reenviados, colidiam. O _idb e unico por anexo.
//
// Escolha consciente: a uniao pode ressuscitar um anexo que alguem apagou de
// proposito em outro navegador. Preferimos isso a perder arquivo — apagar de novo
// custa um clique, recuperar arquivo perdido nao custa nada porque nao da.
function _mesclarAnexosLocais(remoto, local) {
  try {
    if (!remoto || !local) return remoto || local;
    var lr = Array.isArray(remoto.anexos) ? remoto.anexos : [];
    var ll = Array.isArray(local.anexos) ? local.anexos : [];
    if (!lr.length && !ll.length) return remoto;
    function chave(a){ return (a && (a._idb || a.nome)) ? String(a._idb || a.nome) : null; }
    var vistos = {}, out = [];
    lr.forEach(function(a){ var k = chave(a); if (k) vistos[k] = true; out.push(a); });
    ll.forEach(function(a){ var k = chave(a); if (k && !vistos[k]) { vistos[k] = true; out.push(a); } });
    var b64 = {};
    ll.forEach(function(a){ var k = chave(a); if (k && a.dados) b64[k] = a.dados; });
    out = out.map(function(a){
      var k = chave(a);
      if (k && (!a.dados || a.dados === '') && b64[k]) {
        var m = Object.assign({}, a); m.dados = b64[k]; delete m._local; return m;
      }
      return a;
    });
    var copia = Object.assign({}, remoto);
    copia.anexos = out;
    return copia;
  } catch(e) { return remoto; }
}

// v6.0.8: uniao de arrays por id — preserva itens de ambos; remoto prevalece em conflito
function _uniPorId(local, remoto){
  local = Array.isArray(local) ? local : [];
  remoto = Array.isArray(remoto) ? remoto : [];
  var map = {}; var semId = []; var vistos = {};
  // [v7.7.0] Itens LOCAIS sem id tambem sobrevivem.
  // Antes, o laco do local so guardava quem tinha id — entao, num historico gravado
  // sem id, todo o lado local era descartado e sobrava so o remoto. Medido: 620
  // itens locais viravam 500 numa unica passada, silenciosamente.
  function por(x, ehRemoto){
    if (!x) return;
    if (x.id != null) { map[x.id] = x; return; }
    if (!ehRemoto) { semId.push(x); vistos[JSON.stringify(x)] = true; return; }
    // do lado remoto, evita duplicar um item sem id que ja veio do local
    var k = JSON.stringify(x);
    if (!vistos[k]) { vistos[k] = true; semId.push(x); }
  }
  local.forEach(function(x){ por(x, false); });
  remoto.forEach(function(x){ por(x, true); });
  return Object.keys(map).map(function(k){ return map[k]; }).concat(semId);
}

function _fsApplyToState(remote) {
  if (!remote) return false;
  let changed = false;
  // v6.9.0 — sincroniza lista de usuarios removidos (uniao) para exclusao valer em todos
  if (remote && Array.isArray(remote.usuarios_removidos)) {
    state.usuarios_removidos = state.usuarios_removidos || [];
    remote.usuarios_removidos.forEach(function(e){ var em=(e||'').toLowerCase().trim(); if(em && state.usuarios_removidos.indexOf(em)<0){ state.usuarios_removidos.push(em); changed=true; } });
  }
  // v6.3.1 — sincroniza fotos de usuarios entre dispositivos (por email)
  if (remote && remote.fotos_usuarios && typeof remote.fotos_usuarios === 'object') {
    state.fotos_usuarios = state.fotos_usuarios || {};
    Object.keys(remote.fotos_usuarios).forEach(function(k){ var kk=(k||'').toLowerCase().trim(); var v=remote.fotos_usuarios[k]; if(v && state.fotos_usuarios[kk]!==v){ state.fotos_usuarios[kk]=v; changed=true; } });
    (state.usuarios||[]).forEach(function(u){
      if(!u || !u.email) return;
      var f = state.fotos_usuarios[(u.email||'').toLowerCase().trim()];
      if(f && f !== u.foto){ u.foto = f; changed = true; }
    });
  }
  // v6.2.0 — config de premiacao (valor por alvara): adota a versao mais recente
  if (remote && remote.gamificacao && typeof remote.gamificacao === 'object') {
    var _lg = state.gamificacao || null; var _rg = remote.gamificacao;
    var _tl = (_lg && _lg.atualizado_em) || ''; var _tr = _rg.atualizado_em || '';
    if (!_lg || _tr > _tl) { state.gamificacao = _rg; changed = true; }
  }
  // v6.26.0 — protecao da estrutura: todos adotam a config mais recente
  if (remote && remote.trava_edicao && typeof remote.trava_edicao === 'object') {
    var _lt = state.trava_edicao || null; var _rt = remote.trava_edicao;
    var _tlt = (_lt && _lt.atualizado_em) || ''; var _trt = _rt.atualizado_em || '';
    if (!_lt || _trt > _tlt) { state.trava_edicao = _rt; changed = true; }
  }
  // [v6.0.38] trava de atualizacao pela planilha: todos adotam o valor do admin
  if (remote && typeof remote.trava_planilha !== 'undefined') {
    if (state.trava_planilha !== !!remote.trava_planilha) { state.trava_planilha = !!remote.trava_planilha; changed = true; }
  }
  // Campos simples: substitui se diferente
  // v6.0.8: merge por id — nao substitui arrays em bloco (evita perder itens criados em paralelo)
  ['empresas_manuais','historico','manutencao'].forEach(k => {
    if (remote[k] !== undefined) {
      var _m = _uniPorId(state[k], remote[k]);
      if (k === 'historico') _m.sort(function(a,b){ var da=(a&&a.data)||'', db=(b&&b.data)||''; return db<da?-1:(db>da?1:0); });
      if (JSON.stringify(state[k]) !== JSON.stringify(_m)) { state[k] = _m; changed = true; }
    }
  });
  if (remote.resumo_visto_por_usuario) {
    var _rv = Object.assign({}, state.resumo_visto_por_usuario || {}, remote.resumo_visto_por_usuario);
    if (JSON.stringify(state.resumo_visto_por_usuario) !== JSON.stringify(_rv)) { state.resumo_visto_por_usuario = _rv; changed = true; }
  }
  // [v6.0.2 fix] MERGE inteligente para edicoes_alvaras: mantem o mais RECENTE por alvId
  // Antes sobrescrevia cegamente — bug: snapshot do servidor atropelava edição local recente
  // [v7.2.0] o merge virou funcao propria: agora e usado tanto pelo campo legado
  // do 'shared' quanto pelos chunks de edicoes_alvaras.
  if (remote.edicoes_alvaras) {
    if (_mesclarEdicoesAlvaras(remote.edicoes_alvaras)) changed = true;
    _absorverEdicoesLegado();
  }
  // [v6.0.2 fix] Mesma lógica para edicoes_empresas
  if (remote.edicoes_empresas) {
    state.edicoes_empresas = state.edicoes_empresas || {};
    Object.keys(remote.edicoes_empresas).forEach(eid => {
      const r = remote.edicoes_empresas[eid];
      const l = state.edicoes_empresas[eid];
      if (!l) { state.edicoes_empresas[eid] = r; changed = true; return; }
      const tR = r && r._editado_em ? r._editado_em : '';
      const tL = l && l._editado_em ? l._editado_em : '';
      if (tR > tL) { state.edicoes_empresas[eid] = r; changed = true; }
    });
  }
  // [v7.1.0] CAMPO LEGADO, com limpeza que se cura sozinha.
  // A migracao tirou ciencias_por_usuario do azuos/shared, mas navegadores ainda
  // na versao antiga regravam o campo a cada sincronizacao — em 24h ele voltou
  // com 214 KB e o documento subiu de 586 para 789 KB, rumo a estourar 1 MB de
  // novo e travar TODAS as gravacoes.
  // Aqui, ao encontrar o campo, o cliente novo ABSORVE (uniao por valor), salva no
  // lugar certo e so entao APAGA a origem. Cada pessoa que atualizar a pagina
  // limpa um pouco; nada se perde, porque so apagamos depois de guardar.
  if (remote.ciencias_por_usuario) {
    state.ciencias_por_usuario = state.ciencias_por_usuario || {};
    var _chaveC = function(x){ return (typeof x === 'string') ? x : JSON.stringify(x); };
    Object.keys(remote.ciencias_por_usuario).forEach(em => {
      const r = remote.ciencias_por_usuario[em];
      if (!Array.isArray(r)) return;
      const l = Array.isArray(state.ciencias_por_usuario[em]) ? state.ciencias_por_usuario[em] : [];
      const vistos = {}; l.forEach(function(x){ vistos[_chaveC(x)] = 1; });
      const uni = l.slice();
      r.forEach(function(x){ var c=_chaveC(x); if(!vistos[c]){ vistos[c]=1; uni.push(x); } });
      if (uni.length !== l.length || !state.ciencias_por_usuario[em]) {
        state.ciencias_por_usuario[em] = uni; changed = true;
      }
    });
    // [v7.3.0] Salva o mapa INTEIRO (todas as pessoas), nao so as chaves de quem
    // esta logado — o campo legado carrega as ciencias da equipe toda, e apagar
    // depois de salvar so as minhas destruiria as dos outros.
    try{
      if (typeof _cienciasSalvarMapa === 'function') {
        _cienciasSalvarMapa(remote.ciencias_por_usuario).then(function(ok){
          if (!ok) { console.warn('[FS] legado NAO removido: nem todas as ciencias foram gravadas no destino'); return; }
          try{
            _fsDocRef().update({
              ciencias_por_usuario: firebase.firestore.FieldValue.delete()
            }).then(function(){ console.log('[FS] campo legado ciencias_por_usuario removido do shared'); })
              .catch(function(e){ console.warn('[FS] limpeza do legado:', (e&&e.message)||e); });
          }catch(e){}
        });
      }
    }catch(e){}
  }
  // Overlay de edições nos arrays do SEED
  _aplicarEdicoesNosArrays();
  return changed;
}

/* [03/08/2026] A SOBREPOSICAO virou funcao propria e passou a ser chamada em TODO
   ponto que troca state.alvaras ou traz edicoes novas.
   Antes ela existia so aqui dentro, e isso produzia o sintoma relatado: "o sistema
   continua atualizando o alvara conforme a planilha". Nao era a planilha gravando
   — era a EDICAO DA EQUIPE sumindo da tela. Dois caminhos:
     - o sync (a cada 10 min) substitui state.alvaras pela base da nuvem e nao
       reaplicava as edicoes por cima;
     - no boot, as edicoes chegam dos chunks DEPOIS do _fsApplyToState, entao a
       sobreposicao rodava sobre um mapa ainda vazio.
   Em ambos, o alvara voltava a exibir o valor da base — que veio da planilha. */
function _aplicarEdicoesNosArrays(){
  try{
    if (state.edicoes_alvaras) {
      var porId = {};
      (state.alvaras || []).forEach(function(a){ if(a && a.id != null) porId[String(a.id)] = a; });
      Object.keys(state.edicoes_alvaras).forEach(function(aid){
        var alv = porId[String(aid)];
        if (alv) Object.assign(alv, state.edicoes_alvaras[aid]);
      });
    }
    if (state.edicoes_empresas) {
      var empPorId = {};
      (state.empresas || []).forEach(function(e){ if(e && e.id != null) empPorId[String(e.id)] = e; });
      Object.keys(state.edicoes_empresas).forEach(function(eid){
        var emp = empPorId[String(eid)];
        if (emp) Object.assign(emp, state.edicoes_empresas[eid]);
      });
    }
  }catch(e){ console.warn('[overlay]', (e&&e.message)||e); }
}
window._aplicarEdicoesNosArrays = _aplicarEdicoesNosArrays;

/* ============================================================
   v6.18.0 — Sincronizacao de ARQUIVO dos anexos entre dispositivos.
   Antes: o anexo (base64) ficava so no IndexedDB de quem enviou; so o
   NOME sincronizava. Agora o base64 vai para docs pequenos na colecao
   'azuos' (ja liberada nas rules): azuos/anx_<chave> (+ chunks se >0.8MB).
   Nao usa Firebase Storage/plano pago. O app nunca le a colecao 'azuos'
   inteira (so doc('shared')), entao docs irmaos nao atrapalham.
   ============================================================ */
var _ANEXO_PREFIX = 'anx_';
var _ANEXO_CH = 800000;          // ~0.8MB por chunk (margem do limite de 1MB do Firestore)
var _anexoCloudCache = {};        // chave -> base64 (cache de sessao)
var _anexoPushFeito = {};         // chave -> true (evita repush)
function _anexoDoc(id){ return window.fbDB.collection('azuos').doc(id); }

function _anexoCloudPush(chave, dados, meta){
  // v6.19.0 — grava DIRETO (sem leitura previa que travava quando offline).
  // Marca como concluido SO apos o write completar, entao falhas permitem nova tentativa.
  try{
    if(!chave || !dados || typeof dados!=='string' || dados.indexOf('data:')!==0) return Promise.resolve(false);
    if(_anexoPushFeito[chave]) return Promise.resolve(true);
    if(!window.fbDB) return Promise.resolve(false);
    var chunks=[]; for(var i=0;i<dados.length;i+=_ANEXO_CH){ chunks.push(dados.slice(i,i+_ANEXO_CH)); }
    var head = { n: chunks.length, nome:(meta&&meta.nome)||'', tipo:(meta&&meta.tipo)||'', ts: Date.now() };
    var ps;
    if(chunks.length===1){ head.d = chunks[0]; ps = [ _anexoDoc(_ANEXO_PREFIX + chave).set(head) ]; }
    else { ps = [ _anexoDoc(_ANEXO_PREFIX + chave).set(head) ]; for(var j=0;j<chunks.length;j++){ ps.push(_anexoDoc(_ANEXO_PREFIX + chave + '__' + j).set({ d: chunks[j] })); } }
    return Promise.all(ps).then(function(){ _anexoPushFeito[chave]=true; return true; })
      .catch(function(e){ try{ console.warn('[anexo push]', (e&&e.message)||e); }catch(_){}; return false; });
  }catch(e){ return Promise.resolve(false); }
}

function _anexoCloudFetch(chave){
  try{
    if(!chave) return Promise.resolve(null);
    if(_anexoCloudCache[chave]) return Promise.resolve(_anexoCloudCache[chave]);
    if(!window.fbDB) return Promise.resolve(null);
    return _anexoDoc(_ANEXO_PREFIX + chave).get().then(function(doc){
      if(!doc || !doc.exists) return null;
      var data = doc.data() || {};
      var n = data.n || 1;
      if(n<=1){ if(data.d){ _anexoCloudCache[chave]=data.d; return data.d; } return null; }
      var ps=[]; for(var j=0;j<n;j++){ ps.push(_anexoDoc(_ANEXO_PREFIX + chave + '__' + j).get()); }
      return Promise.all(ps).then(function(docs){
        var full=''; for(var k=0;k<docs.length;k++){ var dd=(docs[k]&&docs[k].data())||{}; full += (dd.d||''); }
        if(full){ _anexoCloudCache[chave]=full; return full; }
        return null;
      });
    }).catch(function(e){ try{ console.warn('[anexo fetch]', (e&&e.message)||e); }catch(_){}; return null; });
  }catch(e){ return Promise.resolve(null); }
}

/* ============================================================
   [v6.1.0] ALVARAS na nuvem (app vira dono; Drive passa a trazer so empresas).
   Como o conjunto passa de 1MB, guardamos em CHUNKS: azuos/alvaras_meta + alvaras_N.
   Guardamos SEM o base64 dos anexos (so metadados; o base64 vive em anx_/IndexedDB).
   ============================================================ */
var _ALV_PREFIX = 'alvaras_';
var _ALV_CH = 800000; // ~0.8MB por chunk (margem do limite de 1MB)
function _alvarasLean(lista){
  return (lista||[]).map(function(a){
    if(!a) return a;
    var c = Object.assign({}, a);
    if(Array.isArray(c.anexos)){
      c.anexos = c.anexos.map(function(x){
        var m = Object.assign({}, x);
        if(m.dados && String(m.dados).indexOf('data:')===0){ m.dados=''; m._local=true; }
        return m;
      });
    }
    return c;
  });
}
function _alvarasCloudSave(lista){
  try{
    if(!window.fbDB) return Promise.resolve(false);
    var lean = _alvarasLean(lista || (state.alvaras||[]));
    var json = JSON.stringify(lean);
    var chunks=[]; for(var i=0;i<json.length;i+=_ALV_CH){ chunks.push(json.slice(i,i+_ALV_CH)); }
    var db=window.fbDB, C=db.collection('azuos');
    var ps=[ C.doc(_ALV_PREFIX+'meta').set({ n:chunks.length, count:lean.length, ts:Date.now(), by:(state.sessao&&state.sessao.email)||'sistema', ver:1 }) ];
    for(var j=0;j<chunks.length;j++){ ps.push(C.doc(_ALV_PREFIX+j).set({ d:chunks[j] })); }
    // apaga chunks sobrando de uma versao anterior maior (ate 40 a mais)
    for(var z=chunks.length; z<chunks.length+40; z++){ ps.push(C.doc(_ALV_PREFIX+z).delete().catch(function(){})); }
    return Promise.all(ps).then(function(){ console.log('[alvaras] salvos na nuvem:', lean.length, 'em', chunks.length, 'chunks'); return true; })
      .catch(function(e){ console.warn('[alvaras save]', (e&&e.message)||e); return false; });
  }catch(e){ console.warn('[alvaras save]', e&&e.message); return Promise.resolve(false); }
}
function _alvarasCloudLoad(){
  try{
    if(!window.fbDB) return Promise.resolve(null);
    var C=window.fbDB.collection('azuos');
    return C.doc(_ALV_PREFIX+'meta').get().then(function(meta){
      if(!meta || !meta.exists) return null;
      var n=(meta.data()||{}).n||0; if(!n) return null;
      var ps=[]; for(var j=0;j<n;j++){ ps.push(C.doc(_ALV_PREFIX+j).get()); }
      return Promise.all(ps).then(function(docs){
        var full=''; for(var k=0;k<docs.length;k++){ full += ((docs[k]&&docs[k].data())||{}).d||''; }
        if(!full) return null;
        try{ var arr=JSON.parse(full); console.log('[alvaras] carregados da nuvem:', arr.length); return arr; }
        catch(e){ console.warn('[alvaras load parse]', e&&e.message); return null; }
      });
    }).catch(function(e){ console.warn('[alvaras load]', (e&&e.message)||e); return null; });
  }catch(e){ return Promise.resolve(null); }
}
window._alvarasCloudSave = _alvarasCloudSave;
window._alvarasCloudLoad = _alvarasCloudLoad;

var _anexoBackfillTs = 0;
function _anexoBackfillCloud(){
  // v6.19.0 — roda periodicamente (throttle 4s), nao mais uma unica vez.
  // O navegador que TEM o arquivo local empurra para a nuvem os que ainda
  // nao subiram; se o Firestore estiver offline, tenta de novo no proximo ciclo.
  try{
    if(!window.fbDB || typeof _idbGet!=='function' || typeof state==='undefined') return;
    var now = Date.now(); if(now - _anexoBackfillTs < 4000) return; _anexoBackfillTs = now;
    var vistos={}, lista=[];
    function scan(c){ if(c && Array.isArray(c.anexos)) c.anexos.forEach(function(a){ if(a && a._idb && !_anexoPushFeito[a._idb] && !vistos[a._idb]){ vistos[a._idb]=1; lista.push({ id:a._idb, nome:a.nome, tipo:a.tipo }); } }); }
    (state.alvaras||[]).forEach(scan);
    if(state.edicoes_alvaras) Object.keys(state.edicoes_alvaras).forEach(function(k){ scan(state.edicoes_alvaras[k]); });
    lista.forEach(function(it){
      _idbGet(it.id).then(function(b64){
        if(b64 && typeof b64==='string' && b64.indexOf('data:')===0){ _anexoCloudPush(it.id, b64, { nome:it.nome, tipo:it.tipo }); }
      }).catch(function(){});
    });
  }catch(e){}
}
