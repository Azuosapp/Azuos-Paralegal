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

  // ---- conversão de datas: input date (yyyy-mm-dd) <-> app (dd/mm/aaaa) ----
  function _isoParaBr(iso){
    if (!iso) return '';
    var m = String(iso).match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? (m[3] + '/' + m[2] + '/' + m[1]) : String(iso);
  }
  function _brParaIso(br){
    if (!br) return '';
    var m = String(br).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m) return '';
    var d = ('0'+m[1]).slice(-2), mo = ('0'+m[2]).slice(-2);
    return m[3] + '-' + mo + '-' + d;
  }
  // data mínima permitida (hoje + 5 dias) em yyyy-mm-dd, p/ o atributo min do input
  function _minIso(){
    var h = new Date(); h.setHours(0,0,0,0); h.setDate(h.getDate()+5);
    return h.getFullYear() + '-' + ('0'+(h.getMonth()+1)).slice(-2) + '-' + ('0'+h.getDate()).slice(-2);
  }

  // ---- SALVAR próxima atualização direto da auditoria --------------------
  // Aplica as MESMAS 3 regras do modal de alvará (salvarAlvara) e reusa o
  // mesmo mecanismo de persistência: overlay state.edicoes_alvaras + patch
  // por campo no Firestore. Retorna true se salvou.
  window._auditSalvarProx = function(alvaraId, isoDate){
    if (typeof bloqueioConsulta === 'function' && bloqueioConsulta()) return false;
    var brData = _isoParaBr(isoDate);
    if (!brData) { alert('Escolha uma data válida.'); return false; }

    var alv = (state.alvaras||[]).find(function(x){ return String(x.id) === String(alvaraId); });
    if (!alv) { alert('Alvará não encontrado.'); return false; }

    var _dProx = (typeof parseDataBR==='function') ? parseDataBR(brData) : null;
    if (_dProx) {
      var _hoje = new Date(); _hoje.setHours(0,0,0,0);
      var _dp = new Date(_dProx); _dp.setHours(0,0,0,0);
      // regra 1: não retroativa
      if (_dp < _hoje) { alert('A próxima atualização não pode ser anterior a hoje.'); return false; }
      // regra 2: mínimo 5 dias a partir de hoje
      var _min5 = new Date(_hoje); _min5.setDate(_min5.getDate()+5);
      if (_dp < _min5) { alert('A próxima atualização precisa ser de pelo menos 5 dias a partir de hoje.\n\nData mínima: ' + _min5.toLocaleDateString('pt-BR')); return false; }
      // regra 3: pelo menos 10 dias antes do vencimento
      var _dVenc = (alv.vencimento && typeof parseDataBR==='function') ? parseDataBR(alv.vencimento) : null;
      if (_dVenc) {
        var _diff = Math.round((_dVenc - _dp) / (1000*60*60*24));
        if (_diff < 10) { alert('A próxima atualização precisa ter no mínimo 10 dias de diferença para o vencimento.\n\nVencimento: ' + alv.vencimento + '\nPróxima atualização: ' + brData + '\nDiferença atual: ' + _diff + ' dia(s).'); return false; }
      }
    }

    // monta o overlay de edição (mesmos metadados de salvarAlvara)
    var empresa = (state.empresas||[]).find(function(e){ return e.id === alv.empresa_id; }) || {};
    var data = {
      empresa_id: alv.empresa_id, tipo: alv.tipo, status: alv.status,
      responsavel: alv.responsavel, vencimento: alv.vencimento,
      proxima_atualizacao: brData,
      observacao: alv.observacao || '',
      conversas: alv.conversas || [], anexos: alv.anexos || [],
      empresa: alv.empresa || empresa.nome || '', cidade: alv.cidade || empresa.cidade || '',
      _editado_manualmente: true,
      _editado_em: new Date().toISOString(),
      _editado_por: state.sessao ? (state.sessao.email || state.sessao.nome) : ''
    };
    state.alvaras = state.alvaras.map(function(x){ return x.id == alvaraId ? Object.assign({}, x, data) : x; });
    state.edicoes_alvaras = state.edicoes_alvaras || {};
    state.edicoes_alvaras[alvaraId] = data;
    if (typeof log === 'function') log('Agendou próxima atualização', (alv.tipo||'') + ' - ' + (data.empresa||''), 'Próx.: ' + brData);
    if (typeof saveState === 'function') saveState();

    // patch por campo no Firestore (mesmo contrato do v6.0.8 em salvarAlvara)
    try {
      if (typeof firebase !== 'undefined' && firebase && firebase.firestore) {
        var _o = {};
        Object.keys(data).forEach(function(k){
          var val = data[k];
          if (k === 'anexos' && Array.isArray(val)) {
            _o[k] = val.map(function(a){ var m = Object.assign({}, a); if (m.dados && String(m.dados).indexOf('data:')===0){ m.dados=''; m._local=true; } return m; });
          } else {
            _o[k] = (val === undefined || val === null) ? '' : val;
          }
        });
        var _patch = {}; _patch['edicoes_alvaras.' + alvaraId] = _o;
        firebase.firestore().collection('azuos').doc('shared').update(_patch)
          .then(function(){ console.log('[intel] próx. atualização do alvará ' + alvaraId + ' salva no Firestore'); })
          .catch(function(err){ console.error('[intel] erro Firestore:', err.message); alert('Aviso: salvo localmente mas FALHOU no servidor.\n\n' + err.message); });
      }
    } catch(e){ console.warn('[intel] firestore', e); }

    // toast de confirmação
    try {
      var t = document.createElement('div');
      t.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:14px 22px;border-radius:14px;box-shadow:0 10px 30px -8px rgba(16,185,129,.6);z-index:99999;font-size:14px;font-weight:600;';
      t.innerHTML = '✅ Próxima atualização agendada: <strong>' + _esc(brData) + '</strong>';
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 2500);
    } catch(e){}

    render();
    return true;
  };

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

  // ==========================================================================
  //  REGISTRO DE AUDITORIAS — para adicionar uma nova inteligência no futuro,
  //  basta acrescentar um objeto aqui com: key, titulo, icone, cor, descricao,
  //  contar() (nº de pendências p/ o badge do card) e render() (a tela da auditoria).
  //  O hub monta os botões automaticamente a partir desta lista.
  // ==========================================================================
  var _AUDITS = [
    {
      key: 'proxatual',
      titulo: 'Próxima Atualização',
      icone: '📅',
      cor: 'rose',
      descricao: 'Alvarás com vencimento definido mas SEM data de próxima atualização — têm prazo, mas ninguém agendou o próximo ciclo. Risco de vencer sem acompanhamento.',
      contar: function(){ return window._auditProxItens().length; },
      render: function(){ return _renderAuditProxAtual(); }
    },
    {
      key: 'proxvencida',
      titulo: 'Próxima Atualização Vencida',
      icone: '⏰',
      cor: 'red',
      descricao: 'Alvarás cuja data de próxima atualização já passou e ninguém reagendou — o ciclo de acompanhamento estourou. Reagende direto na lista.',
      contar: function(){ return window._auditProxVencidaItens().length; },
      render: function(){ return _renderAuditProxVencida(); }
    },
    {
      key: 'semresp',
      titulo: 'Empresas Sem Responsável',
      icone: '👤',
      cor: 'amber',
      descricao: 'Empresas ativas sem responsável designado — não aparecem em nenhuma carteira e ninguém acompanha. Clique para atribuir um dono.',
      contar: function(){ return window._auditSemRespItens().length; },
      render: function(){ return _renderAuditSemResp(); }
    }
    // 👉 próximas auditorias entram aqui (ex.: alvarás vencidos há +30d, etc.)
  ];
  window._intelAuditoria = window._intelAuditoria || null; // null = hub; senão a key da auditoria aberta

  // total de pendências somando TODAS as auditorias — usado no badge do menu.
  // Como lê o registro _AUDITS, uma auditoria nova entra no badge automaticamente.
  window._intelTotalPendencias = function(){
    return _AUDITS.reduce(function(s, au){ try { return s + (au.contar() || 0); } catch(e){ return s; } }, 0);
  };

  // ---- HUB: tela inicial com os botões de cada auditoria -------------------
  function _renderHub(){
    var admin = _souAdmin();
    return `
    <div class="p-6">
      <div class="mb-1">
        <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">🧠 Centro de Inteligência</h1>
        <p class="text-sm text-slate-500 mt-0.5">Gestão proativa do paralegal · Escolha uma auditoria para investigar${admin?'':' <span class="text-amber-600 font-medium">(escopo: seus alvarás)</span>'}</p>
      </div>

      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">💡</div>
        <p class="text-sm text-blue-900 m-0">Cada botão abaixo é uma <b>auditoria de qualidade de dados</b> sobre a base de alvarás. Novas inteligências vão sendo adicionadas aqui conforme criamos. Clique em uma para ver os apontamentos e agir.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${_AUDITS.map(function(au){
          var n = 0; try { n = au.contar(); } catch(e){ n = 0; }
          var temPend = n > 0;
          return `<button class="intel-abrir group text-left bg-white rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 p-5 border-l-4 border-${au.cor}-500 flex flex-col gap-3" data-audit="${_esc(au.key)}">
            <div class="flex items-center justify-between gap-2">
              <div class="w-11 h-11 rounded-xl bg-${au.cor}-50 flex items-center justify-center text-2xl">${au.icone}</div>
              ${temPend
                ? `<span class="bg-${au.cor}-100 text-${au.cor}-700 text-xs font-bold rounded-full px-3 py-1">${n} pendência${n>1?'s':''}</span>`
                : `<span class="bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full px-3 py-1">✓ em dia</span>`}
            </div>
            <div>
              <div class="text-base font-bold text-slate-800 group-hover:text-${au.cor}-600">${_esc(au.titulo)}</div>
              <div class="text-[13px] text-slate-500 mt-1 leading-snug">${_esc(au.descricao)}</div>
            </div>
            <div class="mt-1 text-sm font-semibold text-${au.cor}-600 flex items-center gap-1">Abrir auditoria <span class="group-hover:translate-x-0.5 transition-transform">→</span></div>
          </button>`;
        }).join('')}

        <!-- placeholder das próximas inteligências -->
        <div class="rounded-2xl border-2 border-dashed border-slate-200 p-5 flex flex-col items-center justify-center text-center text-slate-400 gap-2 min-h-[160px]">
          <div class="text-2xl">🔜</div>
          <div class="text-sm font-medium">Mais auditorias em breve</div>
          <div class="text-[12px]">Novas inteligências de gestão aparecem aqui.</div>
        </div>
      </div>
    </div>`;
  }

  // ---- roteador da seção: hub ou auditoria aberta --------------------------
  window.renderInteligencia = function(){
    if (!window._intelAuditoria) return _renderHub();
    var au = _AUDITS.find(function(x){ return x.key === window._intelAuditoria; });
    if (!au) { window._intelAuditoria = null; return _renderHub(); }
    return au.render();
  };

  // ==========================================================================
  //  AUDITORIA 1: Próxima Atualização
  // ==========================================================================
  function _renderAuditProxAtual(){
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
      <!-- voltar ao hub + título da auditoria -->
      <button class="intel-voltar inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Centro de Inteligência</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">📅 Próxima Atualização</h1>
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados${admin?'':' <span class="text-amber-600 font-medium">(escopo: seus alvarás)</span>'}</p>
        </div>
      </div>

      <!-- Explicação da auditoria -->
      <div class="bg-rose-50 border border-rose-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">⚠️</div>
        <div class="text-sm text-rose-900">
          <span class="font-bold">Auditoria: alvarás sem data de próxima atualização.</span>
          Estes alvarás têm <b>vencimento definido</b> mas <b>ninguém agendou o próximo ciclo</b> — risco de cair no esquecimento e vencer sem acompanhamento.
          Status já concluídos/em vigor são ignorados. <span class="font-semibold">Defina a data de próxima atualização direto na lista.</span>
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
                  return `<div class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-slate-700">${_esc(a.tipo||'(sem tipo)')}</span>
                      ${!isEmp?`<span class="text-slate-400"> · ${_esc(a.empresa||'')}</span>`:''}
                      ${a.status?`<span class="ml-2 text-[10px] uppercase tracking-wide text-slate-400">${_esc(a.status)}</span>`:''}
                    </div>
                    <span class="shrink-0 text-xs text-slate-500">venc: <b class="text-slate-700">${_esc(a.vencimento||'')}</b></span>
                    <span class="shrink-0 text-[10px] font-bold text-${vc}-600 bg-${vc}-50 rounded px-2 py-0.5">${vencLabel(a)}</span>
                    <div class="shrink-0 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg pl-2 pr-1 py-1" title="Defina a próxima atualização">
                      <span class="text-[10px] font-bold text-rose-600 uppercase">próx:</span>
                      <input type="date" class="intel-prox-inp text-xs text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500" data-aid="${_esc(String(a.id))}" min="${_minIso()}" value="">
                      <button class="intel-prox-save px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed" data-aid="${_esc(String(a.id))}" disabled>Salvar</button>
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
  };

  // ==========================================================================
  //  AUDITORIA 2: Próxima atualização já VENCIDA
  //  A data de próxima atualização foi definida mas já passou — ciclo estourou
  //  e ninguém reagendou. Crítico: acompanhamento atrasado.
  // ==========================================================================
  window._auditProxVencidaItens = function(){
    var meu = _meuNomeAtual();
    var admin = _souAdmin();
    var soMeu = admin ? window._auditProxSoMeu : true;
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var hoje = new Date(); hoje.setHours(0,0,0,0);
    return alvaras.filter(function(a){
      if (!a) return false;
      if (_proxVazia(a.proxima_atualizacao)) return false;   // precisa ter data
      if (a.status && TERMINAIS.test(a.status)) return false; // terminal não conta
      var d = (typeof parseDataBR==='function') ? parseDataBR(a.proxima_atualizacao) : null;
      if (!d) return false;
      d.setHours(0,0,0,0);
      if (d >= hoje) return false;                            // só as JÁ vencidas
      if (soMeu && (a.responsavel || '') !== meu) return false;
      return true;
    }).sort(function(x,y){
      var dx=parseDataBR(x.proxima_atualizacao), dy=parseDataBR(y.proxima_atualizacao);
      return (dx||0) - (dy||0); // mais atrasadas primeiro
    });
  };

  function _renderAuditProxVencida(){
    var admin = _souAdmin();
    var q = (window._auditProxBusca || '').trim().toLowerCase();
    var todos = window._auditProxVencidaItens();
    var itens = !q ? todos : todos.filter(function(a){
      return ((a.empresa||'')+' '+(a.cidade||'')+' '+(a.responsavel||'')+' '+(a.tipo||'')).toLowerCase().indexOf(q)>=0;
    });
    var empresasAfetadas = new Set(itens.map(function(a){ return a.empresa_id!=null?a.empresa_id:a.empresa; })).size;
    var respAfetados = new Set(itens.map(function(a){ return a.responsavel||'(sem)'; })).size;
    var hoje = new Date(); hoje.setHours(0,0,0,0);
    var maxAtraso = itens.reduce(function(mx,a){ var d=parseDataBR(a.proxima_atualizacao); if(!d) return mx; var dias=Math.round((hoje-d)/(864e5)); return Math.max(mx,dias); },0);
    var grupos = _agruparPorEmpresa(itens);
    var kpis = [
      {l:'Próx. atualizações vencidas', v: itens.length, c:'red', sub:'ciclo estourou'},
      {l:'Empresas afetadas', v: empresasAfetadas, c:'amber', sub:'acompanhamento atrasado'},
      {l:'Responsáveis envolvidos', v: respAfetados, c:'blue', sub:'com atraso'},
      {l:'Maior atraso', v: maxAtraso + 'd', c:'rose', sub:'dias em atraso'}
    ];
    var atrasoLabel = function(a){ var d=parseDataBR(a.proxima_atualizacao); if(!d) return ''; var dias=Math.round((hoje-d)/(864e5)); return 'atrasado ' + dias + 'd'; };

    return `
    <div class="p-6">
      <button class="intel-voltar inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Centro de Inteligência</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">⏰ Próxima Atualização Vencida</h1>
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados${admin?'':' <span class="text-amber-600 font-medium">(escopo: seus alvarás)</span>'}</p>
        </div>
      </div>
      <div class="bg-red-50 border border-red-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">🔴</div>
        <div class="text-sm text-red-900">
          <span class="font-bold">Auditoria: próxima atualização com data já vencida.</span>
          A data do próximo ciclo <b>já passou</b> e ninguém reagendou — o acompanhamento está <b>atrasado</b>.
          <span class="font-semibold">Reagende a próxima atualização direto na lista.</span>
        </div>
      </div>
      <div class="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
        ${kpis.map(function(k){ return `<div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-${k.c}-500">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">${k.l}</div>
          <div class="text-3xl font-bold text-slate-800 mt-1 leading-tight">${k.v}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${k.sub}</div>
        </div>`; }).join('')}
      </div>
      <div class="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        ${admin?`<label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none">
          <input type="checkbox" id="intel-so-meu" ${window._auditProxSoMeu?'checked':''} class="w-4 h-4 rounded"> Só os meus
        </label><div class="h-6 w-px bg-slate-200"></div>`:''}
        <div class="flex-1 min-w-[180px]">
          <input id="intel-busca" type="text" value="${_esc(window._auditProxBusca||'')}" placeholder="🔎 Filtrar por empresa, cidade, responsável, tipo..." class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
        </div>
      </div>
      ${itens.length === 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
          <div class="text-5xl mb-3">🎉</div>
          <div class="text-lg font-bold text-slate-800">Nenhuma próxima atualização vencida!</div>
          <div class="text-sm text-slate-500 mt-1">${q?'(no filtro atual) ':''}Todos os ciclos estão em dia.</div>
        </div>
      ` : `
        <div class="space-y-3">
          ${grupos.map(function(g){
            return `<div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-red-500">
              <div class="flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100">
                <button class="intel-open text-left flex-1 min-w-0 group" ${g.id!=null?`data-eid="${g.id}"`:''}>
                  <div class="font-bold text-slate-800 truncate group-hover:text-blue-600">${_esc(g.nome)}</div>
                  <div class="text-[11px] text-slate-500 truncate">${_esc(g.cidade||'')}${g.responsavel?' · 👤 '+_esc(g.responsavel):''}</div>
                </button>
                <span class="shrink-0 bg-red-100 text-red-700 text-xs font-bold rounded-full px-3 py-1">${g.itens.length} vencida(s)</span>
              </div>
              <div class="divide-y divide-slate-50">
                ${g.itens.map(function(a){
                  return `<div class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-slate-700">${_esc(a.tipo||'(sem tipo)')}</span>
                      ${a.status?`<span class="ml-2 text-[10px] uppercase tracking-wide text-slate-400">${_esc(a.status)}</span>`:''}
                    </div>
                    <span class="shrink-0 text-xs text-slate-500">próx. era: <b class="text-slate-700">${_esc(a.proxima_atualizacao||'')}</b></span>
                    <span class="shrink-0 text-[10px] font-bold text-red-600 bg-red-50 rounded px-2 py-0.5">${atrasoLabel(a)}</span>
                    <div class="proxbox shrink-0 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg pl-2 pr-1 py-1" title="Reagende a próxima atualização">
                      <span class="text-[10px] font-bold text-rose-600 uppercase">nova:</span>
                      <input type="date" class="intel-prox-inp text-xs text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500" data-aid="${_esc(String(a.id))}" min="${_minIso()}" value="">
                      <button class="intel-prox-save px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed" data-aid="${_esc(String(a.id))}" disabled>Salvar</button>
                    </div>
                  </div>`;
                }).join('')}
              </div>
            </div>`;
          }).join('')}
        </div>
      `}
    </div>`;
  }

  // ==========================================================================
  //  AUDITORIA 3: Empresas ATIVAS sem responsável
  // ==========================================================================
  window._auditSemRespItens = function(){
    var empresas = (typeof state!=='undefined' && state.empresas) ? state.empresas : [];
    return empresas.filter(function(e){
      if (!e) return false;
      if ((e.status||'').toUpperCase() !== 'ATIVO') return false;
      return !e.responsavel || String(e.responsavel).trim() === '';
    }).sort(function(x,y){ return String(x.nome||'').localeCompare(String(y.nome||'')); });
  };

  function _renderAuditSemResp(){
    var q = (window._auditProxBusca || '').trim().toLowerCase();
    var todos = window._auditSemRespItens();
    var itens = !q ? todos : todos.filter(function(e){
      return ((e.nome||'')+' '+(e.cidade||'')).toLowerCase().indexOf(q)>=0;
    });
    var cidades = new Set(itens.map(function(e){ return e.cidade||'(sem)'; })).size;
    var idx = window._idxAlvCache; // pode não existir; conta alvarás órfãos de forma segura
    var alvarasOrfaos = 0;
    try {
      var ids = new Set(itens.map(function(e){ return e.id; }));
      alvarasOrfaos = (state.alvaras||[]).filter(function(a){ return a && ids.has(a.empresa_id); }).length;
    } catch(e){}
    var kpis = [
      {l:'Empresas sem responsável', v: itens.length, c:'amber', sub:'ativas, sem dono'},
      {l:'Cidades', v: cidades, c:'blue', sub:'distribuição'},
      {l:'Alvarás sem dono', v: alvarasOrfaos, c:'rose', sub:'nessas empresas'}
    ];
    return `
    <div class="p-6">
      <button class="intel-voltar inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Centro de Inteligência</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">👤 Empresas Sem Responsável</h1>
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados</p>
        </div>
      </div>
      <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">⚠️</div>
        <div class="text-sm text-amber-900">
          <span class="font-bold">Auditoria: empresas ativas sem responsável designado.</span>
          Sem um dono, essas empresas (e seus alvarás) <b>não aparecem em nenhuma carteira</b> — ninguém acompanha.
          <span class="font-semibold">Clique na empresa para atribuir um responsável.</span>
        </div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-5">
        ${kpis.map(function(k){ return `<div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-${k.c}-500">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">${k.l}</div>
          <div class="text-3xl font-bold text-slate-800 mt-1 leading-tight">${k.v}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${k.sub}</div>
        </div>`; }).join('')}
      </div>
      <div class="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <div class="flex-1 min-w-[180px]">
          <input id="intel-busca" type="text" value="${_esc(window._auditProxBusca||'')}" placeholder="🔎 Filtrar por empresa ou cidade..." class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
        </div>
      </div>
      ${itens.length === 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
          <div class="text-5xl mb-3">🎉</div>
          <div class="text-lg font-bold text-slate-800">Todas as empresas têm responsável!</div>
          <div class="text-sm text-slate-500 mt-1">${q?'(no filtro atual) ':''}Nenhuma empresa ativa está sem dono.</div>
        </div>
      ` : `
        <div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-amber-500 divide-y divide-slate-50">
          ${itens.map(function(e){
            return `<button class="intel-open w-full text-left flex items-center gap-3 px-4 py-3 hover:bg-slate-50 group" data-eid="${e.id}">
              <div class="flex-1 min-w-0">
                <div class="font-medium text-slate-700 truncate group-hover:text-blue-600">${_esc(e.nome||'(sem nome)')}</div>
                <div class="text-[11px] text-slate-500 truncate">${_esc(e.cidade||'')}</div>
              </div>
              <span class="shrink-0 text-[10px] font-bold text-amber-600 bg-amber-50 rounded px-2 py-0.5">sem responsável</span>
              <span class="shrink-0 text-blue-600 font-semibold text-xs group-hover:translate-x-0.5 transition-transform">atribuir →</span>
            </button>`;
          }).join('')}
        </div>
      `}
    </div>`;
  }

  window.attachInteligencia = function(){
    // navegação hub <-> auditoria (limpa a busca ao trocar de tela p/ não vazar filtro)
    document.querySelectorAll('.intel-abrir').forEach(function(b){
      b.onclick = function(){ window._auditProxBusca = ''; window._intelAuditoria = b.dataset.audit; render(); };
    });
    var voltar = document.querySelector('.intel-voltar');
    if (voltar) voltar.onclick = function(){ window._auditProxBusca = ''; window._intelAuditoria = null; render(); };

    document.querySelectorAll('.intel-group').forEach(function(b){
      b.onclick = function(){ window._auditProxAgrupar = b.dataset.g; render(); };
    });
    var soMeu = document.getElementById('intel-so-meu');
    if (soMeu) soMeu.onclick = function(){ window._auditProxSoMeu = soMeu.checked; render(); };
    document.querySelectorAll('.intel-open').forEach(function(b){
      b.onclick = function(){ var id = b.dataset.eid; if (id != null) setState({empresaAtiva: isNaN(+id)?id:+id}); };
    });
    // date picker inline: habilita o botão Salvar quando há data escolhida
    document.querySelectorAll('.intel-prox-inp').forEach(function(inp){
      var btn = document.querySelector('.intel-prox-save[data-aid="'+inp.dataset.aid+'"]');
      var sync = function(){ if (btn) btn.disabled = !inp.value; };
      inp.oninput = sync; inp.onchange = sync;
    });
    document.querySelectorAll('.intel-prox-save').forEach(function(btn){
      btn.onclick = function(){
        var inp = document.querySelector('.intel-prox-inp[data-aid="'+btn.dataset.aid+'"]');
        if (!inp || !inp.value) { alert('Escolha a data da próxima atualização primeiro.'); return; }
        window._auditSalvarProx(btn.dataset.aid, inp.value); // render() acontece dentro se salvar
      };
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
