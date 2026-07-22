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
  // [v6.0.31] O campo 'responsavel' do alvara guarda o NOME da pessoa (ex.: "Luanna"),
  // nunca o e-mail. A versao anterior devolvia o e-mail, entao a comparacao virava
  // "Luanna" === "luanna@azuoscontabil.com.br" e o filtro "So os meus" zerava a
  // lista para TODOS os usuarios. Agora resolvemos o NOME de quem logou.
  function _meuNomeAtual(){
    try{
      if (typeof state==='undefined' || !state.sessao) return '';
      var email = (state.sessao.email||'').toLowerCase().trim();
      // 1) nome oficial cadastrado para este e-mail (fonte mais confiavel)
      if (typeof window._azuosOficialPorEmail === 'function' && email){
        var of = window._azuosOficialPorEmail(email);
        if (of){
          if (typeof of === 'string' && of) return of;
          if (of.nome) return of.nome;
        }
      }
      // 2) nome na lista de usuarios do sistema
      var u = (state.usuarios||[]).filter(function(x){
        return x && (x.email||'').toLowerCase().trim() === email;
      })[0];
      if (u && u.nome) return u.nome;
      // 3) nome da propria sessao
      return state.sessao.nome || '';
    }catch(e){ return ''; }
  }
  // compara ignorando acento, maiuscula/minuscula e espacos sobrando
  function _normNome(s){
    try{ return String(s==null?'':s).normalize('NFD').replace(/[̀-ͯ]/g,'').trim().toLowerCase(); }
    catch(e){ return String(s==null?'':s).trim().toLowerCase(); }
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
  // grupos abertos (accordion) — vazio = tudo RECOLHIDO ao abrir. key = gkey.
  window._intelGruposAbertos = window._intelGruposAbertos || {};

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
  window._auditSalvarProx = function(alvaraId, isoDate, opts){
    opts = opts || {};
    var silent = !!opts.silent;              // não faz render nem toast (uso em massa)
    var alertFn = silent ? function(){} : alert; // em massa não empilha popups
    if (typeof bloqueioConsulta === 'function' && bloqueioConsulta()) return false;
    var brData = _isoParaBr(isoDate);
    if (!brData) { alertFn('Escolha uma data válida.'); return false; }

    var alv = (state.alvaras||[]).find(function(x){ return String(x.id) === String(alvaraId); });
    if (!alv) { alertFn('Alvará não encontrado.'); return false; }

    var _dProx = (typeof parseDataBR==='function') ? parseDataBR(brData) : null;
    if (_dProx) {
      var _hoje = new Date(); _hoje.setHours(0,0,0,0);
      var _dp = new Date(_dProx); _dp.setHours(0,0,0,0);
      // regra 1: não retroativa
      if (_dp < _hoje) { alertFn('A próxima atualização não pode ser anterior a hoje.'); return false; }
      // regra 2: mínimo 5 dias a partir de hoje
      var _min5 = new Date(_hoje); _min5.setDate(_min5.getDate()+5);
      if (_dp < _min5) { alertFn('A próxima atualização precisa ser de pelo menos 5 dias a partir de hoje.\n\nData mínima: ' + _min5.toLocaleDateString('pt-BR')); return false; }
      // regra 3: pelo menos 10 dias antes do vencimento — SÓ vale se o vencimento
      // ainda está no futuro. Se já venceu, a próxima atualização é livre
      // (senão seria impossível reagendar alvarás vencidos). Respeita só a regra de 5 dias.
      var _dVenc = (alv.vencimento && typeof parseDataBR==='function') ? parseDataBR(alv.vencimento) : null;
      if (_dVenc) {
        var _dv0 = new Date(_dVenc); _dv0.setHours(0,0,0,0);
        if (_dv0 >= _hoje) { // vencimento no futuro → aplica a regra dos 10 dias
          var _diff = Math.round((_dVenc - _dp) / (1000*60*60*24));
          if (_diff < 10) { alertFn('A próxima atualização precisa ter no mínimo 10 dias de diferença para o vencimento.\n\nVencimento: ' + alv.vencimento + '\nPróxima atualização: ' + brData + '\nDiferença atual: ' + _diff + ' dia(s).'); return false; }
        }
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

    if (!silent) {
      // toast de confirmação
      try {
        var t = document.createElement('div');
        t.style.cssText = 'position:fixed;top:20px;right:20px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;padding:14px 22px;border-radius:14px;box-shadow:0 10px 30px -8px rgba(16,185,129,.6);z-index:99999;font-size:14px;font-weight:600;';
        t.innerHTML = '✅ Próxima atualização agendada: <strong>' + _esc(brData) + '</strong>';
        document.body.appendChild(t);
        setTimeout(function(){ t.remove(); }, 2500);
      } catch(e){}
      render();
    }
    return true;
  };

  // Aplicação em MASSA: mesma data para vários alvarás. Salva cada um em modo
  // silencioso (valida individualmente), conta sucessos/pulados, depois 1 render + 1 toast.
  window._auditSalvarProxMassa = function(alvaraIds, isoDate){
    if (typeof bloqueioConsulta === 'function' && bloqueioConsulta()) return;
    var brData = _isoParaBr(isoDate);
    if (!brData) { alert('Escolha uma data válida para aplicar em massa.'); return; }
    var ok = 0, pulados = 0, motivos = [];
    (alvaraIds||[]).forEach(function(id){
      // pré-checa regra 10-dias p/ dar motivo claro no resumo (a validação real acontece dentro)
      var alv = (state.alvaras||[]).find(function(x){ return String(x.id)===String(id); });
      var salvou = window._auditSalvarProx(id, isoDate, {silent:true});
      if (salvou) ok++; else { pulados++; if (alv) motivos.push(alv.tipo||('#'+id)); }
    });
    // 1 render e 1 toast no fim
    if (typeof saveState === 'function') saveState();
    try {
      var t = document.createElement('div');
      var cor = pulados ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'linear-gradient(135deg,#10b981,#059669)';
      t.style.cssText = 'position:fixed;top:20px;right:20px;background:'+cor+';color:#fff;padding:14px 22px;border-radius:14px;box-shadow:0 10px 30px -8px rgba(0,0,0,.4);z-index:99999;font-size:14px;font-weight:600;max-width:360px;';
      t.innerHTML = '✅ ' + ok + ' alvará(s) agendado(s) para <strong>' + _esc(brData) + '</strong>' +
        (pulados ? '<br><span style="font-weight:400;font-size:12px">⚠️ ' + pulados + ' pulado(s) por regra de data (ex.: 10 dias antes do vencimento): ' + _esc(motivos.slice(0,4).join(', ')) + (motivos.length>4?'…':'') + '</span>' : '');
      document.body.appendChild(t);
      setTimeout(function(){ t.remove(); }, 5000);
    } catch(e){}
    render();
  };

  // Núcleo: alvarás com vencimento e SEM próxima atualização.
  // Admin vê tudo; usuário comum só os seus. Ignora status terminais.
  // escopo: por padrão a auditoria varre a BASE INTEIRA (gestão).
  // "só os meus" é um filtro OPCIONAL (checkbox) disponível para qualquer usuário.
  function _passaEscopo(a){
    if (!window._auditProxSoMeu) return true; // base inteira
    var meu = _normNome(_meuNomeAtual());
    if (!meu) return false;
    var resp = _normNome(a && a.responsavel);
    if (!resp) return false;
    if (resp === meu) return true;
    // A base costuma guardar so o primeiro nome ("Luanna"), enquanto o cadastro
    // pode ter o nome completo — entao tambem casamos pelo primeiro nome.
    var p1 = resp.split(/\s+/)[0], p2 = meu.split(/\s+/)[0];
    return !!p1 && p1 === p2;
  }

  window._auditProxItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a) return false;
      if (!_proxVazia(a.proxima_atualizacao)) return false; // já preenchida => ok
      if (a.status && TERMINAIS.test(a.status)) return false; // status terminal (concluído/pago/sem obrig./etc.) não precisa de próx.
      if (!_passaEscopo(a)) return false;
      return true;                                          // vivo e sem próxima atualização => FALHA (com ou sem vencimento)
    });
  };

  // universo auditável (alvarás vivos no escopo) — p/ % de saúde
  function _universoEscopo(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a) return false;
      if (a.status && TERMINAIS.test(a.status)) return false;
      if (!_passaEscopo(a)) return false;
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
      descricao: 'Alvarás ativos SEM data de próxima atualização — ninguém agendou o próximo ciclo. Risco de cair no esquecimento (inclui vencidos antigos e sem prazo definido).',
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
    },
    {
      key: 'vencidos30',
      titulo: 'Vencidos há +30 dias',
      icone: '🚨',
      cor: 'red',
      descricao: 'Alvarás vencidos há mais de 30 dias e ainda ativos (não concluídos) — o vencimento passou faz tempo e ninguém resolveu. Foco no atraso crônico.',
      contar: function(){ return window._auditVencidos30Itens().length; },
      render: function(){ return _renderAuditListaAlvaras({
        titulo:'Vencidos há +30 dias', icone:'🚨', cor:'red', emoji:'🔴',
        itensFn: window._auditVencidos30Itens,
        explica:'<span class="font-bold">Auditoria: alvarás vencidos há mais de 30 dias.</span> O vencimento passou faz tempo e o alvará continua ativo — atraso crônico. <span class="font-semibold">Clique na empresa para regularizar.</span>',
        kpiLabel:'Vencidos +30d', kpiSub:'atraso crônico', vazio:'Nenhum alvará vencido há mais de 30 dias.',
        colBadge: function(a){ var d=parseDataBR(a.vencimento); if(!d) return null; var dias=Math.round((_hojeZero()-d)/DIAS); return {txt:'há '+dias+'d', cor: dias>365?'red':'orange'}; }
      }); }
    },
    {
      key: 'semstatus',
      titulo: 'Alvarás Sem Status',
      icone: '❓',
      cor: 'amber',
      descricao: 'Alvarás sem status preenchido — falha de cadastro. Sem status não dá pra saber em que pé está nem gerir o alvará.',
      contar: function(){ return window._auditSemStatusItens().length; },
      render: function(){ return _renderAuditListaAlvaras({
        titulo:'Alvarás Sem Status', icone:'❓', cor:'amber', emoji:'⚠️',
        itensFn: window._auditSemStatusItens,
        explica:'<span class="font-bold">Auditoria: alvarás sem status.</span> Sem status preenchido não dá pra saber em que pé está o alvará nem acompanhá-lo. <span class="font-semibold">Clique na empresa para definir o status.</span>',
        kpiLabel:'Sem status', kpiSub:'falha de cadastro', vazio:'Todos os alvarás têm status.',
        colBadge: function(){ return {txt:'sem status', cor:'amber'}; }
      }); }
    },
    {
      key: 'statusdesatualizado',
      titulo: 'Status Desatualizado',
      icone: '🔄',
      cor: 'orange',
      descricao: 'Alvarás cujo vencimento já passou mas o status não foi atualizado para "Vencido" — o dado está mentindo sobre a situação real.',
      contar: function(){ return window._auditStatusDesatualizadoItens().length; },
      render: function(){ return _renderAuditListaAlvaras({
        titulo:'Status Desatualizado', icone:'🔄', cor:'orange', emoji:'🟠',
        itensFn: window._auditStatusDesatualizadoItens,
        explica:'<span class="font-bold">Auditoria: status não reflete o vencimento.</span> O vencimento já passou mas o status ainda não é "Vencido" — o dado está desatualizado. <span class="font-semibold">Clique na empresa para revisar o status.</span>',
        kpiLabel:'Status desatualizado', kpiSub:'venceu, status não', vazio:'Nenhum status desatualizado.',
        colBadge: function(a){ var d=parseDataBR(a.vencimento); if(!d) return null; var dias=Math.round((_hojeZero()-d)/DIAS); return {txt:'venceu há '+dias+'d', cor:'orange'}; }
      }); }
    },

    // ---------- PROATIVIDADE ----------
    {
      key:'vencebreve', titulo:'Vence em breve sem agendamento', icone:'⏳', cor:'orange',
      descricao:'Alvarás que vencem em até 30 dias e ainda não têm próxima atualização agendada — risco duplo: prazo curto + sem acompanhamento planejado.',
      contar:function(){ return window._auditVenceBreveSemProxItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Vence em breve sem agendamento', icone:'⏳', cor:'orange', emoji:'🟠',
        itensFn: window._auditVenceBreveSemProxItens,
        explica:'<span class="font-bold">Auditoria: vence em ≤30 dias e sem próxima atualização.</span> Prazo curto e ninguém agendou o próximo ciclo — risco duplo. <span class="font-semibold">Aja com prioridade.</span>',
        kpiLabel:'Vencem em ≤30d', kpiSub:'sem agendamento', vazio:'Nenhum alvará vencendo sem agendamento.',
        colBadge:function(a){ var d=parseDataBR(a.vencimento); if(!d) return null; var dias=Math.round((d-_hojeZero())/DIAS); return {txt: dias===0?'vence hoje':'vence em '+dias+'d', cor:'orange'}; }
      }); }
    },
    {
      key:'proxsemvenc', titulo:'Próxima atualização sem vencimento', icone:'🧩', cor:'amber',
      descricao:'Alvarás com data de próxima atualização preenchida mas sem vencimento — incoerência: agendou o ciclo sem haver um prazo de referência.',
      contar:function(){ return window._auditProxSemVencItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Próxima atualização sem vencimento', icone:'🧩', cor:'amber', emoji:'⚠️',
        itensFn: window._auditProxSemVencItens,
        explica:'<span class="font-bold">Auditoria: próxima atualização sem vencimento.</span> Há data de próximo ciclo mas nenhum vencimento de referência — provável erro de cadastro. <span class="font-semibold">Verifique o vencimento.</span>',
        kpiLabel:'Sem vencimento', kpiSub:'mas com próx.', vazio:'Nenhuma incoerência encontrada.',
        colBadge:function(){ return {txt:'sem vencimento', cor:'amber'}; }
      }); }
    },

    // ---------- OPERACIONAL ----------
    {
      key:'paralisado', titulo:'Serviço paralisado', icone:'🛑', cor:'red',
      descricao:'Alvarás com status "Serviço paralisado" — travados por algum bloqueio. Precisam de destrave ou repriorização.',
      contar:function(){ return window._auditParalisadoItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Serviço paralisado', icone:'🛑', cor:'red', emoji:'🔴',
        itensFn: window._auditParalisadoItens,
        explica:'<span class="font-bold">Auditoria: serviços paralisados.</span> Estão travados — algo bloqueou o andamento. <span class="font-semibold">Destrave ou repriorize.</span>',
        kpiLabel:'Paralisados', kpiSub:'travados', vazio:'Nenhum serviço paralisado.'
      }); }
    },
    {
      key:'aguardcliente', titulo:'Aguardando cliente', icone:'⌛', cor:'amber',
      descricao:'Alvarás parados aguardando o cliente — podem estar travados indefinidamente. Bom para uma rodada de cobrança.',
      contar:function(){ return window._auditAguardClienteItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Aguardando cliente', icone:'⌛', cor:'amber', emoji:'⚠️',
        itensFn: window._auditAguardClienteItens,
        explica:'<span class="font-bold">Auditoria: aguardando cliente.</span> Parados esperando o cliente — risco de travar sem fim. <span class="font-semibold">Rode uma cobrança.</span>',
        kpiLabel:'Aguardando cliente', kpiSub:'parados no cliente', vazio:'Nada aguardando cliente.'
      }); }
    },
    {
      key:'semregistro', titulo:'Sem registro', icone:'📭', cor:'amber',
      descricao:'Alvarás com status "Sem registro" — situação indefinida que precisa ser apurada e classificada.',
      contar:function(){ return window._auditSemRegistroItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Sem registro', icone:'📭', cor:'amber', emoji:'⚠️',
        itensFn: window._auditSemRegistroItens,
        explica:'<span class="font-bold">Auditoria: sem registro.</span> Situação indefinida — precisa ser apurada e classificada. <span class="font-semibold">Defina o status real.</span>',
        kpiLabel:'Sem registro', kpiSub:'a apurar', vazio:'Nenhum sem registro.'
      }); }
    },
    {
      key:'naopago', titulo:'Não pago', icone:'💸', cor:'red',
      descricao:'Alvarás com status "Não pago" — pendência financeira em aberto. Foco para regularização de pagamentos.',
      contar:function(){ return window._auditNaoPagoItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Não pago', icone:'💸', cor:'red', emoji:'🔴',
        itensFn: window._auditNaoPagoItens,
        explica:'<span class="font-bold">Auditoria: não pago.</span> Pendência financeira em aberto. <span class="font-semibold">Regularize o pagamento.</span>',
        kpiLabel:'Não pago', kpiSub:'pendência financeira', vazio:'Nenhuma pendência de pagamento.'
      }); }
    },

    // ---------- INTEGRIDADE ----------
    {
      key:'orfaos', titulo:'Alvarás órfãos', icone:'🚧', cor:'red',
      descricao:'Alvarás apontando para uma empresa que não existe (empresa_id inválido) — dado quebrado que some das telas por empresa.',
      contar:function(){ return window._auditOrfaosItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Alvarás órfãos', icone:'🚧', cor:'red', emoji:'🔴',
        itensFn: window._auditOrfaosItens,
        explica:'<span class="font-bold">Auditoria de integridade: alvarás órfãos.</span> Apontam para uma empresa que não existe — o registro está quebrado. <span class="font-semibold">Requer correção técnica/reassociação.</span>',
        kpiLabel:'Órfãos', kpiSub:'empresa inexistente', vazio:'Nenhum alvará órfão. Base íntegra.'
      }); }
    },
    {
      key:'respinvalido', titulo:'Responsável inválido', icone:'👻', cor:'amber',
      descricao:'Alvarás cujo responsável não consta na lista de usuários do sistema — provável nome digitado errado ou usuário removido.',
      contar:function(){ return window._auditRespInvalidoItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Responsável inválido', icone:'👻', cor:'amber', emoji:'⚠️',
        itensFn: window._auditRespInvalidoItens,
        explica:'<span class="font-bold">Auditoria de integridade: responsável inválido.</span> O responsável não existe na lista de usuários — nome errado ou usuário removido. <span class="font-semibold">Reatribua a um usuário válido.</span>',
        kpiLabel:'Resp. inválido', kpiSub:'não é usuário', vazio:'Todos os responsáveis são válidos.'
      }); }
    },
    {
      key:'cachedesatualizado', titulo:'Cache desatualizado', icone:'♻️', cor:'amber',
      descricao:'Alvarás cujo nome/cidade guardado no alvará não bate com o cadastro atual da empresa — dado divergente após edição da empresa.',
      contar:function(){ return window._auditCacheDesatualizadoItens().length; },
      render:function(){ return _renderAuditListaAlvaras({
        titulo:'Cache desatualizado', icone:'♻️', cor:'amber', emoji:'⚠️',
        itensFn: window._auditCacheDesatualizadoItens,
        explica:'<span class="font-bold">Auditoria de integridade: cache desatualizado.</span> O nome/cidade no alvará não bate com o cadastro atual da empresa. <span class="font-semibold">Abra e salve para sincronizar.</span>',
        kpiLabel:'Cache divergente', kpiSub:'nome/cidade', vazio:'Nenhum cache divergente.'
      }); }
    },

    // ---------- PLACAR (painel de gestão, não conta p/ badge) ----------
    {
      key:'placar', titulo:'Placar por Responsável', icone:'🏅', cor:'blue',
      descricao:'Painel de gestão: pendências de qualidade de dados agrupadas por responsável (sem próx., vencidos, sem status) + saúde da carteira de cada um.',
      naoContaBadge:true,               // é panorama, não pendência a resolver
      contar:function(){ return 0; },    // não infla o badge do menu
      render:function(){ return _renderPlacar(); }
    }
    // 👉 próximas auditorias entram aqui
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
        <p class="text-sm text-slate-500 mt-0.5">Gestão proativa do paralegal · Escolha uma auditoria para investigar</p>
      </div>

      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">💡</div>
        <p class="text-sm text-blue-900 m-0">Cada botão abaixo é uma <b>auditoria de qualidade de dados</b> sobre a base de alvarás. Novas inteligências vão sendo adicionadas aqui conforme criamos. Clique em uma para ver os apontamentos e agir.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        ${_AUDITS.map(function(au){
          var n = 0; try { n = au.contar(); } catch(e){ n = 0; }
          var temPend = n > 0;
          var painel = !!au.naoContaBadge;
          return `<button class="intel-abrir group text-left bg-white rounded-2xl shadow-sm hover:shadow-lg hover:-translate-y-0.5 transition-all duration-150 p-5 border-l-4 border-${au.cor}-500 flex flex-col gap-3" data-audit="${_esc(au.key)}">
            <div class="flex items-center justify-between gap-2">
              <div class="w-11 h-11 rounded-xl bg-${au.cor}-50 flex items-center justify-center text-2xl">${au.icone}</div>
              ${painel
                ? `<span class="bg-${au.cor}-100 text-${au.cor}-700 text-xs font-bold rounded-full px-3 py-1">painel</span>`
                : (temPend
                  ? `<span class="bg-${au.cor}-100 text-${au.cor}-700 text-xs font-bold rounded-full px-3 py-1">${n} pendência${n>1?'s':''}</span>`
                  : `<span class="bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full px-3 py-1">✓ em dia</span>`)}
            </div>
            <div>
              <div class="text-base font-bold text-slate-800 group-hover:text-${au.cor}-600">${_esc(au.titulo)}</div>
              <div class="text-[13px] text-slate-500 mt-1 leading-snug">${_esc(au.descricao)}</div>
            </div>
            <div class="mt-1 text-sm font-semibold text-${au.cor}-600 flex items-center gap-1">${painel?'Abrir painel':'Abrir auditoria'} <span class="group-hover:translate-x-0.5 transition-transform">→</span></div>
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
      {l:'Alvarás sem próx. atualização', v: totalAlv, c:'rose', sub:'alvarás ativos'},
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
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados${window._auditProxSoMeu?' <span class="text-amber-600 font-medium">(filtro: seus alvarás)</span>':' <span class="text-slate-400">· base inteira</span>'}</p>
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
        <div class="h-6 w-px bg-slate-200"></div>
        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none" title="Filtra só os alvarás em que você é o responsável">
          <input type="checkbox" id="intel-so-meu" ${window._auditProxSoMeu?'checked':''} class="w-4 h-4 rounded"> Só os meus
        </label>
        <div class="flex-1 min-w-[180px]">
          <input id="intel-busca" type="text" value="${_esc(window._auditProxBusca||'')}" placeholder="🔎 Filtrar por empresa, cidade, responsável, tipo..." class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
        </div>
        <button id="intel-export" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100">⬇️ Exportar CSV</button>
      </div>

      ${totalAlv === 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
          <div class="text-5xl mb-3">🎉</div>
          <div class="text-lg font-bold text-slate-800">Tudo em dia!</div>
          <div class="text-sm text-slate-500 mt-1">Nenhum alvará ativo ${q?'(no filtro atual) ':''}está sem data de próxima atualização.</div>
        </div>
      ` : `
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="text-xs text-slate-500">${grupos.length} ${window._auditProxAgrupar==='empresa'?'empresa(s)':'responsável(is)'} · ${totalAlv} alvará(s)</div>
          <div class="flex items-center gap-2">
            <button id="intel-expandir-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Expandir todos</button>
            <span class="text-slate-300">·</span>
            <button id="intel-recolher-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Recolher todos</button>
          </div>
        </div>
        <div class="space-y-2">
          ${grupos.map(function(g, gi){
            var isEmp = window._auditProxAgrupar === 'empresa';
            var aberto = !!window._intelGruposAbertos[String(g.id!=null?g.id:('r'+gi))];
            var gkey = String(g.id!=null?g.id:('r'+gi));
            return `<div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-rose-400">
              <div class="intel-toggle flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100" data-gkey="${gkey}">
                <span class="shrink-0 text-slate-400 text-xs transition-transform ${aberto?'rotate-90':''}" style="display:inline-block">▶</span>
                <div class="flex-1 min-w-0">
                  ${isEmp
                    ? `<div class="font-bold text-slate-800 truncate">${_esc(g.nome)}</div>
                       <div class="text-[11px] text-slate-500 truncate">${_esc(g.cidade||'')}${g.responsavel?' · 👤 '+_esc(g.responsavel):''}</div>`
                    : `<div class="font-bold text-slate-800 truncate">👤 ${_esc(g.nome)}</div>
                       <div class="text-[11px] text-slate-500">${g.empresas.size} empresa(s) afetada(s)</div>`}
                </div>
                <span class="shrink-0 bg-rose-100 text-rose-700 text-xs font-bold rounded-full px-3 py-1">${g.itens.length} alvará(s)</span>
                ${isEmp && g.id!=null ? `<button class="intel-open shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700" data-eid="${g.id}" title="Abrir a empresa">Abrir empresa</button>` : ''}
              </div>
              ${!aberto ? '' : `
              <!-- barra de aplicação em MASSA -->
              <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <span class="text-[11px] font-bold text-blue-700 uppercase">⚡ Aplicar em todos:</span>
                <input type="date" class="intel-massa-inp text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500" data-gkey="${gkey}" min="${_minIso()}" value="">
                <button class="intel-massa-btn px-3 py-1 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed" data-gkey="${gkey}" disabled>Aplicar aos ${g.itens.length}</button>
                <span class="text-[11px] text-blue-600">define a mesma próxima atualização para todos os alvarás desta ${isEmp?'empresa':'lista'}</span>
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
                    <span class="shrink-0 text-xs text-slate-500">venc: <b class="text-slate-700">${_esc(a.vencimento||'—')}</b></span>
                    ${a.vencimento
                      ? `<span class="shrink-0 text-[10px] font-bold text-${vc}-600 bg-${vc}-50 rounded px-2 py-0.5">${vencLabel(a)}</span>`
                      : `<span class="shrink-0 text-[10px] font-bold text-slate-400 bg-slate-50 rounded px-2 py-0.5">sem vencimento</span>`}
                    <div class="shrink-0 flex items-center gap-1.5 bg-rose-50 border border-rose-200 rounded-lg pl-2 pr-1 py-1" title="Defina a próxima atualização">
                      <span class="text-[10px] font-bold text-rose-600 uppercase">próx:</span>
                      <input type="date" class="intel-prox-inp text-xs text-slate-700 bg-white border border-slate-200 rounded px-1.5 py-0.5 focus:outline-none focus:border-blue-500" data-aid="${_esc(String(a.id))}" min="${_minIso()}" value="">
                      <button class="intel-prox-save px-2 py-0.5 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed" data-aid="${_esc(String(a.id))}" disabled>Salvar</button>
                    </div>
                  </div>`;
                }).join('')}
              </div>`}
            </div>`;
          }).join('')}
        </div>
      `}
      ${_rodapeTransparencia('Ignora só status terminais (Concluído/Pago/Em vigor/Sem obrigatoriedade/Arquivado/Isento) — esses não precisam de próxima atualização.', itensTodos.length, itens.length, q)}
    </div>`;
  };

  // ==========================================================================
  //  AUDITORIA 2: Próxima atualização já VENCIDA
  //  A data de próxima atualização foi definida mas já passou — ciclo estourou
  //  e ninguém reagendou. Crítico: acompanhamento atrasado.
  // ==========================================================================
  window._auditProxVencidaItens = function(){
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
      if (!_passaEscopo(a)) return false;
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
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados${window._auditProxSoMeu?' <span class="text-amber-600 font-medium">(filtro: seus alvarás)</span>':' <span class="text-slate-400">· base inteira</span>'}</p>
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
        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none" title="Filtra só os alvarás em que você é o responsável">
          <input type="checkbox" id="intel-so-meu" ${window._auditProxSoMeu?'checked':''} class="w-4 h-4 rounded"> Só os meus
        </label><div class="h-6 w-px bg-slate-200"></div>
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
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="text-xs text-slate-500">${grupos.length} empresa(s) · ${itens.length} vencida(s)</div>
          <div class="flex items-center gap-2">
            <button id="intel-expandir-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Expandir todos</button>
            <span class="text-slate-300">·</span>
            <button id="intel-recolher-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Recolher todos</button>
          </div>
        </div>
        <div class="space-y-2">
          ${grupos.map(function(g, gi){
            var gkey = String(g.id!=null?g.id:('r'+gi));
            var aberto = !!window._intelGruposAbertos[gkey];
            return `<div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-red-500">
              <div class="intel-toggle flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100" data-gkey="${gkey}">
                <span class="shrink-0 text-slate-400 text-xs ${aberto?'rotate-90':''}" style="display:inline-block">▶</span>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-slate-800 truncate">${_esc(g.nome)}</div>
                  <div class="text-[11px] text-slate-500 truncate">${_esc(g.cidade||'')}${g.responsavel?' · 👤 '+_esc(g.responsavel):''}</div>
                </div>
                <span class="shrink-0 bg-red-100 text-red-700 text-xs font-bold rounded-full px-3 py-1">${g.itens.length} vencida(s)</span>
                ${g.id!=null ? `<button class="intel-open shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700" data-eid="${g.id}" title="Abrir a empresa">Abrir empresa</button>` : ''}
              </div>
              ${!aberto ? '' : `
              <!-- barra de aplicação em MASSA (reagendar todos de uma vez) -->
              <div class="flex flex-wrap items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-100">
                <span class="text-[11px] font-bold text-blue-700 uppercase">⚡ Reagendar todos:</span>
                <input type="date" class="intel-massa-inp text-xs text-slate-700 bg-white border border-slate-200 rounded px-2 py-1 focus:outline-none focus:border-blue-500" data-gkey="${gkey}" min="${_minIso()}" value="">
                <button class="intel-massa-btn px-3 py-1 bg-blue-600 text-white rounded text-[11px] font-bold hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed" data-gkey="${gkey}" disabled>Aplicar aos ${g.itens.length}</button>
                <span class="text-[11px] text-blue-600">define a mesma nova data de próxima atualização para todos os vencidos desta empresa</span>
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
              </div>`}
            </div>`;
          }).join('')}
        </div>
      `}
      ${_rodapeTransparencia('Considera só alvarás com próxima atualização já preenchida e vencida, em status não-terminal.', todos.length, itens.length, q)}
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
      ${(function(){
        var totAtivas = ((typeof state!=='undefined' && state.empresas)?state.empresas:[]).filter(function(e){ return e && (e.status||'').toUpperCase()==='ATIVO'; }).length;
        return `<div class="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-3 flex flex-wrap gap-x-4 gap-y-1">
          <span><b class="text-slate-600">${todos.length}</b> empresa(s) sem responsável</span>
          <span>de <b class="text-slate-600">${totAtivas}</b> empresa(s) ativa(s)</span>
          <span class="w-full text-slate-300">Considera apenas empresas ATIVAS. Todas as ativas são verificadas.</span>
        </div>`;
      })()}
    </div>`;
  }

  // ==========================================================================
  //  ITENS das auditorias 4, 5, 6 (alvarás)
  // ==========================================================================
  var DIAS = 864e5;
  function _hojeZero(){ var h=new Date(); h.setHours(0,0,0,0); return h; }

  // AUD 4 — vencidos há +30 dias (crônico), status não-terminal
  window._auditVencidos30Itens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var hoje = _hojeZero();
    return alvaras.filter(function(a){
      if (!a || !a.vencimento) return false;
      // "Sem obrigatoriedade" nunca é problema. Demais status terminais (incl.
      // Concluído/Pago/Arquivado) SÓ são ignorados se já houver próxima
      // atualização agendada — se venceu e ninguém reagendou, é atraso crônico
      // e DEVE aparecer, independente do status.
      if (/^sem obrigat/i.test(a.status||'')) return false;
      if (a.status && TERMINAIS.test(a.status) && !_proxVazia(a.proxima_atualizacao)) return false;
      var d = (typeof parseDataBR==='function') ? parseDataBR(a.vencimento) : null;
      if (!d) return false; d.setHours(0,0,0,0);
      if (Math.round((hoje - d)/DIAS) <= 30) return false; // só os vencidos há +30d
      if (!_passaEscopo(a)) return false;
      return true;
    }).sort(function(x,y){ return (parseDataBR(x.vencimento)||0) - (parseDataBR(y.vencimento)||0); });
  };

  // AUD 5 — alvará SEM status (falha de cadastro)
  window._auditSemStatusItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a) return false;
      if (a.status && String(a.status).trim() !== '') return false;
      if (!_passaEscopo(a)) return false;
      return true;
    });
  };

  // AUD 6 — status desatualizado: venceu mas o status não virou "Vencido"
  //         (nem é terminal). Sinaliza status que precisa ser revisado.
  window._auditStatusDesatualizadoItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var hoje = _hojeZero();
    return alvaras.filter(function(a){
      if (!a || !a.vencimento || !a.status) return false;
      if (TERMINAIS.test(a.status)) return false;      // terminal: ok
      if (/^vencido/i.test(a.status)) return false;    // já marcado como vencido: ok
      var d = (typeof parseDataBR==='function') ? parseDataBR(a.vencimento) : null;
      if (!d) return false; d.setHours(0,0,0,0);
      if (d >= hoje) return false;                      // ainda não venceu
      if (!_passaEscopo(a)) return false;
      return true;
    }).sort(function(x,y){ return (parseDataBR(x.vencimento)||0) - (parseDataBR(y.vencimento)||0); });
  };

  // ===================== PACOTE OPERACIONAL =====================
  // Alvarás travados por status operacional (não-terminal). Uma auditoria genérica
  // parametrizada por regex de status.
  function _alvarasPorStatus(re){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a || !a.status) return false;
      if (!re.test(a.status)) return false;
      if (!_passaEscopo(a)) return false;
      return true;
    });
  }
  window._auditParalisadoItens   = function(){ return _alvarasPorStatus(/paralisad/i); };
  window._auditAguardClienteItens= function(){ return _alvarasPorStatus(/aguardando cliente/i); };
  window._auditSemRegistroItens  = function(){ return _alvarasPorStatus(/sem registro/i); };
  window._auditNaoPagoItens      = function(){ return _alvarasPorStatus(/n[ãa]o pago/i); };

  // ===================== PACOTE PROATIVIDADE =====================
  // vence em ≤30 dias E ainda sem próxima atualização (risco duplo)
  window._auditVenceBreveSemProxItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var hoje = _hojeZero();
    return alvaras.filter(function(a){
      if (!a || !a.vencimento) return false;
      if (a.status && TERMINAIS.test(a.status)) return false;
      if (!_proxVazia(a.proxima_atualizacao)) return false;
      var d = parseDataBR(a.vencimento); if (!d) return false; d.setHours(0,0,0,0);
      var dias = Math.round((d - hoje)/DIAS);
      if (dias < 0 || dias > 30) return false;
      if (!_passaEscopo(a)) return false;
      return true;
    }).sort(function(x,y){ return (parseDataBR(x.vencimento)||0) - (parseDataBR(y.vencimento)||0); });
  };
  // próxima atualização preenchida mas SEM vencimento (incoerência lógica)
  window._auditProxSemVencItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    return alvaras.filter(function(a){
      if (!a) return false;
      if (_proxVazia(a.proxima_atualizacao)) return false;      // precisa ter próx.
      if (a.vencimento && String(a.vencimento).trim()) return false; // e NÃO ter venc
      if (a.status && TERMINAIS.test(a.status)) return false;
      if (!_passaEscopo(a)) return false;
      return true;
    });
  };

  // ===================== PACOTE INTEGRIDADE =====================
  // alvará apontando p/ empresa inexistente
  window._auditOrfaosItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var empresas = (typeof state!=='undefined' && state.empresas) ? state.empresas : [];
    var ids = {}; empresas.forEach(function(e){ if(e) ids[e.id]=true; });
    return alvaras.filter(function(a){
      if (!a) return false;
      if (a.empresa_id == null) return true;             // sem empresa_id = órfão
      if (!ids[a.empresa_id]) return true;               // empresa não existe
      return false;
    });
  };
  // responsável do alvará que não existe na lista de usuários
  function _nomesUsuarios(){
    var us = (typeof state!=='undefined' && state.usuarios) ? state.usuarios : [];
    var arr = Array.isArray(us) ? us : Object.values(us||{});
    var set = {};
    arr.forEach(function(u){ if(!u) return; if(u.nome) set[String(u.nome).trim().toLowerCase()]=true; if(u.email) set[String(u.email).trim().toLowerCase()]=true; });
    return set;
  }
  window._auditRespInvalidoItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var validos = _nomesUsuarios();
    var temUsuarios = Object.keys(validos).length > 0;
    if (!temUsuarios) return []; // sem lista de usuários carregada, não dá pra auditar
    return alvaras.filter(function(a){
      if (!a || !a.responsavel || !String(a.responsavel).trim()) return false; // vazio é outra auditoria
      return !validos[String(a.responsavel).trim().toLowerCase()];
    });
  };
  // cache a.empresa/a.cidade divergente do cadastro atual da empresa
  window._auditCacheDesatualizadoItens = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var empresas = (typeof state!=='undefined' && state.empresas) ? state.empresas : [];
    var byId = {}; empresas.forEach(function(e){ if(e) byId[e.id]=e; });
    return alvaras.filter(function(a){
      if (!a || a.empresa_id == null) return false;
      var e = byId[a.empresa_id]; if (!e) return false; // órfão é outra auditoria
      var nomeDif = a.empresa && e.nome && String(a.empresa).trim() !== String(e.nome).trim();
      var cidadeDif = a.cidade && e.cidade && String(a.cidade).trim() !== String(e.cidade).trim();
      return !!(nomeDif || cidadeDif);
    });
  };

  // ---- renderer GENÉRICO p/ auditorias que listam alvarás agrupados por empresa
  //      cfg: {titulo, icone, cor, itensFn, explica, colBadge(a)->{txt,cor}}
  function _renderAuditListaAlvaras(cfg){
    var q = (window._auditProxBusca || '').trim().toLowerCase();
    var todos = cfg.itensFn();
    var itens = !q ? todos : todos.filter(function(a){
      return ((a.empresa||'')+' '+(a.cidade||'')+' '+(a.responsavel||'')+' '+(a.tipo||'')+' '+(a.status||'')).toLowerCase().indexOf(q)>=0;
    });
    var empresasAfetadas = new Set(itens.map(function(a){ return a.empresa_id!=null?a.empresa_id:a.empresa; })).size;
    var respAfetados = new Set(itens.map(function(a){ return a.responsavel||'(sem)'; })).size;
    var grupos = _agruparPorEmpresa(itens);
    var kpis = [
      {l: cfg.kpiLabel || 'Alvarás apontados', v: itens.length, c: cfg.cor, sub: cfg.kpiSub || 'precisam de revisão'},
      {l:'Empresas afetadas', v: empresasAfetadas, c:'amber', sub:'com ocorrência'},
      {l:'Responsáveis envolvidos', v: respAfetados, c:'blue', sub:'no escopo'}
    ];
    return `
    <div class="p-6">
      <button class="intel-voltar inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Centro de Inteligência</button>
      <div class="flex flex-wrap items-center justify-between gap-3 mb-1">
        <div>
          <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">${cfg.icone} ${_esc(cfg.titulo)}</h1>
          <p class="text-sm text-slate-500 mt-0.5">Auditoria de qualidade de dados${window._auditProxSoMeu?' <span class="text-amber-600 font-medium">(filtro: seus alvarás)</span>':' <span class="text-slate-400">· base inteira</span>'}</p>
        </div>
      </div>
      <div class="bg-${cfg.cor}-50 border border-${cfg.cor}-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">${cfg.emoji||'⚠️'}</div>
        <div class="text-sm text-${cfg.cor}-900">${cfg.explica}</div>
      </div>
      <div class="grid grid-cols-3 gap-3 mb-5">
        ${kpis.map(function(k){ return `<div class="bg-white p-4 rounded-xl shadow-sm border-l-4 border-${k.c}-500">
          <div class="text-[10px] font-semibold text-slate-500 uppercase tracking-wide">${k.l}</div>
          <div class="text-3xl font-bold text-slate-800 mt-1 leading-tight">${k.v}</div>
          <div class="text-[11px] text-slate-500 mt-0.5">${k.sub}</div>
        </div>`; }).join('')}
      </div>
      <div class="bg-white rounded-xl shadow-sm p-3 mb-4 flex flex-wrap items-center gap-3">
        <label class="flex items-center gap-2 text-sm text-slate-700 cursor-pointer select-none" title="Filtra só os alvarás em que você é o responsável">
          <input type="checkbox" id="intel-so-meu" ${window._auditProxSoMeu?'checked':''} class="w-4 h-4 rounded"> Só os meus
        </label>
        <div class="h-6 w-px bg-slate-200"></div>
        <div class="flex-1 min-w-[180px]">
          <input id="intel-busca" type="text" value="${_esc(window._auditProxBusca||'')}" placeholder="🔎 Filtrar por empresa, cidade, responsável, tipo..." class="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:border-blue-500">
        </div>
        <button id="intel-export" class="px-3 py-1.5 bg-emerald-50 text-emerald-700 rounded-lg text-sm font-medium hover:bg-emerald-100">⬇️ Exportar CSV</button>
      </div>
      ${itens.length === 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-12 text-center">
          <div class="text-5xl mb-3">🎉</div>
          <div class="text-lg font-bold text-slate-800">Nada apontado!</div>
          <div class="text-sm text-slate-500 mt-1">${q?'(no filtro atual) ':''}${_esc(cfg.vazio||'Nenhuma ocorrência encontrada.')}</div>
        </div>
      ` : `
        <div class="flex items-center justify-between mb-2 px-1">
          <div class="text-xs text-slate-500">${grupos.length} empresa(s) · ${itens.length} alvará(s)</div>
          <div class="flex items-center gap-2">
            <button id="intel-expandir-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Expandir todos</button>
            <span class="text-slate-300">·</span>
            <button id="intel-recolher-todos" class="text-xs font-semibold text-blue-600 hover:text-blue-800">Recolher todos</button>
          </div>
        </div>
        <div class="space-y-2">
          ${grupos.map(function(g, gi){
            var gkey = String(g.id!=null?g.id:('r'+gi));
            var aberto = !!window._intelGruposAbertos[gkey];
            return `<div class="bg-white rounded-xl shadow-sm overflow-hidden border-l-4 border-${cfg.cor}-500">
              <div class="intel-toggle flex items-center gap-3 px-4 py-3 bg-slate-50 border-b border-slate-100 cursor-pointer select-none hover:bg-slate-100" data-gkey="${gkey}">
                <span class="shrink-0 text-slate-400 text-xs ${aberto?'rotate-90':''}" style="display:inline-block">▶</span>
                <div class="flex-1 min-w-0">
                  <div class="font-bold text-slate-800 truncate">${_esc(g.nome)}</div>
                  <div class="text-[11px] text-slate-500 truncate">${_esc(g.cidade||'')}${g.responsavel?' · 👤 '+_esc(g.responsavel):''}</div>
                </div>
                <span class="shrink-0 bg-${cfg.cor}-100 text-${cfg.cor}-700 text-xs font-bold rounded-full px-3 py-1">${g.itens.length}</span>
                ${g.id!=null ? `<button class="intel-open shrink-0 px-3 py-1.5 bg-blue-600 text-white rounded-lg text-xs font-semibold hover:bg-blue-700" data-eid="${g.id}" title="Abrir a empresa">Abrir empresa</button>` : ''}
              </div>
              ${!aberto ? '' : `
              <div class="divide-y divide-slate-50">
                ${g.itens.map(function(a){
                  var badge = cfg.colBadge ? cfg.colBadge(a) : null;
                  return `<div class="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm hover:bg-slate-50">
                    <div class="flex-1 min-w-0">
                      <span class="font-medium text-slate-700">${_esc(a.tipo||'(sem tipo)')}</span>
                      <span class="ml-2 text-[10px] uppercase tracking-wide text-slate-400">${_esc(a.status||'(sem status)')}</span>
                    </div>
                    <span class="shrink-0 text-xs text-slate-500">venc: <b class="text-slate-700">${_esc(a.vencimento||'—')}</b></span>
                    ${badge?`<span class="shrink-0 text-[10px] font-bold text-${badge.cor}-600 bg-${badge.cor}-50 rounded px-2 py-0.5">${_esc(badge.txt)}</span>`:''}
                  </div>`;
                }).join('')}
              </div>`}
            </div>`;
          }).join('')}
        </div>
      `}
      ${_rodapeTransparencia(cfg.rodapeNota, todos.length, itens.length, q)}
    </div>`;
  }

  // Rodapé de transparência: mostra o universo auditado e o que foi filtrado,
  // para que NUNCA reste dúvida sobre "faltou empresa". Todo alvará no escopo é
  // contabilizado: apontado, ou excluído (com o motivo).
  function _rodapeTransparencia(nota, totalApontadoSemBusca, mostrados, q){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var universo = alvaras.filter(function(a){ return a && _passaEscopo(a); }).length;
    var apontados = totalApontadoSemBusca;
    var excluidos = universo - apontados;
    var escopoTxt = window._auditProxSoMeu ? 'seus alvarás' : 'base inteira';
    var filtroTxt = q ? '<b>'+mostrados+'</b> no filtro de busca atual' : '';
    return `<div class="mt-4 text-[11px] text-slate-400 border-t border-slate-100 pt-3 flex flex-wrap gap-x-4 gap-y-1">
      <span><b class="text-slate-600">${apontados}</b> apontado(s)</span>
      <span>de <b class="text-slate-600">${universo}</b> alvará(s) no escopo (${escopoTxt})</span>
      <span><b class="text-slate-600">${excluidos}</b> não se enquadram nesta auditoria</span>
      ${filtroTxt?`<span>${filtroTxt}</span>`:''}
      <span class="w-full text-slate-300">${_esc(nota||'Todo alvará no escopo é contabilizado — nenhum some silenciosamente.')}</span>
    </div>`;
  }

  // ==========================================================================
  //  PLACAR POR RESPONSÁVEL — painel-resumo de pendências por pessoa
  // ==========================================================================
  window._placarResponsaveis = function(){
    var alvaras = (typeof state!=='undefined' && state.alvaras) ? state.alvaras : [];
    var hoje = _hojeZero();
    var m = {};
    alvaras.forEach(function(a){
      if (!a) return;
      if (a.status && TERMINAIS.test(a.status)) return; // só alvarás vivos
      var r = (a.responsavel && String(a.responsavel).trim()) || '(sem responsável)';
      if (!m[r]) m[r] = {resp:r, ativos:0, semProx:0, vencidos:0, semStatus:0, comFalha:0};
      var s = m[r];
      s.ativos++;
      var falha = false;
      if (_proxVazia(a.proxima_atualizacao)) { s.semProx++; falha = true; }
      if (!a.status || !String(a.status).trim()) { s.semStatus++; falha = true; }
      var d = parseDataBR(a.vencimento);
      if (d) { d.setHours(0,0,0,0); if (d < hoje) { s.vencidos++; falha = true; } }
      if (falha) s.comFalha++; // alvarás DISTINTOS com ao menos uma pendência
    });
    return Object.values(m).map(function(s){
      s.pendencias = s.semProx + s.vencidos + s.semStatus; // total de ocorrências
      // saúde = % de alvarás SEM nenhuma falha (por alvará distinto, não satura)
      s.saude = s.ativos ? Math.round(100 * (s.ativos - s.comFalha) / s.ativos) : 100;
      if (s.saude < 0) s.saude = 0;
      return s;
    }).sort(function(a,b){ return b.comFalha - a.comFalha; });
  };

  function _renderPlacar(){
    var linhas = window._placarResponsaveis();
    var totalPend = linhas.reduce(function(s,l){ return s + l.pendencias; }, 0);
    var barra = function(v, cor){ return '<div class="h-1.5 rounded-full bg-'+cor+'-500" style="width:'+Math.min(100,v)+'%"></div>'; };
    return `
    <div class="p-6">
      <button class="intel-voltar inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-blue-600 mb-3">← Centro de Inteligência</button>
      <div class="mb-1">
        <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">🏅 Placar por Responsável</h1>
        <p class="text-sm text-slate-500 mt-0.5">Visão de carteira · pendências de qualidade de dados por pessoa</p>
      </div>
      <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 my-5 flex items-start gap-3">
        <div class="text-2xl leading-none">📊</div>
        <p class="text-sm text-blue-900 m-0">Resumo por responsável das pendências que as auditorias apontam: alvarás <b>sem próxima atualização</b>, <b>vencidos</b> e <b>sem status</b>. Use para distribuir esforço e acompanhar quem está com a carteira mais em dia.</p>
      </div>
      ${linhas.length === 0 ? `<div class="bg-white rounded-xl shadow-sm p-12 text-center"><div class="text-5xl mb-3">🎉</div><div class="text-lg font-bold text-slate-800">Sem pendências!</div></div>` : `
      <div class="bg-white rounded-xl shadow-sm overflow-hidden">
        <div class="grid grid-cols-12 gap-2 px-4 py-2.5 bg-slate-50 border-b border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
          <div class="col-span-3">Responsável</div>
          <div class="col-span-2 text-center">Ativos</div>
          <div class="col-span-1 text-center">S/ próx</div>
          <div class="col-span-1 text-center">Vencidos</div>
          <div class="col-span-1 text-center">S/ status</div>
          <div class="col-span-1 text-center">Pend.</div>
          <div class="col-span-3">Saúde da carteira</div>
        </div>
        <div class="divide-y divide-slate-50">
          ${linhas.map(function(l){
            var cor = l.saude >= 90 ? 'emerald' : (l.saude >= 70 ? 'amber' : 'rose');
            return `<div class="grid grid-cols-12 gap-2 px-4 py-3 items-center text-sm hover:bg-slate-50">
              <div class="col-span-3 font-semibold text-slate-700 truncate">👤 ${_esc(l.resp)}</div>
              <div class="col-span-2 text-center text-slate-600">${l.ativos}</div>
              <div class="col-span-1 text-center ${l.semProx?'text-rose-600 font-bold':'text-slate-300'}">${l.semProx}</div>
              <div class="col-span-1 text-center ${l.vencidos?'text-red-600 font-bold':'text-slate-300'}">${l.vencidos}</div>
              <div class="col-span-1 text-center ${l.semStatus?'text-amber-600 font-bold':'text-slate-300'}">${l.semStatus}</div>
              <div class="col-span-1 text-center"><span class="inline-block bg-${cor}-100 text-${cor}-700 text-xs font-bold rounded-full px-2 py-0.5">${l.pendencias}</span></div>
              <div class="col-span-3 flex items-center gap-2">
                <div class="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">${barra(l.saude, cor)}</div>
                <span class="text-xs font-bold text-${cor}-600 w-9 text-right">${l.saude}%</span>
              </div>
            </div>`;
          }).join('')}
        </div>
      </div>
      <p class="text-xs text-slate-400 mt-3">Total de ${totalPend} pendência(s) em ${linhas.length} responsável(is). Saúde = % de alvarás ativos sem pendência de dados.</p>
      `}
    </div>`;
  }

  window.attachInteligencia = function(){
    // navegação hub <-> auditoria (limpa a busca ao trocar de tela p/ não vazar filtro)
    document.querySelectorAll('.intel-abrir').forEach(function(b){
      // ao abrir uma auditoria: limpa busca e recolhe todos os grupos (começa recolhido)
      b.onclick = function(){ window._auditProxBusca = ''; window._intelGruposAbertos = {}; window._intelAuditoria = b.dataset.audit; render(); };
    });
    var voltar = document.querySelector('.intel-voltar');
    if (voltar) voltar.onclick = function(){ window._auditProxBusca = ''; window._intelGruposAbertos = {}; window._intelAuditoria = null; render(); };

    document.querySelectorAll('.intel-group').forEach(function(b){
      b.onclick = function(){ window._auditProxAgrupar = b.dataset.g; render(); };
    });
    var soMeu = document.getElementById('intel-so-meu');
    if (soMeu) soMeu.onclick = function(){ window._auditProxSoMeu = soMeu.checked; render(); };
    document.querySelectorAll('.intel-open').forEach(function(b){
      b.onclick = function(ev){ if(ev) ev.stopPropagation(); var id = b.dataset.eid; if (id != null) setState({empresaAtiva: isNaN(+id)?id:+id}); };
    });
    // accordion: recolher/expandir grupos (recolhido por padrão)
    document.querySelectorAll('.intel-toggle').forEach(function(h){
      h.onclick = function(ev){
        if (ev && ev.target.closest('.intel-open')) return; // clique no botão "Abrir empresa" não togglea
        var k = h.dataset.gkey;
        window._intelGruposAbertos[k] = !window._intelGruposAbertos[k];
        render();
      };
    });
    var expTodos = document.getElementById('intel-expandir-todos');
    if (expTodos) expTodos.onclick = function(){
      document.querySelectorAll('.intel-toggle').forEach(function(h){ window._intelGruposAbertos[h.dataset.gkey] = true; });
      render();
    };
    var recTodos = document.getElementById('intel-recolher-todos');
    if (recTodos) recTodos.onclick = function(){ window._intelGruposAbertos = {}; render(); };
    // aplicar data em MASSA por grupo
    document.querySelectorAll('.intel-massa-inp').forEach(function(inp){
      var btn = document.querySelector('.intel-massa-btn[data-gkey="'+inp.dataset.gkey+'"]');
      var sync = function(){ if (btn) btn.disabled = !inp.value; };
      inp.oninput = sync; inp.onchange = sync;
    });
    document.querySelectorAll('.intel-massa-btn').forEach(function(btn){
      btn.onclick = function(){
        var inp = document.querySelector('.intel-massa-inp[data-gkey="'+btn.dataset.gkey+'"]');
        if (!inp || !inp.value) { alert('Escolha a data para aplicar em massa.'); return; }
        // coleta os ids do grupo (os inputs individuais dentro do mesmo card)
        var card = btn.closest('.bg-white');
        var ids = [];
        if (card) card.querySelectorAll('.intel-prox-inp').forEach(function(i){ ids.push(i.dataset.aid); });
        if (!ids.length) { alert('Nenhum alvará neste grupo.'); return; }
        if (!confirm('Aplicar ' + inp.value.split('-').reverse().join('/') + ' como próxima atualização em ' + ids.length + ' alvará(s)?\n\n(Alvarás que violarem a regra de data — ex.: 10 dias antes do vencimento — serão pulados.)')) return;
        window._auditSalvarProxMassa(ids, inp.value);
      };
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

  // Se o app já estiver na aba Inteligência quando ESTE módulo terminar de
  // carregar (ele é o último <script>), re-renderiza para trocar o placeholder
  // "Carregando…" pela tela real. Evita a corrida que causava
  // "renderInteligencia is not defined".
  try {
    if (typeof state !== 'undefined' && state && state.page === 'inteligencia' && typeof render === 'function') {
      render();
    }
  } catch(e){}
})();
