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

function _fsCollectFromState() {
  return {
    ciencias_por_usuario: state.ciencias_por_usuario || {},
    empresas_manuais: state.empresas_manuais || [],
    resumo_visto_por_usuario: state.resumo_visto_por_usuario || {},
    historico: (state.historico || []).slice(0, 500),
    edicoes_alvaras: _semAnexosPesados(state.edicoes_alvaras || {}),
    edicoes_empresas: state.edicoes_empresas || {},
    last_modified_by: state.sessao?.nome || 'desconhecido',
    last_modified_at: firebase.firestore.FieldValue.serverTimestamp()
  };
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
  // Campos simples: substitui se diferente
  // v6.0.8: merge por id — nao substitui arrays em bloco (evita perder itens criados em paralelo)
  ['empresas_manuais','historico'].forEach(k => {
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
