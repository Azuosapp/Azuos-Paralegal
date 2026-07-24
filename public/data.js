/* Azuos Paralegal — camada de persistencia (Estagio 3: centralizada, relocada verbatim) */
'use strict';

// v6.0.12 — copia do estado SEM o base64 pesado dos anexos, para caber no localStorage.
function _estadoParaLocal() {
  function limpar(item){
    if (item && Array.isArray(item.anexos) && item.anexos.length) {
      var c = Object.assign({}, item);
      c.anexos = item.anexos.map(function(a){ var m = Object.assign({}, a); if (m.dados && String(m.dados).indexOf('data:')===0) { m.dados = ''; m._local = true; } return m; });
      return c;
    }
    return item;
  }
  var s = Object.assign({}, state);
  if (Array.isArray(state.alvaras)) s.alvaras = state.alvaras.map(limpar);
  if (state.edicoes_alvaras) { var e = {}; Object.keys(state.edicoes_alvaras).forEach(function(k){ e[k] = limpar(state.edicoes_alvaras[k]); }); s.edicoes_alvaras = e; }
  return s;
}
function _persistirEstadoAgora() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(_estadoParaLocal()));
    return true;
  } catch (e) {
    console.warn('[saveState] localStorage cheio (' + (e && e.name) + '), tentando liberar espaco...');
    // 1) Libera chaves temporarias e tenta de novo (dados intactos)
    try {
      _liberarEspacoLocalStorage();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(_estadoParaLocal()));
      return true;
    } catch (e2) {
      // 2) Salva com historico reduzido — dados dos alvaras sao preservados
      try {
        var slim = Object.assign({}, _estadoParaLocal(), { historico: (state.historico || []).slice(0, 100) });
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        if (typeof toast === 'function') toast('\u26a0\ufe0f Espaco local cheio: historico antigo reduzido. Seus dados foram salvos.', 'amber');
        return true;
      } catch (e3) {
        // 3) Nao conseguiu salvar. NAO apaga nada ja salvo. Avisa claramente.
        console.error('[saveState] Falha ao persistir mesmo apos liberar espaco:', e3 && e3.name);
        if (!window._avisouQuota) {
          window._avisouQuota = true;
          alert('\u26a0\ufe0f Nao foi possivel salvar no navegador: o armazenamento local esta cheio '
            + '(geralmente por causa de anexos grandes em base64).\n\n'
            + 'Os dados que voce JA havia salvo continuam intactos \u2014 nada foi perdido.\n\n'
            + 'Para voltar a salvar: remova alguns anexos pesados de alvaras ou use arquivos menores. '
            + 'Depois refaca este preenchimento.');
        }
        return false;
      }
    }
  }
}

// v6.0.11 perf: agrupa gravacoes no localStorage (debounce) sem perder dados.
// Descarga garantida ao ocultar/fechar a aba (pagehide/beforeunload/visibilitychange).
var _persistTimer = null;
function _persistirEstado() {
  // [v6.0.37] Antes isto era debounced e retornava `true` "no escuro": o resultado
  // REAL (false quando o localStorage estoura) so nascia 400ms depois, de forma
  // assincrona, e era descartado. Ou seja, todo `if(saveState()===false)` do app
  // era codigo morto e o usuario perdia trabalho sem aviso quando a cota estourava.
  // Agora grava na hora e devolve o resultado verdadeiro. saveState roda em acoes
  // pontuais (salvar/editar/dar ciencia), nao a cada tecla, entao o custo e minimo.
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  return _persistirEstadoAgora();
}
function _flushPersistir() {
  if (_persistTimer) { clearTimeout(_persistTimer); _persistTimer = null; }
  try { _persistirEstadoAgora(); } catch(e){}
}
try {
  window.addEventListener('pagehide', _flushPersistir);
  window.addEventListener('beforeunload', _flushPersistir);
  document.addEventListener('visibilitychange', function(){ if (document.visibilityState === 'hidden') _flushPersistir(); });
} catch(e){}
