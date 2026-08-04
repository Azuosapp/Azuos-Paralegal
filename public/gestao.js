/* ============================================================================
   PAINEL DE GESTÃO — área exclusiva do administrador (modelo /painel da Trilha).
   Hub de cards + Financeiro/Produtividade por usuário (mês, acumulado, export).

   Módulo separado (não IIFE de remendo). Depende de globais do index:
   state, esc, render, setState, _gamConta, _gamUser, _gamEhGestor, _gamFmt,
   _gamValor, _gamTabela, _gamMeses, _gamMesAtual, _gamStatusSet.
   ========================================================================== */
(function(){
  function _esc(s){ return (typeof esc==='function') ? esc(s) : String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  /* [04/08/2026] escape para dado dentro de atributo de evento. Ver escJs no
     index.html: esc() nao serve aqui, porque o parser HTML decodifica &#39; de
     volta para aspa ANTES de o JavaScript compilar. */
  function _escJs(s){
    if (typeof escJs === 'function') return escJs(s);
    return String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,'\\x27')
      .replace(/"/g,'\\x22').replace(/</g,'\\x3c').replace(/>/g,'\\x3e')
      .replace(/&/g,'\\x26').replace(/[\r\n\u2028\u2029]/g,'');
  }
  function _escUrl(s){ return (typeof escUrl === 'function') ? escUrl(s) : ''; }
  function _fmt(v){ return (typeof _gamFmt==='function') ? _gamFmt(v) : ('R$ ' + (Number(v)||0).toFixed(2).replace('.',',')); }
  function _norm(s){ try{ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }catch(e){ return String(s==null?'':s).trim().toLowerCase(); } }
  window.ehAdminGestao = function(){ return !!(typeof state!=='undefined' && state.sessao && state.sessao.cargo==='Administrador'); };

  // ---- CÁLCULO: valor de um alvará pelo SEU TIPO (corrige o bug do valor único) ----
  // Constrói um índice tipo→valor a partir da tabela por atividade; fallback = valorPorAlvara.
  function _idxValores(){
    var m = {};
    try {
      var tab = (typeof _gamTabela==='function') ? _gamTabela() : [];
      tab.forEach(function(r){ if(r && r.atividade) m[_norm(r.atividade)] = (+r.valor||0); });
    } catch(e){}
    return m;
  }
  window._gamValorDoTipo = function(tipo, idx){
    idx = idx || _idxValores();
    var k = _norm(tipo);
    if (k && idx.hasOwnProperty(k)) return idx[k];
    // tenta casar por prefixo (ex.: "ALVARÁ DE FUNCIONAMENTO" ~ "Funcionamento")
    var achou = null;
    Object.keys(idx).forEach(function(a){ if(!achou && k && (k.indexOf(a)>=0 || a.indexOf(k)>=0)) achou = idx[a]; });
    if (achou != null) return achou;
    return (typeof _gamValor==='function') ? _gamValor() : 0; // fallback: valor padrão
  };

  // ---- AGREGAÇÃO por usuário. mes=null → ACUMULADO (todos os meses). ----
  // Agora paga pelo TIPO real de cada alvará concluído.
  window._gestaoAgrega = function(mes){
    var por = {}; var eds = (typeof state!=='undefined' && state.edicoes_alvaras) || {};
    var idx = _idxValores();
    Object.keys(eds).forEach(function(aid){
      var e = eds[aid];
      if(!e || !e._editado_por || !e._editado_em) return;
      if(typeof _gamConta==='function' && !_gamConta(e.status)) return;
      var cm = (e._editado_em||'').slice(0,7);
      if(mes && cm !== mes) return;
      var u = (typeof _gamUser==='function') ? _gamUser(e._editado_por) : null; if(!u) return;
      if(typeof _gamEhGestor==='function' && _gamEhGestor(u.cargo)) return;
      var k = (u.email||u.nome||'').toLowerCase(); if(!k) return;
      if(!por[k]) por[k] = {nome:u.nome, email:u.email, cargo:u.cargo, foto:u.foto||'', qtd:0, valor:0, chave:k};
      por[k].qtd++;
      por[k].valor += window._gamValorDoTipo(e.tipo, idx);
    });
    var arr = Object.keys(por).map(function(k){ return por[k]; });
    arr.sort(function(a,b){ return (b.valor-a.valor) || (b.qtd-a.qtd) || (a.nome||'').localeCompare(b.nome||''); });
    return arr;
  };

  // agrega por INTERVALO DE DATAS (de/ate em 'YYYY-MM-DD', inclusivo). Trabalhar
  // com datas em vez de mês fechado. Se de/ate vazios, considera tudo.
  window._gestaoAgregaPeriodo = function(de, ate){
    var por = {}; var eds = (typeof state!=='undefined' && state.edicoes_alvaras) || {};
    var idx = _idxValores();
    var dDe = de ? de : null;              // compara string ISO 'YYYY-MM-DD' lexicograficamente
    var dAte = ate ? (ate + 'T23:59:59') : null;
    Object.keys(eds).forEach(function(aid){
      var e = eds[aid];
      if(!e || !e._editado_por || !e._editado_em) return;
      if(typeof _gamConta==='function' && !_gamConta(e.status)) return;
      var em = e._editado_em || '';
      if(dDe && em < dDe) return;
      if(dAte && em > dAte) return;
      var u = (typeof _gamUser==='function') ? _gamUser(e._editado_por) : null; if(!u) return;
      if(typeof _gamEhGestor==='function' && _gamEhGestor(u.cargo)) return;
      var k = (u.email||u.nome||'').toLowerCase(); if(!k) return;
      if(!por[k]) por[k] = {nome:u.nome, email:u.email, cargo:u.cargo, foto:u.foto||'', qtd:0, valor:0, chave:k};
      por[k].qtd++;
      por[k].valor += window._gamValorDoTipo(e.tipo, idx);
    });
    var arr = Object.keys(por).map(function(k){ return por[k]; });
    arr.sort(function(a,b){ return (b.valor-a.valor) || (b.qtd-a.qtd) || (a.nome||'').localeCompare(b.nome||''); });
    return arr;
  };

  // pagamentos marcados (a pagar / pago) por chave|mes → salvo em state.gamificacao.pagamentos
  function _pagKey(chave, mes){ return chave + '|' + mes; }
  window._gestaoPago = function(chave, mes){
    try { var p = (state.gamificacao&&state.gamificacao.pagamentos)||{}; return !!p[_pagKey(chave,mes)]; } catch(e){ return false; }
  };
  window._gestaoMarcarPago = function(chave, mes, pago){
    if(!window.ehAdminGestao()){ alert('Apenas o administrador pode marcar pagamentos.'); return; }
    state.gamificacao = state.gamificacao || {};
    state.gamificacao.pagamentos = state.gamificacao.pagamentos || {};
    if(pago) state.gamificacao.pagamentos[_pagKey(chave,mes)] = { em:new Date().toISOString(), por:(state.sessao&&(state.sessao.email||state.sessao.nome))||'' };
    else delete state.gamificacao.pagamentos[_pagKey(chave,mes)];
    if(typeof saveState==='function') saveState();
    if(typeof render==='function') render();
  };

  // estado local da seção
  window._gestaoView = window._gestaoView || 'hub';   // 'hub' | 'financeiro'
  window._gestaoMes = window._gestaoMes || null;       // null = mês atual
  window._gestaoMesesSel = Array.isArray(window._gestaoMesesSel) ? window._gestaoMesesSel : []; // vazio = 1 mês; 2+ = consolidado
  // clique num mês: alterna inclusão no período. 1 selecionado volta pro modo single.
  window._gestaoToggleMes = function(m){
    var sel = (window._gestaoMesesSel||[]).slice();
    var mesUnico = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    if (!sel.length) sel = [mesUnico]; // começa do mês que estava ativo
    var i = sel.indexOf(m);
    if (i>=0) sel.splice(i,1); else sel.push(m);
    if (sel.length <= 1) { // voltou a 1 (ou 0) → modo single
      window._gestaoMesesSel = [];
      window._gestaoMes = sel[0] || m;
    } else {
      window._gestaoMesesSel = sel;
    }
    render();
  };
  // agrega somando VÁRIOS meses (consolidado). Reusa _gestaoAgrega por mês e soma por pessoa.
  window._gestaoAgregaMeses = function(mesesArr){
    if (!mesesArr || !mesesArr.length) return [];
    var por = {};
    mesesArr.forEach(function(m){
      window._gestaoAgrega(m).forEach(function(r){
        if(!por[r.chave]) por[r.chave] = {nome:r.nome, email:r.email, cargo:r.cargo, foto:r.foto, qtd:0, valor:0, chave:r.chave};
        por[r.chave].qtd += r.qtd; por[r.chave].valor += r.valor;
      });
    });
    return Object.keys(por).map(function(k){ return por[k]; })
      .sort(function(a,b){ return (b.valor-a.valor)||(b.qtd-a.qtd)||(a.nome||'').localeCompare(b.nome||''); });
  };
  // agrega por TIPO de alvará (quanto de cada tipo: Inpi, Bombeiro, Funcionamento...).
  // mesesArr: array de 'YYYY-MM'. Se vazio/null usa o mês passado em mesUnico.
  // Retorna [{tipo, qtd, valor}] ordenado por valor desc.
  window._gestaoAgregaTipos = function(mesesArr, mesUnico){
    var eds = (typeof state!=='undefined' && state.edicoes_alvaras) || {};
    var idx = (function(){ var m={}; try{ var tab=(typeof _gamTabela==='function')?_gamTabela():[]; tab.forEach(function(r){ if(r&&r.atividade) m[_norm(r.atividade)]=(+r.valor||0); }); }catch(e){} return m; })();
    var meses = (mesesArr && mesesArr.length) ? mesesArr : (mesUnico ? [mesUnico] : null);
    var por = {};
    Object.keys(eds).forEach(function(aid){
      var e = eds[aid];
      if(!e || !e._editado_por || !e._editado_em) return;
      if(typeof _gamConta==='function' && !_gamConta(e.status)) return;
      var cm = (e._editado_em||'').slice(0,7);
      if(meses && meses.indexOf(cm) < 0) return;
      var u = (typeof _gamUser==='function') ? _gamUser(e._editado_por) : null; if(!u) return;
      if(typeof _gamEhGestor==='function' && _gamEhGestor(u.cargo)) return;
      var t = (e.tipo && String(e.tipo).trim()) || 'Sem tipo';
      if(!por[t]) por[t] = {tipo:t, qtd:0, valor:0};
      por[t].qtd++;
      por[t].valor += window._gamValorDoTipo(e.tipo, idx);
    });
    return Object.keys(por).map(function(k){ return por[k]; })
      .sort(function(a,b){ return (b.valor-a.valor)||(b.qtd-a.qtd); });
  };
  window._gestaoPeriodoModo = window._gestaoPeriodoModo || 'mes'; // 'mes' | 'datas'
  window._gestaoDe = window._gestaoDe || '';           // 'YYYY-MM-DD'
  window._gestaoAte = window._gestaoAte || '';
  // helper: retorna as linhas do período ativo (mês OU intervalo de datas)
  window._gestaoLinhasAtivas = function(){
    if (window._gestaoPeriodoModo === 'datas' && (window._gestaoDe || window._gestaoAte)) {
      return window._gestaoAgregaPeriodo(window._gestaoDe, window._gestaoAte);
    }
    var m = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    return window._gestaoAgrega(m);
  };

  // ============================ HUB ============================
  var _SECOES = [
    { c:'#10B981', ic:'💰', titulo:'Financeiro / Produtividade', desc:'Quanto cada um gerou, acumulado e folha.',
      itens:[ {t:'Acompanhar valores por usuário', act:"window._gestaoView='financeiro';render()"},
              {t:'Definir valores por atividade', act:"setState({page:'valores'})"} ] },
    { c:'#2B5CE6', ic:'👥', titulo:'Pessoas & Acesso', desc:'Quem usa o sistema, cargos e produtividade.',
      itens:[ {t:'Gerenciar usuários', act:"window._gestaoView='usuarios';render()"} ] },
    { c:'#8B5CF6', ic:'🏆', titulo:'Premiação', desc:'Ranking, regras e corrida.',
      itens:[ {t:'Ver ranking do mês', act:"setState({page:'premiacao'})"} ] },
    { c:'#d97706', ic:'📋', titulo:'Qualidade', desc:'Controle do trabalho e auditorias.',
      itens:[ {t:'Checklists de revisão', act:"setState({page:'checklists'})"},
              {t:'Centro de Inteligência', act:"setState({page:'inteligencia'})"} ] },
    { c:'#F59E0B', ic:'🛠️', titulo:'Operação', desc:'Manutenção e histórico.',
      itens:[ {t:'Painel de manutenção', act:"setState({page:'manutencao'})"},
              {t:'Histórico', act:"setState({page:'historico'})"} ] }
  ];

  function _renderHub(){
    var admin = window.ehAdminGestao();
    if(!admin) return '<div class="p-10 text-center"><div class="text-5xl mb-3">🔒</div><div class="text-lg font-bold text-slate-800">Acesso restrito</div><div class="text-sm text-slate-500 mt-1">O Painel de Gestão é exclusivo do administrador.</div></div>';
    // KPIs rápidos do mês atual
    var mesAtual = (typeof _gamMesAtual==='function') ? _gamMesAtual() : '';
    var rankMes = window._gestaoAgrega(mesAtual);
    var totalMes = rankMes.reduce(function(s,r){ return s+r.valor; }, 0);
    var pessoas = rankMes.length;
    var zuzu = (typeof window.zuzu==='function') ? window.zuzu({pose:'continencia',anim:'float',size:64,alt:'Zuzu'}) : '';
    return `
    <div class="p-6 max-w-5xl mx-auto">
      <div class="flex items-center gap-4 mb-1">
        ${zuzu?`<div class="shrink-0">${zuzu}</div>`:''}
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800 flex items-center gap-2">🛡️ Painel de Gestão</h1>
          <p class="text-sm text-slate-500 mt-0.5">Tudo que é gestão do administrador, num lugar só.</p>
        </div>
      </div>
      <!-- KPIs -->
      <div class="grid grid-cols-2 md:grid-cols-3 gap-3 my-5">
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-emerald-500"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">A pagar no mês</div><div class="text-2xl font-bold text-slate-800 mt-1">${_fmt(totalMes)}</div><div class="text-[11px] text-slate-500">${_esc(mesAtual)}</div></div>
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-blue-500"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Colaboradores produtivos</div><div class="text-2xl font-bold text-slate-800 mt-1">${pessoas}</div><div class="text-[11px] text-slate-500">com alvarás no mês</div></div>
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-purple-500"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Valores</div><div class="text-2xl font-bold text-slate-800 mt-1">por tipo ✓</div><div class="text-[11px] text-slate-500">cada alvará vale o seu tipo</div></div>
      </div>
      <!-- Cards de seção -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${_SECOES.map(function(s){ return `
          <div class="bg-white rounded-2xl shadow-sm p-5 flex flex-col gap-3" style="border-top:3px solid ${s.c}">
            <div class="w-11 h-11 rounded-xl flex items-center justify-center text-2xl" style="background:${s.c}1f">${s.ic}</div>
            <div>
              <div class="text-base font-bold text-slate-800">${_esc(s.titulo)}</div>
              <div class="text-[13px] text-slate-500 mt-1 leading-snug">${_esc(s.desc)}</div>
            </div>
            <div class="border-t border-slate-100 pt-2 flex flex-col gap-1">
              ${s.itens.map(function(it){ return `<button onclick="${it.act}" class="text-left text-[13px] font-medium text-slate-700 hover:text-slate-900 py-1 flex items-center gap-1.5 group"><span style="color:${s.c}" class="font-bold group-hover:translate-x-0.5 transition-transform">→</span>${_esc(it.t)}</button>`; }).join('')}
            </div>
          </div>`; }).join('')}
      </div>
    </div>`;
  }

  // ======================= FINANCEIRO / PRODUTIVIDADE =======================
  // mês anterior a partir de 'YYYY-MM'
  function _mesAnterior(m){
    try { var d = new Date(m + '-01T00:00:00'); d.setMonth(d.getMonth()-1); return d.toISOString().slice(0,7); } catch(e){ return ''; }
  }
  // delta (comparação): retorna seta/cor/texto. sobeBom=true → verde quando sobe.
  function _delta(atual, ant, sobeBom){
    if (ant == null || ant === 0) return {arr:'', txt:'sem base', cls:'text-slate-400'};
    var p = Math.round((atual-ant)/ant*100);
    if (p === 0) return {arr:'=', txt:'estável', cls:'text-slate-400'};
    var up = p > 0;
    var bom = (sobeBom===false) ? !up : up;
    return { arr: up?'▲':'▼', txt: (up?'+':'')+p+'%', cls: bom?'text-emerald-600':'text-rose-500' };
  }

  function _renderFinanceiro(){
    if(!window.ehAdminGestao()) return _renderHub();
    var meses = (typeof _gamMeses==='function') ? _gamMeses() : [];
    var mesSel = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    // MULTI-MÊS: se 2+ meses selecionados, consolida o período
    var selN = (window._gestaoMesesSel||[]).slice().sort();
    var multi = selN.length >= 2;
    var mLbl = function(m){ return (typeof _gamMesLabel==='function') ? _gamMesLabel(m) : m; };
    var periodoLabel = multi ? (mLbl(selN[0])+' … '+mLbl(selN[selN.length-1])+' ('+selN.length+' meses)') : mLbl(mesSel);
    var mesAnt = _mesAnterior(mesSel);
    var nomeMesAnt = mLbl(mesAnt);
    var doMes = multi ? window._gestaoAgregaMeses(selN) : window._gestaoAgrega(mesSel);
    var doAnt = multi ? [] : window._gestaoAgrega(mesAnt); // comparação só faz sentido em 1 mês
    var antMap = {}; doAnt.forEach(function(r){ antMap[r.chave]=r; });
    var acumulado = window._gestaoAgrega(null);
    var accMap = {}; acumulado.forEach(function(r){ accMap[r.chave]=r; });
    // paleta compartilhada (rosca do gráfico ↔ card de tipos ↔ chips): mesma linguagem de cor
    var PAL_TIPO = ['#2B3A8C','#F5C518','#10B981','#8B5CF6','#F59E0B','#0891B2','#EC4899','#64748B'];
    // quebra por TIPO de alvará no período ativo (feature nova). Ignora tipos sem valor (R$ 0).
    var porTipo = (window._gestaoAgregaTipos ? window._gestaoAgregaTipos(multi?selN:null, mesSel) : [])
      .filter(function(t){ return t.valor > 0; });

    // agregados do mês e do mês anterior
    var totalMes = doMes.reduce(function(s,r){ return s+r.valor; }, 0);
    var qtdMes = doMes.reduce(function(s,r){ return s+r.qtd; }, 0);
    var totalAnt = doAnt.reduce(function(s,r){ return s+r.valor; }, 0);
    var qtdAnt = doAnt.reduce(function(s,r){ return s+r.qtd; }, 0);
    // pago: em multi-mês, soma o valor pago por (pessoa × cada mês do período)
    var totalPago = multi
      ? selN.reduce(function(s,m){ return s + window._gestaoAgrega(m).filter(function(r){ return window._gestaoPago(r.chave,m); }).reduce(function(ss,r){ return ss+r.valor; },0); }, 0)
      : doMes.filter(function(r){ return window._gestaoPago(r.chave,mesSel); }).reduce(function(s,r){ return s+r.valor; }, 0);
    var totalAPagar = totalMes - totalPago;
    var pctPago = totalMes>0 ? Math.round(totalPago/totalMes*100) : 0;
    var ticket = qtdMes>0 ? totalMes/qtdMes : 0;
    var ticketAnt = qtdAnt>0 ? totalAnt/qtdAnt : 0;
    var mediaPessoa = doMes.length>0 ? totalMes/doMes.length : 0;
    var mediaAnt = doAnt.length>0 ? totalAnt/doAnt.length : 0;
    var top = doMes[0]; // destaque (já ordenado por valor)
    var topPct = (top && totalMes>0) ? Math.round(top.valor/totalMes*100) : 0;
    // posição do top no mês anterior (pra "subiu N posições")
    var topSubiu = '';
    if (top) {
      var posAnt = doAnt.findIndex(function(r){ return r.chave===top.chave; });
      if (posAnt > 0) topSubiu = '▲ subiu '+posAnt+' posição'+(posAnt>1?'es':'');
      else if (posAnt === 0) topSubiu = 'manteve a liderança';
    }

    // helper de card KPI com comparação
    function kpi(label, valor, delta, sub, destaque){
      return '<div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 '+(destaque?'border-l-4 border-l-amber-400':'')+'">'
        + '<div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">'+label+'</div>'
        + '<div class="text-2xl font-bold '+(destaque?'text-amber-600':'text-slate-800')+' mt-1 leading-none">'+valor+'</div>'
        + (delta ? '<div class="text-[11px] mt-1.5 '+delta.cls+' font-semibold">'+delta.arr+' '+delta.txt+' <span class="text-slate-400 font-normal">vs '+_esc(nomeMesAnt)+'</span></div>'
                 : (sub ? '<div class="text-[11px] mt-1.5 text-slate-400">'+sub+'</div>' : ''))
        + '</div>';
    }
    // card HERÓI "A pagar": número em amber + barra de progresso da folha (X% pago)
    function kpiPagar(aPagar, pago, total, pct){
      return '<div class="bg-white p-4 rounded-xl shadow-sm border border-slate-200 border-l-4 border-l-amber-400">'
        + '<div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">A pagar</div>'
        + '<div class="text-2xl font-bold text-amber-600 mt-1 leading-none">'+_fmt(aPagar)+'</div>'
        + '<div class="mt-2 flex items-center gap-2">'
        +   '<div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden"><div class="h-full bg-emerald-500" style="width:'+pct+'%"></div></div>'
        +   '<span class="text-[10px] font-bold text-emerald-600 shrink-0">'+pct+'% pago</span>'
        + '</div>'
        + '<div class="text-[10px] text-slate-400 mt-1">de '+_fmt(total)+' no total</div>'
        + '</div>';
    }

    return `
    <div class="p-6 max-w-6xl mx-auto space-y-5">
      <button onclick="window._gestaoView='hub';render()" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600">← Painel de Gestão</button>
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">💰 Financeiro / Produtividade</h1>
          <p class="text-sm text-slate-500 mt-0.5">Quanto a equipe produziu e quanto há a pagar — por tipo de alvará.</p>
        </div>
        <button onclick="window._gestaoExportCSV()" class="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100 shrink-0">⬇️ CSV</button>
      </div>

      <!-- Seletor de MESES (multi): clique pra somar mais de um mês no período -->
      <div class="bg-white rounded-xl shadow-sm p-3 flex flex-wrap items-center gap-2">
        <span class="text-[11px] font-bold text-slate-500 uppercase tracking-wide mr-1">Período:</span>
        ${meses.slice(0,12).map(function(m){
          var lbl = (typeof _gamMesLabel==='function') ? _gamMesLabel(m) : m;
          var on = multi ? (selN.indexOf(m)>=0) : (m===mesSel);
          return '<button onclick="window._gestaoToggleMes(\''+_escJs(m)+'\')" class="px-3 py-1.5 rounded-lg text-xs font-semibold transition '+(on?'bg-blue-600 text-white shadow-sm':'bg-slate-100 text-slate-600 hover:bg-slate-200')+'">'+(on&&multi?'✓ ':'')+_esc(lbl)+'</button>';
        }).join('')}
        ${multi ? '<button onclick="window._gestaoMesesSel=[];render()" class="px-2.5 py-1.5 rounded-lg text-xs font-semibold text-rose-600 bg-rose-50 hover:bg-rose-100">✕ limpar seleção</button>' : '<span class="text-[11px] text-slate-400 ml-1">clique em 2+ meses pra consolidar o período</span>'}
      </div>

      <!-- KPIs (5 cards; "A pagar" é o herói — com barra de progresso da folha) -->
      <div class="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3">
        ${kpi(multi?'Total do período':'Total produzido', _fmt(totalMes), multi?null:_delta(totalMes, totalAnt, true), multi?_esc(periodoLabel):null)}
        ${kpiPagar(totalAPagar, totalPago, totalMes, pctPago)}
        ${kpi('Já pago', _fmt(totalPago), null, pctPago+'% da folha')}
        ${kpi('Alvarás', String(qtdMes), multi?null:_delta(qtdMes, qtdAnt, true), multi?'no período':null)}
        ${kpi('Média/pessoa', _fmt(mediaPessoa), multi?null:_delta(mediaPessoa, mediaAnt, true), multi?'no período':null)}
      </div>

      ${doMes.length===0 ? `<div class="bg-white rounded-xl shadow-sm p-12 text-center"><div class="text-4xl mb-2">🗓️</div><div class="font-bold text-slate-700">Nenhuma produtividade em ${_esc(periodoLabel)}</div><div class="text-sm text-slate-500 mt-1">Escolha outro período acima.</div></div>` : `

      <!-- Fila executiva: Destaque + Quebra por TIPO (lado a lado) -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-2xl shadow-sm p-5 flex flex-col justify-center text-white relative overflow-hidden" style="background:linear-gradient(135deg,#2B3A8C,#141A42)">
          <div class="text-xs font-semibold uppercase tracking-wide" style="color:#F5C518">🏆 Destaque ${multi?'do período':'de '+_esc(mLbl(mesSel))}</div>
          <div class="flex items-center gap-3 mt-3">
            <div class="w-14 h-14 rounded-full bg-white/15 ring-2 ring-white/30 flex items-center justify-center text-xl font-bold shrink-0">${top.foto?('<img src="'+_escUrl(top.foto)+'" class="w-full h-full rounded-full" style="object-fit:cover">'):_esc(((top.nome||'?')[0]||'?').toUpperCase())}</div>
            <div class="min-w-0">
              <div class="text-lg font-bold truncate">${_esc(top.nome||'—')}</div>
              <div class="text-sm text-blue-100">${_fmt(top.valor)} · ${top.qtd} alvarás</div>
              <div class="text-xs mt-0.5" style="color:#F5C518">${topSubiu?topSubiu+' · ':''}${topPct}% da produção</div>
            </div>
          </div>
          ${(typeof window.zuzu==='function') ? '<div class="absolute -bottom-2 -right-2 opacity-90 pointer-events-none">'+window.zuzu({pose:'trofeu',anim:'sway',size:70,alt:'Zuzu'})+'</div>' : ''}
        </div>
        ${(function(){
          if (!porTipo.length) return '<div class="bg-white rounded-2xl shadow-sm p-5 flex items-center justify-center text-sm text-slate-400">Sem tipos no período</div>';
          var totT = porTipo.reduce(function(s,t){ return s+t.valor; }, 0) || 1;
          var top5 = porTipo.slice(0,5);
          var resto = porTipo.slice(5);
          if (resto.length){ var rv=resto.reduce(function(s,t){return s+t.valor;},0), rq=resto.reduce(function(s,t){return s+t.qtd;},0); top5.push({tipo:'Outros ('+resto.length+')', valor:rv, qtd:rq, _outros:true}); }
          var barra = top5.map(function(t,i){ var w=Math.round(t.valor/totT*100); return '<div title="'+_esc(t.tipo)+': '+_fmt(t.valor)+'" style="width:'+w+'%;background:'+PAL_TIPO[i%PAL_TIPO.length]+'"></div>'; }).join('');
          var linhas = top5.map(function(t,i){ var pc=Math.round(t.valor/totT*100);
            return '<div class="flex items-center gap-2 text-[13px] py-1">'
              + '<span class="w-2.5 h-2.5 rounded-full shrink-0" style="background:'+PAL_TIPO[i%PAL_TIPO.length]+'"></span>'
              + '<span class="font-medium text-slate-700 truncate flex-1">'+_esc(t.tipo)+'</span>'
              + '<span class="text-slate-400 tabular-nums w-8 text-right">'+t.qtd+'</span>'
              + '<span class="font-bold text-slate-800 tabular-nums w-20 text-right">'+_fmt(t.valor)+'</span>'
              + '<span class="text-slate-400 tabular-nums w-9 text-right">'+pc+'%</span>'
              + '</div>';
          }).join('');
          return '<div class="bg-white rounded-2xl shadow-sm p-5">'
            + '<div class="flex items-center justify-between mb-3"><h3 class="text-base font-bold text-slate-800">🏷️ Por tipo de alvará</h3><span class="text-[11px] text-slate-400">'+porTipo.length+' tipos</span></div>'
            + '<div class="flex h-3 rounded-full overflow-hidden mb-3 bg-slate-100">'+barra+'</div>'
            + linhas
            + '</div>';
        })()}
      </div>

      <!-- Gráfico único (largura total) com seletor de visão -->
      <div class="bg-white rounded-2xl shadow-sm p-4">
        <div class="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <h3 class="text-base font-bold text-slate-800">📊 Visão gráfica</h3>
          <div class="flex gap-1 flex-wrap">
            ${[{v:'valor_mes',t:'Evolução'},{v:'valor_colab',t:'Por colaborador'},{v:'por_tipo',t:'Por tipo'},{v:'comparar_meses',t:'Comparar meses'}].map(function(o){
              var on=(window._gestaoChartView||'valor_mes')===o.v;
              return '<button onclick="window._gestaoChartView=\''+o.v+'\';render()" class="px-3 py-1.5 rounded-lg text-xs font-semibold '+(on?'bg-blue-600 text-white':'bg-slate-100 text-slate-600 hover:bg-slate-200')+'">'+o.t+'</button>';
            }).join('')}
          </div>
        </div>
        <div style="position:relative;height:280px"><canvas id="gestao-chart"></canvas></div>
      </div>

      <!-- Tabela — a folha -->
      <div class="bg-white rounded-2xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th class="text-left px-4 py-3 font-semibold">Colaborador</th><th class="text-center px-3 py-3 font-semibold">Alvarás</th><th class="text-right px-3 py-3 font-semibold">${multi?'Valor do período':'Valor do mês'}</th><th class="text-center px-3 py-3 font-semibold">${multi?'—':'vs '+_esc(nomeMesAnt)}</th><th class="text-right px-3 py-3 font-semibold">A pagar</th><th class="text-center px-4 py-3 font-semibold">Pagamento</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${doMes.map(function(r){
                var ck = _escJs(r.chave);
                var detMes = multi ? selN[selN.length-1] : mesSel; // no multi, detalhe abre o mês mais recente
                var vd = window._gestaoVerDetalhe ? "window._gestaoVerDetalhe('"+ck+"','"+_escJs(detMes)+"','"+_escJs(r.nome||'')+"')" : "";
                var dr = multi ? null : _delta(r.valor, (antMap[r.chave]||{}).valor, true);
                // pago: single = toggle do mês; multi = quantos dos meses já pagos
                var pagoCell, aPagarCell;
                if (multi) {
                  var pagosN = selN.filter(function(m){ return window._gestaoPago(r.chave, m); }).length;
                  // valor a pagar no período = soma dos meses ainda não pagos dessa pessoa
                  var devido = selN.filter(function(m){ return !window._gestaoPago(r.chave, m); }).reduce(function(s,m){
                    var rm = window._gestaoAgrega(m).filter(function(x){ return x.chave===r.chave; })[0]; return s + (rm?rm.valor:0);
                  }, 0);
                  aPagarCell = devido>0 ? '<span class="font-bold text-rose-600 tabular-nums">'+_fmt(devido)+'</span>' : '<span class="text-emerald-600 font-semibold">✓ quitado</span>';
                  pagoCell = '<span class="px-2.5 py-1 rounded-lg text-xs font-bold '+(pagosN===selN.length?'bg-emerald-100 text-emerald-700':(pagosN>0?'bg-amber-100 text-amber-700':'bg-rose-50 text-rose-600'))+'" title="pago em '+pagosN+' de '+selN.length+' meses">'+pagosN+'/'+selN.length+'</span>';
                } else {
                  var pago = window._gestaoPago(r.chave, mesSel);
                  aPagarCell = pago ? '<span class="text-emerald-600 font-semibold">✓ quitado</span>' : '<span class="font-bold text-rose-600 tabular-nums">'+_fmt(r.valor)+'</span>';
                  pagoCell = '<button onclick="event.stopPropagation();window._gestaoMarcarPago(\''+ck+'\',\''+_escJs(mesSel)+'\','+(pago?'false':'true')+')" class="px-3 py-1.5 rounded-lg text-xs font-bold '+(pago?'bg-emerald-100 text-emerald-700 hover:bg-emerald-200':'bg-rose-50 text-rose-600 hover:bg-rose-100')+'">'+(pago?'✓ Pago':'A pagar')+'</button>';
                }
                return `<tr class="hover:bg-blue-50 cursor-pointer" onclick="${vd}" title="Clique para ver os alvarás">
                  <td class="px-4 py-3"><div class="font-semibold text-blue-700 flex items-center gap-1.5">${_esc(r.nome||'—')} <span class="text-[10px] text-slate-400 font-normal">🔍</span></div><div class="text-[11px] text-slate-400">${_esc(r.email||'')}</div></td>
                  <td class="text-center px-3 py-3 text-slate-600">${r.qtd}</td>
                  <td class="text-right px-3 py-3 font-bold text-slate-800">${_fmt(r.valor)}</td>
                  <td class="text-center px-3 py-3 text-xs font-semibold ${dr?dr.cls:'text-slate-300'}">${dr?(dr.arr+' '+dr.txt):'—'}</td>
                  <td class="text-right px-3 py-3">${aPagarCell}</td>
                  <td class="text-center px-4 py-3">${pagoCell}</td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-50 font-bold"><tr><td class="px-4 py-3 text-slate-700">Total</td><td class="text-center px-3 py-3 text-slate-600">${qtdMes}</td><td class="text-right px-3 py-3 text-slate-800">${_fmt(totalMes)}</td><td class="text-center px-3 py-3 text-[10px] text-emerald-600">${_fmt(totalPago)} pago</td><td class="text-right px-3 py-3 text-rose-600">${_fmt(totalAPagar)}</td><td></td></tr></tfoot>
          </table>
        </div>
      </div>
      <p class="text-[11px] text-slate-400">Valores pelo tipo de cada alvará (tabela em Valores). Clique numa linha pra ver os alvarás e o acumulado. "Pago" é controle manual do admin.</p>
      `}
    </div>`;
  }

  // ---- dados do gráfico por modo de visualização ----
  window._gestaoChartView = window._gestaoChartView || 'valor_mes';
  function _gestaoChartData(){
    var view = window._gestaoChartView;
    var mesSel = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    var COR = '#2B3A8C', COR2 = '#F5C518', COR3 = '#10b981';
    if (view === 'valor_colab' || view === 'alv_colab') {
      // respeita o período ativo (1 mês OU vários meses consolidados). Barras HORIZONTAIS (nomes cabem melhor).
      var selMulti = (window._gestaoMesesSel||[]);
      var multiC = selMulti.length >= 2;
      var r = multiC ? window._gestaoAgregaMeses(selMulti) : window._gestaoAgrega(mesSel);
      var rotulo = multiC ? (selMulti.length+' meses') : mesSel;
      return { type:'bar', horizontal:true,
        labels: r.map(function(x){ return (x.nome||'').split(' ')[0] || x.nome; }),
        data: r.map(function(x){ return view==='valor_colab' ? x.valor : x.qtd; }),
        label: (view==='valor_colab' ? 'Valor (R$) — ' : 'Alvarás — ') + rotulo,
        cor: COR, money: view==='valor_colab',
        meta: r.map(function(x){ return {kind:'colab', chave:x.chave, nome:x.nome, mes: multiC?null:mesSel}; }) };
    }
    if (view === 'por_tipo') {
      // ROSCA: composição do faturamento por tipo de alvará no período ativo
      var selT = (window._gestaoMesesSel||[]);
      var multiT = selT.length >= 2;
      var tipos = (window._gestaoAgregaTipos ? window._gestaoAgregaTipos(multiT?selT:null, mesSel) : [])
        .filter(function(t){ return t.valor > 0; }); // tipos sem valor (R$ 0) só poluem a legenda
      var PAL = ['#2B3A8C','#F5C518','#10B981','#8B5CF6','#F59E0B','#0891B2','#EC4899','#64748B'];
      return { type:'doughnut', money:true,
        labels: tipos.map(function(t){ return t.tipo; }),
        data: tipos.map(function(t){ return t.valor; }),
        cores: tipos.map(function(t,i){ return PAL[i%PAL.length]; }),
        totalRosca: tipos.reduce(function(s,t){ return s+t.valor; }, 0),
        metaTipos: tipos };
    }
    if (view === 'acumulado_colab') {
      var a = window._gestaoAgrega(null);
      return { type:'bar',
        labels: a.map(function(x){ return (x.nome||'').split(' ')[0] || x.nome; }),
        data: a.map(function(x){ return x.valor; }),
        label: 'Acumulado total (R$)', cor: COR2, money: true,
        meta: a.map(function(x){ return {kind:'colab', chave:x.chave, nome:x.nome, mes:null}; }) };
    }
    if (view === 'comparar_meses') {
      // barras agrupadas: cada colaborador tem 1 barra por mês (compara meses lado a lado)
      var todosMeses = ((typeof _gamMeses==='function') ? _gamMeses() : []).slice().sort();
      var mesesCmp = todosMeses.slice(-(window._gestaoNMeses||3)); // últimos N meses (padrão 3)
      // universo de colaboradores (acumulado) pra manter a mesma ordem/eixo
      var base = window._gestaoAgrega(null);
      var chaves = base.map(function(x){ return {chave:x.chave, nome:(x.nome||'').split(' ')[0]||x.nome}; });
      var paletaMes = ['#2B3A8C','#F5C518','#10b981','#8B5CF6','#f59e0b','#0891b2'];
      var mLbl = function(m){ return (typeof _gamMesLabel==='function') ? _gamMesLabel(m).split(' ')[0] : m; }; // "Junho"
      var datasets = mesesCmp.map(function(m, mi){
        var rr = window._gestaoAgrega(m); var byKey={}; rr.forEach(function(x){ byKey[x.chave]=x.valor; });
        return { label:mLbl(m), data: chaves.map(function(c){ return byKey[c.chave]||0; }),
                 backgroundColor: paletaMes[mi%paletaMes.length], borderRadius:5 };
      });
      return { multi:true, type:'bar', money:true,
        labels: chaves.map(function(c){ return c.nome; }),
        datasets: datasets, mesesCmp: mesesCmp };
    }
    // evolução: últimos 6 meses (barras, mês selecionado destacado)
    var meses = ((typeof _gamMeses==='function') ? _gamMeses().slice().sort() : []).slice(-6);
    var mLabel = function(m){ return (typeof _gamMesLabel==='function') ? _gamMesLabel(m).slice(0,3)+'/'+m.slice(2,4) : m; };
    var dataM = meses.map(function(m){
      var rr = window._gestaoAgrega(m);
      return rr.reduce(function(s,x){return s+x.valor;},0);
    });
    var corBar = meses.map(function(m){ return m===mesSel ? '#2B3A8C' : '#c7ccdf'; }); // destaca o mês atual
    return { type:'bar', labels: meses.map(mLabel), data: dataM,
      label: 'Valor total (R$)/mês', cor: corBar, money: true,
      meta: meses.map(function(m){ return {kind:'mes', mes:m}; }) };
  }

  window._gestaoChart = window._gestaoChart || null;
  window._gestaoDesenhaChart = function(){
    var ctx = document.getElementById('gestao-chart');
    if (!ctx || typeof Chart === 'undefined') return;
    if (window._gestaoChart && window._gestaoChart.destroy) window._gestaoChart.destroy();
    var d = _gestaoChartData();
    var money = d.money;
    var fmtBRL = function(v){ return 'R$ ' + (Number(v)||0).toFixed(2).replace('.',','); };
    var fmtLabel = function(v){ return money ? ('R$ '+(Number(v)||0).toFixed(0)) : String(v); };
    // plugin: valores SEMPRE visíveis (acima da barra vertical / à direita da horizontal)
    var _horiz = !!d.horizontal;
    var _valLabels = {
      id:'gestaoValLabels',
      afterDatasetsDraw: function(chart){
        var cx = chart.ctx; var ds = chart.data.datasets[0];
        var meta = chart.getDatasetMeta(0); if (meta.hidden) return;
        cx.save(); cx.font = '700 11px -apple-system,"Segoe UI",sans-serif';
        cx.fillStyle = '#1e293b';
        meta.data.forEach(function(el,i){
          var v = ds.data[i]; if (v==null) return;
          if (_horiz){ cx.textAlign='left'; cx.textBaseline='middle'; cx.fillText(fmtLabel(v), el.x + 6, el.y); }
          else { cx.textAlign='center'; cx.textBaseline='bottom'; cx.fillText(fmtLabel(v), el.x, el.y - 6); }
        });
        cx.restore();
      }
    };
    // ---- modo ROSCA (por tipo de alvará) ----
    if (d.type === 'doughnut') {
      if (!d.data.length) { return; }
      var totR = d.totalRosca || 0;
      // plugin: total no centro + % / valor SOBRE cada fatia (indicadores visíveis sem hover)
      var _centro = {
        id:'gestaoCentroRosca',
        afterDatasetsDraw: function(chart){
          var cx = chart.ctx; var area = chart.chartArea;
          var mx = (area.left+area.right)/2, my = (area.top+area.bottom)/2;
          // 1) rótulo em cada fatia (percentual dentro do anel, valor logo fora)
          var meta = chart.getDatasetMeta(0); var ds = chart.data.datasets[0];
          cx.save(); cx.textAlign='center'; cx.textBaseline='middle';
          meta.data.forEach(function(el,i){
            var v = ds.data[i]; if (v==null || v===0) return;
            var pc = totR>0 ? Math.round(v/totR*100) : 0;
            if (pc < 4) return; // fatia minúscula: só na legenda/tooltip, senão sobrepõe
            var ang = (el.startAngle + el.endAngle)/2;
            var rMid = (el.innerRadius + el.outerRadius)/2;
            var px = el.x + Math.cos(ang)*rMid, py = el.y + Math.sin(ang)*rMid;
            // % dentro da fatia (texto branco com leve sombra pra ler em qualquer cor)
            cx.font='800 12px -apple-system,"Segoe UI",sans-serif';
            cx.fillStyle='rgba(0,0,0,.25)'; cx.fillText(pc+'%', px+0.6, py+0.6);
            cx.fillStyle='#fff'; cx.fillText(pc+'%', px, py);
            // valor R$ logo FORA da fatia
            var rOut = el.outerRadius + 14;
            var ox = el.x + Math.cos(ang)*rOut, oy = el.y + Math.sin(ang)*rOut;
            cx.font='700 10px -apple-system,"Segoe UI",sans-serif'; cx.fillStyle='#475569';
            cx.fillText('R$ '+Number(v).toFixed(0), ox, oy);
          });
          // 2) total no centro
          cx.textAlign='center'; cx.textBaseline='middle';
          cx.fillStyle='#94a3b8'; cx.font='600 11px -apple-system,"Segoe UI",sans-serif';
          cx.fillText('Total', mx, my-12);
          cx.fillStyle='#1e293b'; cx.font='800 17px -apple-system,"Segoe UI",sans-serif';
          cx.fillText(fmtBRL(totR), mx, my+6);
          cx.restore();
        }
      };
      window._gestaoChart = new Chart(ctx, {
        type:'doughnut',
        data:{ labels:d.labels, datasets:[{ data:d.data, backgroundColor:d.cores, borderColor:'#fff', borderWidth:2, hoverOffset:6 }] },
        plugins:[_centro],
        options:{
          responsive:true, maintainAspectRatio:false, cutout:'62%',
          layout:{ padding:{ top:16, bottom:16, left:16 } }, // espaço pro valor R$ fora das fatias
          plugins:{
            legend:{ display:true, position:'right', labels:{ font:{size:11}, boxWidth:12, usePointStyle:true, padding:10 } },
            tooltip:{ callbacks:{ label:function(c){ var v=c.parsed; var pc=totR>0?Math.round(v/totR*100):0; return ' '+c.label+': '+fmtBRL(v)+' ('+pc+'%)'; } } }
          }
        }
      });
      return;
    }
    // ---- modo MULTI-MÊS (barras agrupadas: colaborador × mês) ----
    if (d.multi) {
      // valores acima de CADA barra de CADA dataset (pula zeros pra não poluir)
      var _valLabelsMulti = {
        id:'gestaoValLabelsMulti',
        afterDatasetsDraw: function(chart){
          var cx = chart.ctx;
          cx.save(); cx.font='700 10px -apple-system,"Segoe UI",sans-serif'; cx.textAlign='center'; cx.textBaseline='bottom';
          chart.data.datasets.forEach(function(ds, di){
            var meta = chart.getDatasetMeta(di); if (meta.hidden) return;
            cx.fillStyle = ds.backgroundColor || '#1e293b';
            meta.data.forEach(function(el,i){
              var v = ds.data[i]; if (v==null || v===0) return; // não rotula barra zerada
              cx.fillText('R$ '+Number(v).toFixed(0), el.x, el.y - 4);
            });
          });
          cx.restore();
        }
      };
      window._gestaoChart = new Chart(ctx, {
        type: 'bar',
        data: { labels: d.labels, datasets: d.datasets },
        plugins: [_valLabelsMulti],
        options: {
          responsive:true, maintainAspectRatio:false,
          layout:{ padding:{ top: 18 } }, // espaço pros valores acima das barras
          plugins:{
            legend:{ display:true, position:'top', labels:{font:{size:11}, boxWidth:12, usePointStyle:true} },
            tooltip:{ callbacks:{ label:function(c){ return c.dataset.label+': '+fmtBRL(c.parsed.y); } } }
          },
          scales:{ y:{ beginAtZero:true, ticks:{ callback:function(v){ return 'R$ '+v; }, font:{size:11} }, grid:{color:'#eef1f7'} },
                   x:{ ticks:{font:{size:11}}, grid:{display:false} } }
        }
      });
      return;
    }
    // ---- modo simples (1 dataset) ----
    window._gestaoChart = new Chart(ctx, {
      type: d.type,
      data: { labels: d.labels, datasets: [{
        label: d.label, data: d.data,
        backgroundColor: d.type==='line' ? 'rgba(43,58,140,.08)' : d.cor,
        borderColor: d.cor, borderWidth: d.type==='line'?2:0, borderRadius: d.type==='bar'?6:0,
        fill: d.type==='line', tension:.3, pointBackgroundColor: d.cor, pointRadius: d.type==='line'?4:0,
        hoverBackgroundColor: d.type==='bar' ? '#3b4dbf' : undefined
      }]},
      plugins: [_valLabels],
      options: (function(){
        var valAxis = { beginAtZero:true, ticks:{ callback:function(v){ return money?('R$ '+v):v; }, font:{size:11} }, grid:{color:'#eef1f7'} };
        var catAxis = { ticks:{font:{size:11}}, grid:{display:false} };
        return {
          responsive:true, maintainAspectRatio:false,
          indexAxis: _horiz ? 'y' : 'x',
          layout:{ padding: _horiz ? { right: 54 } : { top: 22 } }, // espaço pro valor (direita se horizontal, topo se vertical)
          onClick: function(evt, els){
            if (!els || !els.length) return;
            var idx = els[0].index;
            var m = d.meta && d.meta[idx];
            if (!m) return;
            if (m.kind === 'colab' && typeof window._gestaoVerDetalhe === 'function') {
              window._gestaoVerDetalhe(m.chave, m.mes, m.nome);
            } else if (m.kind === 'mes') {
              window._gestaoMes = m.mes; window._gestaoChartView = 'valor_colab'; render();
            }
          },
          onHover: function(e, els){ if(e.native&&e.native.target) e.native.target.style.cursor = els.length ? 'pointer':'default'; },
          plugins:{ legend:{display:false},
            tooltip:{ callbacks:{
              label:function(c){ var v=(c.parsed.x!=null&&_horiz)?c.parsed.x:(c.parsed.y!=null?c.parsed.y:c.parsed); return money?fmtBRL(v):(v+' alvará(s)'); },
              afterLabel:function(){ return d.meta&&d.meta[0]&&d.meta[0].kind==='colab' ? '🔍 clique pra ver os alvarás' : '🔍 clique pra ver o mês'; }
            } } },
          scales: _horiz ? { x: valAxis, y: catAxis } : { y: valAxis, x: catAxis }
        };
      })()
    });
  };

  // ver os alvarás que compõem o valor de um colaborador (reusa o modal da Premiação)
  window._gestaoVerDetalhe = function(chave, mes, nome){
    if (typeof window._gamAbrirDetalhe === 'function') { window._gamAbrirDetalhe(chave, mes, nome); return; }
    if (typeof _gamAbrirDetalhe === 'function') { _gamAbrirDetalhe(chave, mes, nome); return; }
    alert('Detalhe indisponível.');
  };

  window._gestaoExportCSV = function(){
    var mesSel = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    var doMes = window._gestaoAgrega(mesSel);
    var acc = {}; window._gestaoAgrega(null).forEach(function(r){ acc[r.chave]=r; });
    var linhas = [['Colaborador','Email','Alvaras no mes','Valor do mes','Acumulado total','Status']];
    doMes.forEach(function(r){
      var a = acc[r.chave]||{valor:0};
      linhas.push([r.nome||'', r.email||'', r.qtd, (r.valor||0).toFixed(2).replace('.',','), (a.valor||0).toFixed(2).replace('.',','), window._gestaoPago(r.chave,mesSel)?'Pago':'A pagar']);
    });
    var csv = linhas.map(function(row){ return row.map(function(c){ return '"'+String(c).replace(/"/g,'""')+'"'; }).join(';'); }).join('\n');
    var blob = new Blob(["﻿"+csv], {type:'text/csv;charset=utf-8;'});
    var url = URL.createObjectURL(blob);
    var link = document.createElement('a');
    link.href = url; link.download = 'produtividade-'+mesSel+'.csv';
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    setTimeout(function(){ URL.revokeObjectURL(url); }, 1000);
  };

  // ======================= USUÁRIOS (melhorado) =======================
  window._gestaoUserBusca = window._gestaoUserBusca || '';
  function _renderUsuariosPainel(){
    if(!window.ehAdminGestao()) return _renderHub();
    var us = (typeof state!=='undefined' && Array.isArray(state.usuarios)) ? state.usuarios : [];
    // produtividade acumulada por usuário (reusa o motor do financeiro)
    var acc = {}; try { window._gestaoAgrega(null).forEach(function(r){ acc[(r.email||r.nome||'').toLowerCase()] = r; }); } catch(e){}
    var q = (window._gestaoUserBusca||'').trim().toLowerCase();
    var lista = us.filter(function(u){ return u && (!q || ((u.nome||'')+' '+(u.email||'')+' '+(u.cargo||'')).toLowerCase().indexOf(q)>=0); });
    var admins = lista.filter(function(u){ return /administrador/i.test(u.cargo||''); });
    var equipe = lista.filter(function(u){ return !/administrador/i.test(u.cargo||''); });
    var ativos = us.filter(function(u){ return u.ativo!==false; }).length;
    var inativos = us.length - ativos;

    function card(u){
      var key = (u.email||u.nome||'').toLowerCase();
      var prod = acc[key];
      var ini = _esc((u.nome&&u.nome[0])||'?').toUpperCase();
      var foto = u.foto ? '<img src="'+_escUrl(u.foto)+'" class="w-full h-full" style="object-fit:cover">' : ini;
      var inativo = u.ativo===false;
      return `<div class="bg-white rounded-xl shadow-sm p-4 flex flex-col ${inativo?'opacity-60':''}">
        <div class="flex items-center gap-3 mb-2">
          <div class="w-11 h-11 rounded-full overflow-hidden bg-blue-100 text-blue-700 flex items-center justify-center font-bold shrink-0">${foto}</div>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-slate-800 truncate">${_esc(u.nome||'—')}</div>
            <div class="text-[11px] text-slate-500 truncate">${_esc(u.email||'')}</div>
          </div>
          <span class="shrink-0 px-2 py-0.5 rounded-full text-[10px] font-bold ${inativo?'bg-slate-100 text-slate-500':'bg-emerald-100 text-emerald-700'}">${inativo?'Inativo':'Ativo'}</span>
        </div>
        <div class="flex items-center gap-2 mb-2">
          <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded ${/administrador/i.test(u.cargo||'')?'bg-purple-100 text-purple-700':'bg-blue-50 text-blue-600'}">${_esc(u.cargo||'—')}</span>
        </div>
        ${prod ? `<div class="flex items-center gap-3 text-[12px] text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mb-2">
            <span>📊 <b>${prod.qtd}</b> concluídos</span>
            <span class="ml-auto font-bold text-emerald-600">${_fmt(prod.valor)}</span>
          </div>` : `<div class="text-[11px] text-slate-400 bg-slate-50 rounded-lg px-3 py-2 mb-2">Sem produtividade registrada</div>`}
        <div class="flex gap-1 mt-auto pt-2 border-t border-slate-100">
          <button onclick="openModalUsuario('${_escJs(u.id)}')" class="flex-1 text-xs py-1.5 rounded text-blue-600 hover:bg-blue-50 font-medium">✏️ Editar</button>
          <button onclick="excluirUsuario('${_escJs(u.id)}')" class="flex-1 text-xs py-1.5 rounded text-red-600 hover:bg-red-50 font-medium">🗑️ Excluir</button>
        </div>
      </div>`;
    }

    return `
    <div class="p-6">
      <button onclick="window._gestaoView='hub';render()" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Painel de Gestão</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">👥 Usuários</h1>
          <p class="text-sm text-slate-500 mt-0.5">${us.length} cadastrados · ${ativos} ativos${inativos?' · '+inativos+' inativos':''}</p>
        </div>
        <button onclick="openModalUsuario(null)" class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-semibold text-sm">+ Novo usuário</button>
      </div>
      <div class="mb-5"><input id="gestao-user-busca" type="text" value="${_esc(window._gestaoUserBusca||'')}" placeholder="🔎 Buscar por nome, e-mail ou cargo..." class="w-full max-w-md px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500"></div>
      ${admins.length ? `<div class="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Administradores</div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">${admins.map(card).join('')}</div>` : ''}
      <div class="mb-2 text-[11px] font-bold text-slate-500 uppercase tracking-wider">Equipe (${equipe.length})</div>
      ${equipe.length ? `<div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">${equipe.map(card).join('')}</div>`
        : `<div class="bg-white rounded-xl shadow-sm p-8 text-center text-slate-400 text-sm">${q?'Ninguém encontrado no filtro.':'Nenhum membro na equipe ainda.'}</div>`}
      <p class="text-[11px] text-slate-400 mt-4">A produtividade (concluídos e valor) é acumulada de todos os meses. Só o administrador vê e edita esta tela.</p>
    </div>`;
  }

  // roteador do conteúdo interno
  window.renderGestao = function(){
    if (window._gestaoView === 'financeiro') return _renderFinanceiro();
    if (window._gestaoView === 'usuarios') return _renderUsuariosPainel();
    return _renderHub();
  };

  // PÁGINA SEPARADA — tela cheia com topbar própria (sem a sidebar do app).
  window.renderGestaoPagina = function(){
    var nome = (typeof state!=='undefined' && state.sessao) ? (state.sessao.nome||'') : '';
    var voltarInterno = (window._gestaoView && window._gestaoView !== 'hub');
    return `
    <div class="min-h-screen" style="background:#F0F4FF">
      <!-- topbar do painel -->
      <div class="sticky top-0 z-30 text-white shadow-lg" style="background:linear-gradient(135deg,#0A1A4A,#1B3A8C 60%,#2B5CE6)">
        <div class="max-w-5xl mx-auto px-5 py-3 flex items-center gap-3">
          ${voltarInterno
            ? `<button onclick="window._gestaoView='hub';render()" class="flex items-center gap-1.5 text-sm font-medium text-blue-100 hover:text-white">← Visão geral</button>`
            : `<span class="font-extrabold tracking-tight flex items-center gap-2">🛡️ Painel de Gestão</span>`}
          <span class="ml-auto text-[12px] text-blue-100 hidden sm:inline">${_esc(nome)}</span>
          <button onclick="window._gestaoView='hub';setState({page:'resumo'})" class="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-sm font-semibold">← Voltar ao sistema</button>
        </div>
      </div>
      <div class="max-w-5xl mx-auto">${window.renderGestao()}</div>
    </div>`;
  };

  window.attachGestao = function(){
    // busca de usuários (não é inline pra manter foco/cursor)
    var b = document.getElementById('gestao-user-busca');
    if (b) {
      var _t;
      b.oninput = function(){ clearTimeout(_t); var v=b.value; _t=setTimeout(function(){ window._gestaoUserBusca=v; render(); var el=document.getElementById('gestao-user-busca'); if(el){ el.focus(); el.selectionStart=el.selectionEnd=el.value.length; } }, 250); };
    }
    // gráfico do Financeiro: desenha sempre que o canvas existir (as visões agora
    // são botões, não um <select> — antes dependia do select e o gráfico sumia).
    if (document.getElementById('gestao-chart') && window._gestaoDesenhaChart) {
      setTimeout(window._gestaoDesenhaChart, 30);
    }
  };

  // ---- URL própria (#painel) — hash routing simples p/ o SPA ----
  function _syncHash(){
    try {
      if (typeof state==='undefined' || !state) return;
      var querPainel = (state.page==='gestao' && !state.empresaAtiva);
      var temHash = location.hash === '#painel';
      if (querPainel && !temHash) history.replaceState(null,'','#painel');
      else if (!querPainel && temHash) history.replaceState(null,'','#');
    } catch(e){}
  }
  // ao abrir o app já com #painel, entra no painel (se admin)
  try {
    if (location.hash === '#painel' && window.ehAdminGestao && window.ehAdminGestao()) {
      if (typeof state!=='undefined' && state) { state.page='gestao'; }
    }
  } catch(e){}
  // mantém o hash em sincronia a cada render (envelopa o render existente uma vez)
  try {
    if (typeof window.render==='function' && !window.__gestaoHashWrap){
      window.__gestaoHashWrap = true;
      var _origRender = window.render;
      window.render = function(){ var r=_origRender.apply(this, arguments); _syncHash(); return r; };
    }
  } catch(e){}

  // se o app já estiver na aba Gestão quando este módulo carregar, re-renderiza
  try { if (typeof state!=='undefined' && state && state.page==='gestao' && typeof render==='function') render(); } catch(e){}
})();
