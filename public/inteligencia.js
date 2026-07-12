/* ================================================================
   CENTRO DE INTELIGÊNCIA — Gestão do Paralegal (v6.13.0)
   Módulo separado (public/inteligencia.js) — NÃO é um remendo IIFE no index.

   1ª inteligência: Auditoria de Próxima Atualização
   Regra: alvará com VENCIMENTO preenchido mas SEM proxima_atualizacao
   é uma pendência de gestão (tem prazo, mas ninguém agendou o próximo ciclo).

   Depende de globais definidos no index.html: state, esc, render, setState,
   parseDataBR. Este arquivo apenas DEFINE funções em window; elas só executam
   quando o usuário navega até a aba, muito depois do carregamento — por isso
   a ordem de <script> não importa.
   ================================================================ */
(function(){
  // helpers de escopo -------------------------------------------------------
  function _proxVazia(v){
    // considera vazio: null, undefined, '', '-', '—', 'null'
    if (v === null || v === undefined) return true;
    var s = String(v).trim();
    return s === '' || s === '-' || s === '—' || s.toLowerCase() === 'null';
  }
  function _meuNomeAtual(){
    return (typeof state!=='undefined' && state.sessao) ? (state.sessao.email || state.sessao.nome || '') : '';
  }
  function _souAdmin(){
    return !!(typeof state!=='undefined' && state.sessao && state.sessao.cargo === 'Administrador');
  }
  // fallback de escape caso esc() ainda não exista no momento da chamada
  function _esc(s){ return (typeof esc==='function') ? esc(s) : String(s==null?'':s).replace(/[&<>"']/g, function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]; }); }

  // estado da seção (em window p/ sobreviver a re-renders) -------------------
  window._auditProxAgrupar = window._auditProxAgrupar || 'empresa'; // 'empresa' | 'responsavel'
  window._auditProxBusca = window._auditProxBusca || '';
  window._auditProxSoMeu = (typeof window._auditProxSoMeu === 'boolean') ? window._auditProxSoMeu : false;

  var TERMINAIS = /^(conclu|pago|em vigor|sem obrigat|arquivad|isento)/i;

  // Núcleo: alvarás com vencimento e SEM próxima atualização.
  // Admin vê tudo; usuário comum só os seus. Ignora status terminais.
  window._auditProxItens = function(){
    var meu = _meuNomeAtual();
    var admin = _souAdmin();
    var soMeu = admin ? window._auditProxSoMeu : true; // não-admin sempre restrito
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a) return false;
      if (!a.vencimento) return false;                      // sem vencimento não é auditável aqui
      if (!_proxVazia(a.proxima_atualizacao)) return false; // já preenchida => ok
      if (a.status && TERMINAIS.test(a.status)) return false; // status terminal não precisa de próx.
      if (soMeu && (a.responsavel || '') !== meu) return false;
      return true;
    });
  };

  // universo auditável (alvarás vivos com vencimento no escopo) — p/ % de saúde
  function _universoEscopo(){
    var meu = _meuNomeAtual();
    var admin = _souAdmin();
    var soMeu = admin ? window._auditProxSoMeu : true;
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a || !a.vencimento) return false;
      if (a.status && TERMINAIS.test(a.status)) return false;
      if (soMeu && (a.responsavel||'') !== meu) return false;
      return true;
    }).length;
  }

  function _agruparPorEmpresa(itens){
    var m = {};
    var empresas = (typeof state!=='undefined' && state.empresas) ? state.empresas : [];
    itens.forEach(function(a){
      var k = a.empresa_id != null ? a.empresa_id : ('nome:' + (a.empresa || '?'));
      if (!m[k]) {
        var emp = empresas.find(function(e){ return e.id == a.empresa_id; });
        m[k] = { id: a.empresa_id, nome: (emp && emp.nome) || a.empresa || '(sem nome)',
                 cidade: (emp && emp.cidade) || a.cidade || '', responsavel: (emp && emp.responsavel) || a.responsavel || '',
                 itens: [] };
      }
      m[k].itens.push(a);
    });
    return Object.values(m).sort(function(x,y){ return y.itens.length - x.itens.length; });
  }
  function _agruparPorResp(itens){
    var m = {};
    itens.forEach(function(a){
      var k = a.responsavel || '(sem responsável)';
      if (!m[k]) m[k] = { nome: k, itens: [], empresas: new Set() };
      m[k].itens.push(a);
      m[k].empresas.add(a.empresa_id != null ? a.empresa_id : a.empresa);
    });
    return Object.values(m).sort(function(x,y){ return y.itens.length - x.itens.length; });
  }

  window.renderInteligencia = function(){
    var itensTodos = window._auditProxItens();
    var admin = _souAdmin();
    var q = (window._auditProxBusca || '').trim().toLowerCase();
    var itens = !q ? itensTodos : itensTodos.filter(function(a){
      return ((a.empresa||'') + ' ' + (a.cidade||'') + ' ' + (a.responsavel||'') + ' ' + (a.tipo||'')).toLowerCase().indexOf(q) >= 0;
    });

    var totalAlv = itens.length;
    var empresasAfetadas = new Set(itens.map(function(a){ return a.empresa_id != null ? a.empresa_id : a.empresa; })).size;
    var respAfetados = new Set(itens.map(function(a){ return a.responsavel || '(sem)'; })).size;
    var universo = _universoEscopo();
    var pctOk = universo > 0 ? Math.round(((universo - itensTodos.length) / universo) * 100) : 100;
    var corSaude = pctOk >= 90 ? 'emerald' : (pctOk >= 70 ? 'amber' : 'rose');

    var grupos = window._auditProxAgrupar === 'responsavel' ? _agruparPorResp(itens) : _agruparPorEmpresa(itens);

    var kpis = [
      {l:'Alvarás sem próx. atualização', v: totalAlv, c:'rose', sub:'com vencimento definido'},
      {l:'Empresas afetadas', v: empresasAfetadas, c:'amber', sub:'precisam de ação'},
      {l:'Responsáveis envolvidos', v: respAfetados, c:'blue', sub:'com pendências'},
      {l:'Saúde da base', v: pctOk + '%', c: corSaude, sub: universo + ' alvarás no escopo'}
    ];

    var _hoje = new Date();
    var vencColor = function(a){
      var d = (typeof parseDataBR==='function') ? parseDataBR(a.vencimento) : null;
      if (!d) return 'slate';
      var diff = Math.round((d - _hoje)/(1000*60*60*24));
      if (diff < 0) return 'red';       // já venceu
      if (diff <= 10) return 'orange';  // vence em breve
      return 'slate';
    };
    var vencLabel = function(a){
      var d = (typeof parseDataBR==='function') ? parseDataBR(a.vencimento) : null;
      if (!d) return a.vencimento || '';
      var diff = Math.round((d - _hoje)/(1000*60*60*24));
      if (diff < 0) return 'venceu há ' + Math.abs(diff) + 'd';
      if (diff === 0) return 'vence hoje';
      return 'vence em ' + diff + 'd';
    };

    return `
    <div class="p-6">
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">🧠 Centro de Inteligência</h1>
          <p class="text-sm text-slate-500 mt-0.5">Gestão proativa do paralegal · Auditorias de qualidade de dados${admin?'':' <span class="text-amber-600 font-medium">(escopo: seus alvarás)</span>'}</p>
        </div>
      </div>

      <!-- Abas de inteligências (só uma por enquanto; preparado p/ crescer) -->
      <div class="flex items-center gap-2 mt-4 mb-5 border-b border-slate-200">
        <div class="px-4 py-2 text-sm font-semibold text-rose-600 border-b-2 border-rose-500 -mb-px flex items-center gap-2">
          📅 Próxima Atualização
          ${totalAlv>0?`<span class="bg-rose-100 text-rose-700 text-[10px] font-bold rounded-full px-2 py-0.5">${totalAlv}</span>`:''}
        </div>
        <div class="px-4 py-2 text-sm font-medium text-slate-300 cursor-not-allowed flex items-center gap-1" title="Em breve">🔜 mais auditorias</div>
      </div>

      <!-- Explicação da auditoria -->
      <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 mb-5 flex items-start gap-3">
        <div class="text-2xl leading-none">⚠️</div>
        <div class="text-sm text-rose-900">
          <span class="font-bold">Auditoria: alvarás sem data de próxima atualização.</span>
          Estes alvarás têm <b>vencimento definido</b> mas <b>ninguém agendou o próximo ciclo</b> — risco de cair no esquecimento e vencer sem acompanhamento.
          Status já concluídos/em vigor são ignorados. <span class="font-semibold">Clique numa empresa para corrigir.</span>
        </div>
      </div>

      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${kpis.map(function(k){ return `<div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-${k.c}-500">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">${k.l}</div>
          <div class="text-3xl font-bold text-slate-800 mt-1 leading-tight">${k.v}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${k.sub}</div>
        </div>`; }).join('')}
      </div>

      <!-- Controles -->
      <div class="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <div class="flex items-center gap-2">
          <label class="text-xs font-semibold text-slate-600 uppercase">Agrupar por:</label>
          <button class="intel-group px-3 py-1.5 rounded-lg text-sm font-medium ${window._auditProxAgrupar==='empresa'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}" data-g="empresa">🏢 Empresa</button>
          <button class="intel-group px-3 py-1.5 rounded-lg text-sm font-medium ${window._auditProxAgrupar==='responsavel'?'bg-blue-600 text-white':'bg-slate-100 text-slate-700 hover:bg-slate-200'}" data-g="responsavel">👤 Responsável</button>
        </div>
        ${admin?`<div class="h-6 w-px bg-slate-200"></div>
        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" id="intel-so-meu" ${window._auditProxSoMeu?'checked':''} class="w-4 h-4 rounded"> Só os meus
        </label>`:''}
        <div class="flex-1 min-w-[180px]">
          <input id="intel-busca" type="text" value="${_esc(window._auditProxBusca||'')}" placeholder="🔎 Filtrar por empresa, cidade, responsável, tipo..." class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
        </div>
        <button id="intel-export" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100">⬇️ Exportar CSV</button>
      </div>

      ${totalAlv === 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
          <div class="text-5xl mb-3">🎉</div>
          <div class="text-lg font-bold text-slate-800">Tudo em dia!</div>
          <div class="text-sm text-slate-500 mt-1">Nenhum alvará ${q?'(no filtro atual) ':''}com vencimento está sem data de próxima atualização.</div>
        </div>
      ` : `
        <div class="space-y-3">
          ${grupos.map(function(g){
            var isEmp = window._auditProxAgrupar === 'empresa';
            var head = isEmp
              ? `<button class="intel-open text-left flex-1 min-w-0 group" ${g.id!=null?`data-eid="${g.id}"`:''}>
                   <div class="font-bold text-slate-800 truncate group-hover:text-blue-600">${_esc(g.nome)}</div>
                   <div class="text-[11px] text-slate-500 truncate">${_esc(g.cidade||'')}${g.responsavel?' · 👤 '+_esc(g.responsavel):''}</div>
                 </button>`
              : `<div class="flex-1 min-w-0">
                   <div class="font-bold text-slate-800 truncate">👤 ${_esc(g.nome)}</div>
                   <div class="text-[11px] text-slate-500">${g.empresas.size} empresa(s) afetada(s)</div>
                 </div>`;
            return `<div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-rose-400">
              <div class="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                ${head}
                <span class="shrink-0 bg-rose-100 text-rose-700 text-xs font-bold rounded-full px-3 py-1">${g.itens.length} alvará(s)</span>
                ${isEmp && g.id!=null ? `<button class="intel-open shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700" data-eid="${g.id}">Corrigir →</button>` : ''}
              </div>
              <div class="divide-y divide-slate-50">
                ${g.itens.map(function(a){
                  var vc = vencColor(a);
                  return `<div class="flex items-center gap-3 px-4 py-2 text-sm hover:bg-slate-50">
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-slate-700">${_esc(a.tipo||'(sem tipo)')}</span>
                      ${!isEmp?`<span class="text-slate-400"> · ${_esc(a.empresa||'')}</span>`:''}
                      ${a.status?`<span class="ml-2 text-[10px] uppercase tracking-wide text-slate-400">${_esc(a.status)}</span>`:''}
                    </div>
                    <span class="shrink-0 text-xs text-slate-500">venc: <b class="text-slate-700">${_esc(a.vencimento||'')}</b></span>
                    <span class="shrink-0 text-[10px] font-bold text-${vc}-600 bg-${vc}-50 rounded px-2 py-0.5">${vencLabel(a)}</span>
                    <span class="shrink-0 text-[10px] font-bold text-rose-600 bg-rose-50 rounded px-2 py-0.5">próx: —</span>
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
  };

  window.attachInteligencia = function(){
    document.querySelectorAll('.intel-group').forEach(function(b){
      b.onclick = function(){ window._auditProxAgrupar = b.dataset.g; render(); };
    });
    var soMeu = document.getElementById('intel-so-meu');
    if (soMeu) soMeu.onclick = function(){ window._auditProxSoMeu = soMeu.checked; render(); };
    document.querySelectorAll('.intel-open').forEach(function(b){
      b.onclick = function(){ var id = b.dataset.eid; if (id != null) setState({empresaAtiva: isNaN(+id)?id:+id}); };
    });
    var busca = document.getElementById('intel-busca');
    if (busca) {
      var _t;
      busca.oninput = function(){
        clearTimeout(_t);
        var v = busca.value;
        _t = setTimeout(function(){ window._auditProxBusca = v; render();
          var el = document.getElementById('intel-busca'); if (el){ el.focus(); el.selectionStart = el.selectionEnd = el.value.length; }
        }, 250);
      };
    }
    var exp = document.getElementById('intel-export');
    if (exp) exp.onclick = function(){
      var itens = window._auditProxItens().filter(function(a){
        var q = (window._auditProxBusca||'').trim().toLowerCase();
        if (!q) return true;
        return ((a.empresa||'')+' '+(a.cidade||'')+' '+(a.responsavel||'')+' '+(a.tipo||'')).toLowerCase().indexOf(q)>=0;
      });
      var linhas = [['Empresa','Cidade','Responsavel','Tipo','Status','Vencimento','Proxima Atualizacao']];
      itens.forEach(function(a){
        linhas.push([a.empresa||'', a.cidade||'', a.responsavel||'', a.tipo||'', a.status||'', a.vencimento||'', '']);
      });
      var csv = linhas.map(function(r){ return r.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(','); }).join('\n');
      var blob = new Blob(["﻿"+csv], {type:'text/csv;charset=utf-8;'});
      var url = URL.createObjectURL(blob);
      var link = document.createElement('a');
      link.href = url; link.download = 'auditoria-proxima-atualizacao.csv';
      document.body.appendChild(link); link.click(); document.body.removeChild(link);
      setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
    };
  };
})();
