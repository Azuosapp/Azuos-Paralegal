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
    ciencias_por_usuario: state.ciencias_por_usuario || {},
    empresas_manuais: state.empresas_manuais || [],
    manutencao: state.manutencao || [],
    resumo_visto_por_usuario: state.resumo_visto_por_usuario || {},
    historico: (state.historico || []).slice(0, 500),
    edicoes_alvaras: _semAnexosPesados(state.edicoes_alvaras || {}),
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

// v6.0.7 — reanexa o base64 local aos anexos vindos da nuvem (que vem sem 'dados'),
// casando por nome do arquivo. Evita perder anexos locais quando o remoto e mais novo.
function _mesclarAnexosLocais(remoto, local) {
  try {
    if (!remoto || !Array.isArray(remoto.anexos) || !local || !Array.isArray(local.anexos)) return remoto;
    var mapaLocal = {};
    local.anexos.forEach(function(a){ if (a && a.nome && a.dados) mapaLocal[a.nome] = a.dados; });
    var copia = Object.assign({}, remoto);
    copia.anexos = remoto.anexos.map(function(a){
      if (a && (!a.dados || a.dados === '') && a.nome && mapaLocal[a.nome]) {
        var m = Object.assign({}, a); m.dados = mapaLocal[a.nome]; delete m._local; return m;
      }
      return a;
    });
    return copia;
  } catch(e) { return remoto; }
}

// v6.0.8: uniao de arrays por id — preserva itens de ambos; remoto prevalece em conflito
function _uniPorId(local, remoto){
  local = Array.isArray(local) ? local : [];
  remoto = Array.isArray(remoto) ? remoto : [];
  var map = {}; var semId = [];
  local.forEach(function(x){ if (x && x.id != null) map[x.id] = x; });
  remoto.forEach(function(x){ if (x && x.id != null) map[x.id] = x; else if (x) semId.push(x); });
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
  if (remote.edicoes_alvaras) {
    state.edicoes_alvaras = state.edicoes_alvaras || {};
    Object.keys(remote.edicoes_alvaras).forEach(aid => {
      const r = remote.edicoes_alvaras[aid];
      const l = state.edicoes_alvaras[aid];
      // Sem local: usa remoto
      if (!l) { state.edicoes_alvaras[aid] = r; changed = true; return; }
      // Compara _editado_em (timestamps ISO comparam string-wise)
      const tR = r && r._editado_em ? r._editado_em : '';
      const tL = l && l._editado_em ? l._editado_em : '';
      // Se local é mais recente, mantém local. Senão usa remoto.
      // v6.0.7: ao adotar o remoto, preserva o base64 dos anexos que só existem localmente
      if (tR > tL) { state.edicoes_alvaras[aid] = _mesclarAnexosLocais(r, l); changed = true; }
    });
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
  // [v6.0.2] Para ciencias_por_usuario: merge por email, união de arrays
  if (remote.ciencias_por_usuario) {
    state.ciencias_por_usuario = state.ciencias_por_usuario || {};
    Object.keys(remote.ciencias_por_usuario).forEach(em => {
      const r = remote.ciencias_por_usuario[em];
      const l = state.ciencias_por_usuario[em];
      if (!l) { state.ciencias_por_usuario[em] = r; changed = true; }
      else if (JSON.stringify(l) !== JSON.stringify(r)) {
        // Se diferente, preserva o local (paralegal acabou de dar ciência)
        // Servidor pega na próxima sincronização
      }
    });
  }
  // Overlay de edições nos arrays do SEED
  if (state.edicoes_alvaras) {
    Object.keys(state.edicoes_alvaras).forEach(aid => {
      const alv = (state.alvaras || []).find(a => a.id == aid);
      if (alv) Object.assign(alv, state.edicoes_alvaras[aid]);
    });
  }
  if (state.edicoes_empresas) {
    Object.keys(state.edicoes_empresas).forEach(eid => {
      const emp = (state.empresas || []).find(e => e.id == eid);
      if (emp) Object.assign(emp, state.edicoes_empresas[eid]);
    });
  }
  return changed;
}

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
