/* ============================================================================
   DOMÍNIO GUARD — o sistema agora vive em paralegal.grupoazuos.com.br.
   Quem abrir o endereço antigo (azuos-paralegal.web.app / .firebaseapp.com) vê
   um aviso de mudança e é redirecionado — o app NÃO carrega no domínio antigo.

   Módulo separado (não é IIFE de remendo no index). Carrega ANTES de tudo, então
   o app nem chega a montar no domínio antigo. Para testar sem bloquear: ?force
   ========================================================================== */
(function(){
  try{
    var h = location.hostname || '';
    var NOVO = 'paralegal.grupoazuos.com.br';
    var ehAntigo = /(^|\.)azuos-paralegal\.web\.app$/i.test(h) || /(^|\.)azuos-paralegal\.firebaseapp\.com$/i.test(h);
    if(!ehAntigo) return;                          // domínio novo (ou local) → segue normal
    if(location.search.indexOf('force')>=0) return; // ?force pula o bloqueio (teste)
    var novoUrl = 'https://' + NOVO + '/';
    document.title = 'Novo endereço — AZUOS Paralegal';
    document.body.innerHTML =
      '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;'+
      'background:linear-gradient(135deg,#1B3A8C,#141f4d);font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif">'+
        '<div style="max-width:460px;width:100%;background:#fff;border-radius:24px;box-shadow:0 30px 60px -20px rgba(0,0,0,.5);padding:40px 32px;text-align:center">'+
          '<img src="'+novoUrl+'brand/mascote/zuzu-apontando.png" alt="Zuzu" style="width:120px;height:auto;margin:0 auto 12px;display:block" onerror="this.style.display=\'none\'">'+
          '<h1 style="font-size:22px;font-weight:800;color:#1e293b;margin:0 0 6px">Mudamos de endereço!</h1>'+
          '<p style="color:#64748b;font-size:14px;line-height:1.6;margin:0 0 8px">O AZUOS Paralegal agora funciona no endereço oficial:</p>'+
          '<div style="font-family:ui-monospace,Menlo,monospace;font-weight:700;color:#1B3A8C;background:#eef2fb;border:1px solid #d6e0f5;border-radius:10px;padding:10px 12px;margin:0 0 20px;word-break:break-all">'+NOVO+'</div>'+
          '<a href="'+novoUrl+'" style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;font-weight:700;font-size:15px;padding:13px 28px;border-radius:12px;box-shadow:0 10px 24px -8px rgba(37,99,235,.6)">Ir para o novo endereço →</a>'+
          '<p style="color:#94a3b8;font-size:12px;margin:18px 0 0">Atualize seus favoritos para o novo link.</p>'+
        '</div>'+
      '</div>';
    setTimeout(function(){ location.replace(novoUrl); }, 4000); // redireciona sozinho em 4s
    window.__AZUOS_BLOQUEADO__ = true;             // o app checa isso e não renderiza por cima
  }catch(e){}
})();
