/* ============================================================================
   ZUZU — mascote da Azuos (arara azul de polo "TRILHA") no Paralegal.

   Porte fiel do componente Mascote.tsx da Trilha para vanilla JS (o Paralegal é
   SPA + módulos public/*.js, sem React). Módulo separado — NÃO é remendo IIFE.

   REGRA DE OURO (do código original do Zuzu): reage ao progresso, nunca
   atrapalha o foco. Aparece pra guiar, celebrar e acolher telas vazias — mas
   SOME em telas sérias (relatórios, gestão, financeiro). Por isso, no Paralegal
   ele entra só nos RESPIROS: login, estados vazios, celebração, erro. Nunca nas
   listas/tabelas/gráficos de trabalho.

   Uso:  window.zuzu({pose:'joinha', anim:'float', size:'md'})  -> string <img>
   ========================================================================== */
(function(){
  var POSE_SRC = {
    hero:      '/brand/mascote/zuzu-hero.png',
    asas:      '/brand/mascote/zuzu-asas.png',
    acenando:  '/brand/mascote/zuzu-acenando.png',
    joinha:    '/brand/mascote/zuzu-joinha.png',
    apontando: '/brand/mascote/zuzu-apontando.png',
    pensativo: '/brand/mascote/zuzu-pensativo.png',
    ideia:     '/brand/mascote/zuzu-ideia.png',
    laptop:    '/brand/mascote/zuzu-laptop.png',
    voando:    '/brand/mascote/zuzu-voando.png',
    debrucado: '/brand/mascote/zuzu-debrucado.png',
    festejando:  '/brand/mascote/zuzu-festejando.png',
    trofeu:      '/brand/mascote/zuzu-trofeu.png',
    dormindo:    '/brand/mascote/zuzu-dormindo.png',
    continencia: '/brand/mascote/zuzu-continencia.png',
    coracao:     '/brand/mascote/zuzu-coracao.png',
    lendo:       '/brand/mascote/zuzu-lendo.png',
    medalha:     '/brand/mascote/zuzu-medalha.png',
    segredo:     '/brand/mascote/zuzu-segredo.png',
    timido:      '/brand/mascote/zuzu-timido.png',
    moeda:       '/brand/mascote/zuzu-moeda.png',
    calculadora: '/brand/mascote/zuzu-calculadora.png',
    lupa:        '/brand/mascote/zuzu-lupa.png',
    alerta:      '/brand/mascote/zuzu-alerta.png',
    foguete:     '/brand/mascote/zuzu-foguete.png',
    relogio:     '/brand/mascote/zuzu-relogio.png',
    aperto:      '/brand/mascote/zuzu-aperto.png',
    confuso:     '/brand/mascote/zuzu-confuso.png',
    headset:     '/brand/mascote/zuzu-headset.png'
  };
  var SIZE_PX = { sm:64, md:112, lg:176, xl:260 };

  // injeta o CSS das animações uma única vez (portado 1:1 do globals.css da Trilha)
  function _injetaCSS(){
    if (document.getElementById('zuzu-anim-css')) return;
    var css = ''
      + '@keyframes zuzu-sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(4deg)}}'
      + '@keyframes zuzu-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}'
      + '@keyframes zuzu-wave{0%,100%{transform:rotate(0)}25%{transform:rotate(-5deg)}75%{transform:rotate(4deg)}}'
      + '@keyframes zuzu-celebrate{0%{transform:translateY(0) scale(1)}30%{transform:translateY(-14px) scale(1.06)}60%{transform:translateY(0) scale(1)}80%{transform:translateY(-6px) scale(1.02)}100%{transform:translateY(0) scale(1)}}'
      + '@keyframes zuzu-peek{from{transform:translateX(-32%);opacity:0}to{transform:translateX(0);opacity:1}}'
      + '@keyframes zuzu-breathe{0%,100%{transform:scale(1)}50%{transform:scale(1.03)}}'
      + '@keyframes zuzu-shy{0%,100%{transform:translateX(0) rotate(0)}20%{transform:translateX(-2px) rotate(-1.5deg)}60%{transform:translateX(2px) rotate(1.5deg)}}'
      + '@keyframes zuzu-pulse{0%,100%{transform:scale(1)}40%{transform:scale(1.07)}70%{transform:scale(0.98)}}'
      + '.zuzu-anim-sway{transform-origin:top center;animation:zuzu-sway 3.2s ease-in-out infinite}'
      + '.zuzu-anim-float{animation:zuzu-float 3s ease-in-out infinite}'
      + '.zuzu-anim-wave{transform-origin:bottom center;animation:zuzu-wave 2.6s ease-in-out infinite}'
      + '.zuzu-anim-celebrate{animation:zuzu-celebrate 1.1s ease-out both}'
      + '.zuzu-anim-peek{animation:zuzu-peek .5s ease-out both}'
      + '.zuzu-anim-breathe{animation:zuzu-breathe 3.6s ease-in-out infinite}'
      + '.zuzu-anim-shy{transform-origin:bottom center;animation:zuzu-shy 2.8s ease-in-out infinite}'
      + '.zuzu-anim-pulse{animation:zuzu-pulse 1.6s ease-in-out infinite}'
      + '@media (prefers-reduced-motion:reduce){.zuzu-anim-sway,.zuzu-anim-float,.zuzu-anim-wave,.zuzu-anim-celebrate,.zuzu-anim-peek,.zuzu-anim-breathe,.zuzu-anim-shy,.zuzu-anim-pulse{animation:none}}';
    var s = document.createElement('style');
    s.id = 'zuzu-anim-css';
    s.textContent = css;
    document.head.appendChild(s);
  }
  try { _injetaCSS(); } catch(e){}

  // gera o <img> do Zuzu. Fallback: se a arte faltar, o onerror esconde o
  // elemento (a tela nunca quebra por causa do mascote). Decorativo: sem eventos.
  window.zuzu = function(opts){
    opts = opts || {};
    var pose = POSE_SRC[opts.pose] ? opts.pose : 'acenando';
    var anim = opts.anim || 'none';
    var size = opts.size;
    var px = (typeof size === 'number') ? size : (SIZE_PX[size] || SIZE_PX.md);
    var animClass = (anim === 'none') ? '' : ('zuzu-anim-' + anim);
    var flip = opts.flip ? 'transform:scaleX(-1);' : '';
    var cls = (animClass + ' ' + (opts.className || '')).trim();
    var alt = opts.alt || 'Zuzu, o mascote da Azuos';
    return '<img src="' + POSE_SRC[pose] + '" alt="' + String(alt).replace(/"/g,'&quot;') + '"'
      + ' width="' + px + '" loading="lazy" draggable="false"'
      + ' onerror="this.style.display=\'none\'"'
      + (cls ? ' class="' + cls + '"' : '')
      + ' style="width:' + px + 'px;height:auto;pointer-events:none;user-select:none;' + flip + '">';
  };

  // helper de ESTADO VAZIO com o Zuzu (porte do EstadoVazio.tsx).
  // No paralegal reframa "nada aqui" numa pequena vitória. anim sempre float,
  // size sempre md — só a pose varia (comunica o tom).
  window.zuzuEstadoVazio = function(cfg){
    cfg = cfg || {};
    var pose = cfg.pose || 'pensativo';
    var titulo = cfg.titulo || 'Nada por aqui';
    var descricao = cfg.descricao || '';
    var acao = cfg.acao || '';
    var esc = (typeof window.esc === 'function') ? window.esc : function(s){ return String(s==null?'':s); };
    return '<div class="bg-white rounded-xl shadow-sm p-10 text-center flex flex-col items-center">'
      + '<div class="mb-3">' + window.zuzu({pose:pose, anim:'float', size:'md'}) + '</div>'
      + '<h3 class="text-lg font-bold text-slate-800">' + esc(titulo) + '</h3>'
      + (descricao ? '<p class="mt-1 max-w-sm text-sm text-slate-500">' + esc(descricao) + '</p>' : '')
      + (acao ? '<div class="mt-4">' + acao + '</div>' : '')
      + '</div>';
  };

  // ==========================================================================
  //  ZUZU DICAS — rodapé discreto e dispensável, presente em todas as telas.
  //  Mistura dicas de USO do sistema, BOAS PRÁTICAS de gestão e CONTEXTUAIS
  //  (por página). Não repete a mesma dica na mesma sessão; pode ser fechado.
  // ==========================================================================
  // dicas gerais (uso + boas práticas)
  var _DICAS_GERAIS = [
    '💡 No Centro de Inteligência, use "Aplicar em todos" pra agendar a próxima atualização de vários alvarás de uma vez.',
    '💡 Boa prática: agende a próxima atualização pelo menos 10 dias antes do vencimento — dá folga pra resolver.',
    '💡 O filtro "Só os meus" mostra apenas os alvarás da sua carteira em qualquer auditoria.',
    '💡 Clique no nome de uma empresa na auditoria pra abrir e corrigir direto.',
    '💡 A auditoria "Vencidos há +30 dias" mostra o atraso crônico — comece por ela pra desafogar.',
    '💡 Exporte qualquer auditoria em CSV pelo botão no topo da lista.',
    '💡 No Dashboard, clique numa fatia do gráfico pra ver as empresas por trás do número.',
    '💡 Agrupe a auditoria por Responsável pra ver rapidinho a carga de cada um.',
    '💡 Recolha os grupos das auditorias e expanda só a empresa que você vai tratar — a lista fica mais limpa.',
    '💡 O Placar por Responsável mostra a saúde da carteira de cada pessoa da equipe.'
  ];
  // dicas contextuais por página (state.page)
  var _DICAS_CTX = {
    empresas: ['💡 Use a busca por nome, CNPJ ou cidade pra achar uma empresa na hora.',
               '💡 Alterne entre visão Tabela e Cards no canto superior direito da lista.'],
    inteligencia: ['💡 Cada card do hub é uma auditoria diferente — o número mostra quantas pendências tem.',
                   '💡 Comece pelas auditorias com mais pendências pra ter mais impacto.'],
    dashboard: ['💡 Os números em cima das barras mostram o total de cada tipo de alvará.'],
    premiacao: ['💡 A Premiação conta os alvarás concluídos no mês — mantenha o status atualizado pra pontuar.'],
    resumo: ['💡 O Resumo do Dia já separa o que vence hoje, em 7 e em 30 dias pra você priorizar.'],
    novas: ['💡 Dê ciência nas novas empresas pra elas entrarem no seu fluxo de acompanhamento.']
  };

  function _dicaJaVistas(){
    try { return JSON.parse(window.sessionStorage.getItem('zuzu_dicas_vistas') || '[]'); } catch(e){ return []; }
  }
  function _marcaVista(t){
    try { var v=_dicaJaVistas(); v.push(t); window.sessionStorage.setItem('zuzu_dicas_vistas', JSON.stringify(v.slice(-30))); } catch(e){}
  }
  // escolhe uma dica: prioriza contextual da página, evita repetir na sessão.
  function _escolheDica(page, idx){
    var ctx = _DICAS_CTX[page] || [];
    var pool = ctx.concat(_DICAS_GERAIS);
    var vistas = _dicaJaVistas();
    var frescas = pool.filter(function(d){ return vistas.indexOf(d) < 0; });
    var lista = frescas.length ? frescas : pool; // se viu todas, recicla
    // idx determinístico (passado por quem renderiza) pra não usar Math.random
    var i = (typeof idx === 'number' ? idx : vistas.length) % lista.length;
    return lista[i];
  }

  // barra de dica: slim, bottom-center, dispensável. Fica escondida se o usuário
  // fechou nesta sessão. Retorna '' se dispensada.
  window.zuzuDicaBar = function(page, idx){
    try { if (window.sessionStorage.getItem('zuzu_dica_fechada') === '1') return ''; } catch(e){}
    var esc = (typeof window.esc === 'function') ? window.esc : function(s){ return String(s==null?'':s); };
    var dica = _escolheDica(page, idx);
    _marcaVista(dica);
    return '<div id="zuzu-dica-bar" class="fixed bottom-3 left-1/2 -translate-x-1/2 z-30 max-w-[520px] w-[calc(100%-220px)] min-w-[240px] flex items-center gap-2 bg-white/95 backdrop-blur border border-amber-200 shadow-lg rounded-full pl-1 pr-2 py-1" style="pointer-events:auto">'
      + '<div class="shrink-0">' + window.zuzu({pose:'ideia', anim:'float', size:34, alt:'Dica do Zuzu'}) + '</div>'
      + '<span class="flex-1 text-[12px] text-slate-600 truncate" title="' + esc(dica).replace(/"/g,'&quot;') + '">' + esc(dica) + '</span>'
      + '<button onclick="window.zuzuProxDica&&window.zuzuProxDica()" class="shrink-0 text-[11px] font-semibold text-amber-600 hover:text-amber-800 px-1" title="Próxima dica">↻</button>'
      + '<button onclick="window.zuzuFecharDica&&window.zuzuFecharDica()" class="shrink-0 text-slate-400 hover:text-slate-600 text-sm px-1" title="Fechar dicas por agora">✕</button>'
      + '</div>';
  };
  // fecha as dicas nesta sessão
  window.zuzuFecharDica = function(){
    try { window.sessionStorage.setItem('zuzu_dica_fechada','1'); } catch(e){}
    var el = document.getElementById('zuzu-dica-bar'); if (el) el.remove();
  };
  // troca pra próxima dica sem re-renderizar a tela toda
  window.zuzuProxDica = function(){
    var page = (typeof state!=='undefined' && state && state.page) || '';
    var idx = _dicaJaVistas().length; // avança
    var el = document.getElementById('zuzu-dica-bar');
    if (!el) return;
    var nova = window.zuzuDicaBar(page, idx);
    if (nova) { var tmp = document.createElement('div'); tmp.innerHTML = nova; el.replaceWith(tmp.firstChild); }
  };
})();
