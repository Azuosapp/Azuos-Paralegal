/* Azuos Paralegal — v6.1.9
   Consolida cadastros duplicados da MESMA pessoa (migracao de e-mail).

   Contexto: quem migrou da caixa @azuoscontabil para o e-mail pessoal teve o
   cadastro consolidado (v6.0.44), mas varios pontos re-semeavam o registro antigo
   comparando SO o e-mail — recriando um segundo cadastro da mesma pessoa. Esses
   pontos foram corrigidos com _azuosOficialJaExiste (casa por e-mail OU nome).
   Este modulo cuida do que ficou para tras: a duplicata JA gravada no Firestore.

   O registro re-semeado e tipicamente uma "casca": mesmo nome, e-mail antigo, sem
   foto e sem ciencias. Identidade partida faz contagens por responsavel/ciencia
   nao baterem.

   CONSERVADOR de proposito: so remove a duplicata quando ela nao tem nada dentro
   (sem foto e sem ciencias). Se as duas tiverem dados reais, nao mexe e avisa no
   console — nesse caso quem decide e o administrador. Nunca apaga ciencias: elas
   sao unidas na chave do registro que fica.

   Mora em public/ (e nao como IIFE no index.html) por causa do congelamento
   anti-remendo de scripts/validate-html.js: mudancas novas viram MODULO. */
'use strict';
(function () {
  function norm(s) {
    if (typeof _normId === 'function') return _normId(s);
    try {
      return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();
    } catch (e) {
      return String(s == null ? '' : s).trim().toLowerCase();
    }
  }

  function chavesCiencia(u) {
    return [u && u.email, u && u.id, u && u.nome].filter(Boolean).map(function (k) { return String(k); });
  }

  function temCiencias(u) {
    try {
      var c = state.ciencias_por_usuario || {};
      return chavesCiencia(u).some(function (k) { return Array.isArray(c[k]) && c[k].length > 0; });
    } catch (e) { return false; }
  }

  function temFoto(u) { return !!(u && u.foto && String(u.foto).length > 30); }
  function vazio(u) { return !temFoto(u) && !temCiencias(u); }

  function rodar() {
    try {
      if (typeof state === 'undefined' || !state) return;
      if (!Array.isArray(state.usuarios) || state.usuarios.length < 2) return;
      var sessaoEmail = String((state.sessao && state.sessao.email) || '').toLowerCase().trim();

      var grupos = {};
      state.usuarios.forEach(function (u) {
        if (!u || !u.nome) return;
        var k = norm(u.nome); if (!k) return;
        (grupos[k] = grupos[k] || []).push(u);
      });

      var mudou = false;
      Object.keys(grupos).forEach(function (k) {
        var g = grupos[k];
        if (g.length < 2) return;

        // Fica o registro com mais substancia: sessao atual > foto > ciencias > primeiro.
        function peso(u) {
          return (String(u.email || '').toLowerCase().trim() === sessaoEmail ? 8 : 0)
            + (temFoto(u) ? 4 : 0) + (temCiencias(u) ? 2 : 0) + (u.criadoEm ? 1 : 0);
        }
        var principal = g.slice().sort(function (a, b) { return peso(b) - peso(a); })[0];

        var descartar = g.filter(function (u) { return u !== principal && vazio(u); });
        var conflitantes = g.filter(function (u) { return u !== principal && !vazio(u); });

        if (conflitantes.length) {
          console.warn('[v6.1.9] "' + principal.nome + '" tem mais de um cadastro COM dados. '
            + 'Nao vou juntar sozinho — resolva em Usuarios. E-mails:',
            g.map(function (u) { return u.email; }));
        }
        if (!descartar.length) return;

        // Une as ciencias das cascas na chave que fica (aditivo: nada e apagado).
        try {
          var c = state.ciencias_por_usuario = state.ciencias_por_usuario || {};
          var destino = String(principal.email || principal.id || principal.nome);
          var uniao = Array.isArray(c[destino]) ? c[destino].slice() : [];
          descartar.forEach(function (u) {
            chavesCiencia(u).forEach(function (kk) {
              if (Array.isArray(c[kk])) c[kk].forEach(function (x) { if (uniao.indexOf(x) < 0) uniao.push(x); });
            });
          });
          if (uniao.length) c[destino] = uniao;
        } catch (e) {}

        state.usuarios = state.usuarios.filter(function (u) { return descartar.indexOf(u) < 0; });
        mudou = true;
        console.log('[v6.1.9] cadastro duplicado removido de "' + principal.nome + '": '
          + descartar.map(function (u) { return u.email; }).join(', ')
          + ' (ficou ' + principal.email + ')');
      });

      if (mudou) {
        try { if (typeof _fsWriteDebounced === 'function') _fsWriteDebounced(); } catch (e) {}
        try { if (typeof window._salvarUsuariosFirestore === 'function') window._salvarUsuariosFirestore(); } catch (e) {}
        try { if (typeof renderApp === 'function') renderApp(); } catch (e) {}
      }
    } catch (e) { console.warn('[v6.1.9] consolidar:', e); }
  }

  // Depois do state carregar do Firestore e depois do re-semeio dos oficiais rodar.
  try {
    setTimeout(rodar, 9000);
    setTimeout(rodar, 20000);
  } catch (e) {}

  window._consolidarUsuariosDuplicados = rodar;
})();
