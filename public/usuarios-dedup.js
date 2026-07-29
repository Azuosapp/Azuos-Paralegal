/* Azuos Paralegal — v6.1.10
   Consolida cadastros duplicados da MESMA pessoa (migracao de e-mail).

   Contexto: quem migrou da caixa @azuoscontabil para o e-mail pessoal teve o
   cadastro consolidado (v6.0.44), mas varios pontos re-semeavam o registro antigo
   comparando SO o e-mail — recriando um segundo cadastro da mesma pessoa. Esses
   pontos foram corrigidos com _azuosOficialJaExiste. Este modulo cuida do que
   ficou para tras: a duplicata JA gravada no Firestore.

   Duas regras existem para nao errar feio:

   1) "Vazio" e medido SO por chaves EXCLUSIVAS do registro (e-mail e id), nunca
      pelo nome. As duplicatas de uma pessoa tem, por definicao, o MESMO nome —
      e ha ciencias gravadas com chave NOME no sistema. Considerar o nome fazia
      os dois registros parecerem "com dados" e o modulo nao removia nada.

   2) So removemos a duplicata quando o e-mail dela e um endereco OFICIAL
      conhecido que aponta para o mesmo nome do registro que fica. Isso e
      exatamente o caso da migracao. Sem essa condicao, dois HOMONIMOS
      (duas Camilas, pessoas diferentes) seriam fundidos e uma delas sumiria.

   Nada de ciencias e apagado: as chaves de ciencia do registro removido ou estao
   vazias (regra 1) ou sao a chave de NOME, que continua valendo para quem fica.

   Mora em public/ (e nao como IIFE no index.html) por causa do congelamento
   anti-remendo de scripts/validate-html.js. */
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

  // Chaves EXCLUSIVAS do registro. O nome fica de fora de proposito (regra 1).
  function chavesProprias(u) {
    return [u && u.email, u && u.id].filter(Boolean).map(function (k) { return String(k); });
  }

  function temCiencias(u) {
    try {
      var c = state.ciencias_por_usuario || {};
      return chavesProprias(u).some(function (k) { return Array.isArray(c[k]) && c[k].length > 0; });
    } catch (e) { return false; }
  }

  function temFoto(u) { return !!(u && u.foto && String(u.foto).length > 30); }
  function vazio(u) { return !temFoto(u) && !temCiencias(u); }

  // regra 2: o e-mail do candidato e um endereco oficial da MESMA pessoa?
  function eAliasOficialDe(candidato, principal) {
    try {
      if (typeof _azuosOficialPorEmail !== 'function') return false;
      var of = _azuosOficialPorEmail(String((candidato && candidato.email) || '').toLowerCase().trim());
      if (!of || !of.nome) return false;
      return norm(of.nome) === norm(principal && principal.nome);
    } catch (e) { return false; }
  }

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

        var descartar = [], mantidos = [];
        g.forEach(function (u) {
          if (u === principal) return;
          if (vazio(u) && eAliasOficialDe(u, principal)) descartar.push(u);
          else mantidos.push(u);
        });

        if (mantidos.length) {
          console.warn('[v6.1.10] "' + principal.nome + '" tem mais de um cadastro que eu NAO vou juntar '
            + '(pode ser outra pessoa com o mesmo nome, ou ha dados dentro). Resolva em Usuarios. E-mails:',
            [principal.email].concat(mantidos.map(function (u) { return u.email; })));
        }
        if (!descartar.length) return;

        state.usuarios = state.usuarios.filter(function (u) { return descartar.indexOf(u) < 0; });
        mudou = true;
        console.log('[v6.1.10] cadastro duplicado removido de "' + principal.nome + '": '
          + descartar.map(function (u) { return u.email; }).join(', ')
          + ' (ficou ' + principal.email + ')');
      });

      if (mudou) {
        try { if (typeof _fsWriteDebounced === 'function') _fsWriteDebounced(); } catch (e) {}
        try { if (typeof window._salvarUsuariosFirestore === 'function') window._salvarUsuariosFirestore(); } catch (e) {}
        try { if (typeof renderApp === 'function') renderApp(); } catch (e) {}
      }
    } catch (e) { console.warn('[v6.1.10] consolidar:', e); }
  }

  // Depois do state carregar do Firestore e depois do re-semeio dos oficiais rodar.
  try {
    setTimeout(rodar, 9000);
    setTimeout(rodar, 20000);
  } catch (e) {}

  window._consolidarUsuariosDuplicados = rodar;
})();
