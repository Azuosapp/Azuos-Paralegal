/* ============================================================================
   PAINEL DE GESTÃO — área exclusiva do administrador (modelo /painel da Trilha).
   Hub de cards + Financeiro/Produtividade por usuário (mês, acumulado, export).

   Módulo separado (não IIFE de remendo). Depende de globais do index:
   state, esc, render, setState, _gamConta, _gamUser, _gamEhGestor, _gamFmt,
   _gamValor, _gamTabela, _gamMeses, _gamMesAtual, _gamStatusSet.
   ========================================================================== */
(function(){
  function _esc(s){ return (typeof esc==='function') ? esc(s) : String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
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
  function _renderFinanceiro(){
    if(!window.ehAdminGestao()) return _renderHub();
    var meses = (typeof _gamMeses==='function') ? _gamMeses() : [];
    var mesSel = window._gestaoMes || ((typeof _gamMesAtual==='function')?_gamMesAtual():'');
    var doMes = window._gestaoAgrega(mesSel);
    var acumulado = window._gestaoAgrega(null); // todos os meses
    var accMap = {}; acumulado.forEach(function(r){ accMap[r.chave]=r; });
    var totalMes = doMes.reduce(function(s,r){ return s+r.valor; }, 0);
    var totalPago = doMes.filter(function(r){ return window._gestaoPago(r.chave,mesSel); }).reduce(function(s,r){ return s+r.valor; }, 0);
    var totalAPagar = totalMes - totalPago;

    return `
    <div class="p-6 max-w-5xl mx-auto">
      <button onclick="window._gestaoView='hub';render()" class="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Painel de Gestão</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h1 class="text-2xl font-extrabold text-slate-800">💰 Financeiro / Produtividade</h1>
          <p class="text-sm text-slate-500 mt-0.5">Quanto cada colaborador gerou — pago pelo valor real de cada tipo de alvará.</p>
        </div>
        <div class="flex items-center gap-2">
          <select onchange="window._gestaoMes=this.value;render()" class="px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold">
            ${meses.map(function(m){ return '<option value="'+_esc(m)+'"'+(m===mesSel?' selected':'')+'>'+_esc(m)+'</option>'; }).join('')}
          </select>
          <button onclick="window._gestaoExportCSV()" class="px-3 py-2 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-semibold hover:bg-emerald-100">⬇️ Exportar CSV</button>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-5">
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-slate-400"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Total do mês</div><div class="text-2xl font-bold text-slate-800 mt-1">${_fmt(totalMes)}</div></div>
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-emerald-500"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">Já pago</div><div class="text-2xl font-bold text-emerald-600 mt-1">${_fmt(totalPago)}</div></div>
        <div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-rose-500"><div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">A pagar</div><div class="text-2xl font-bold text-rose-600 mt-1">${_fmt(totalAPagar)}</div></div>
      </div>
      ${doMes.length===0 ? `<div class="bg-white rounded-xl shadow-sm p-12 text-center"><div class="text-4xl mb-2">🗓️</div><div class="font-bold text-slate-700">Nenhuma produtividade em ${_esc(mesSel)}</div><div class="text-sm text-slate-500 mt-1">Escolha outro mês no seletor acima.</div></div>` : `
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead class="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
              <tr><th class="text-left px-4 py-3 font-semibold">Colaborador</th><th class="text-center px-3 py-3 font-semibold">Alvarás (mês)</th><th class="text-right px-3 py-3 font-semibold">Valor do mês</th><th class="text-right px-3 py-3 font-semibold">Acumulado (total)</th><th class="text-center px-4 py-3 font-semibold">Pagamento</th></tr>
            </thead>
            <tbody class="divide-y divide-slate-50">
              ${doMes.map(function(r){
                var acc = accMap[r.chave] || {valor:0, qtd:0};
                var pago = window._gestaoPago(r.chave, mesSel);
                return `<tr class="hover:bg-slate-50">
                  <td class="px-4 py-3"><div class="font-semibold text-slate-700">${_esc(r.nome||'—')}</div><div class="text-[11px] text-slate-400">${_esc(r.email||'')}</div></td>
                  <td class="text-center px-3 py-3 text-slate-600">${r.qtd}</td>
                  <td class="text-right px-3 py-3 font-bold text-slate-800">${_fmt(r.valor)}</td>
                  <td class="text-right px-3 py-3 text-slate-500">${_fmt(acc.valor)} <span class="text-[10px] text-slate-400">(${acc.qtd})</span></td>
                  <td class="text-center px-4 py-3">
                    <button onclick="window._gestaoMarcarPago('${_esc(r.chave).replace(/'/g,"\\'")}','${_esc(mesSel)}',${pago?'false':'true'})" class="px-3 py-1.5 rounded-lg text-xs font-bold ${pago?'bg-emerald-100 text-emerald-700 hover:bg-emerald-200':'bg-rose-50 text-rose-600 hover:bg-rose-100'}">${pago?'✓ Pago':'A pagar'}</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot class="bg-slate-50 font-bold"><tr><td class="px-4 py-3 text-slate-700">Total</td><td class="text-center px-3 py-3 text-slate-600">${doMes.reduce(function(s,r){return s+r.qtd;},0)}</td><td class="text-right px-3 py-3 text-slate-800">${_fmt(totalMes)}</td><td></td><td></td></tr></tfoot>
          </table>
        </div>
      </div>
      <p class="text-[11px] text-slate-400 mt-3">O "Acumulado" soma todos os meses. Valores calculados pelo tipo de cada alvará (tabela em Valores). "Pago" é um controle manual do admin — sincronizado.</p>
      `}
    </div>`;
  }

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
      var foto = u.foto ? '<img src="'+u.foto+'" class="w-full h-full" style="object-fit:cover">' : ini;
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
          <button onclick="openModalUsuario('${u.id}')" class="flex-1 text-xs py-1.5 rounded text-blue-600 hover:bg-blue-50 font-medium">✏️ Editar</button>
          <button onclick="excluirUsuario('${u.id}')" class="flex-1 text-xs py-1.5 rounded text-red-600 hover:bg-red-50 font-medium">🗑️ Excluir</button>
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
