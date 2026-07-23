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
    debrucado: '/brand/mascote/zuzu-debrucado.png'
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
      + '.zuzu-anim-sway{transform-origin:top center;animation:zuzu-sway 3.2s ease-in-out infinite}'
      + '.zuzu-anim-float{animation:zuzu-float 3s ease-in-out infinite}'
      + '.zuzu-anim-wave{transform-origin:bottom center;animation:zuzu-wave 2.6s ease-in-out infinite}'
      + '.zuzu-anim-celebrate{animation:zuzu-celebrate 1.1s ease-out both}'
      + '.zuzu-anim-peek{animation:zuzu-peek .5s ease-out both}'
      + '@media (prefers-reduced-motion:reduce){.zuzu-anim-sway,.zuzu-anim-float,.zuzu-anim-wave,.zuzu-anim-celebrate,.zuzu-anim-peek{animation:none}}';
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
})();
