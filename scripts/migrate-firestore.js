/**
 * Fase 1 — Migration: campos pesados → subcoleções
 *
 * Como executar:
 *   1. Abra https://azuos-paralegal.web.app logado como contato@azuoscontabil.com.br
 *   2. F12 → Console
 *   3. Cole esse arquivo INTEIRO no console
 *   4. Rode: migrateFase1()
 *
 * O que faz:
 *   - Backup completo em azuos/snapshots/pre_v6_<ts>
 *   - Lê azuos/shared
 *   - Cria azuos/ciencias/<emailHash> para cada usuario
 *   - Cria azuos/edicoes_alvaras/<alvId> para cada alvará editado
 *   - NÃO remove campos legados ainda (compatibilidade)
 *
 * Idempotente: pode rodar múltiplas vezes sem corromper dados.
 */

window.migrateFase1 = async function() {
  if (!firebase || !firebase.firestore) {
    console.error('[migrate] Firebase não disponível');
    return;
  }
  const db = firebase.firestore();
  const userEmail = (state && state.sessao && state.sessao.email) || '';
  if (userEmail !== 'contato@azuoscontabil.com.br') {
    console.error('[migrate] Apenas admin contato@ pode rodar');
    return;
  }

  console.log('[migrate] === FASE 1 - INÍCIO ===');
  const ts = Date.now();
  const snapshotId = 'pre_v6_' + ts;

  // 1. Backup completo
  console.log('[migrate] 1/4 Lendo documento principal...');
  const snap = await db.collection('azuos').doc('shared').get();
  const data = snap.data();
  if (!data) { console.error('[migrate] Documento vazio!'); return; }
  console.log('[migrate] Documento principal carregado, tamanho ~', Math.round(JSON.stringify(data).length/1024), 'KB');

  console.log('[migrate] 2/4 Salvando backup em azuos/' + snapshotId);
  await db.collection('azuos').doc(snapshotId).set(data);
  console.log('[migrate] ✓ Backup salvo');

  // 2. Migrar ciencias_por_usuario
  const ciencias = data.ciencias_por_usuario || {};
  const emails = Object.keys(ciencias);
  console.log('[migrate] 3/4 Migrando ciências de ' + emails.length + ' usuários...');
  let okC = 0, errC = 0;
  for (const email of emails) {
    try {
      const hash = email.replace(/[^a-zA-Z0-9]/g, '_'); // hash simples e legível
      const entries = ciencias[email];
      // Dedup ao migrar
      let arr = entries;
      if (entries && typeof entries === 'object' && !Array.isArray(entries)) {
        arr = Object.values(entries);
      }
      const porKey = {};
      (arr || []).forEach(e => {
        if (!e || !e.key) return;
        const ex = porKey[e.key];
        if (!ex || (e.ciencia_em && ex.ciencia_em && e.ciencia_em > ex.ciencia_em)) {
          porKey[e.key] = e;
        }
      });
      const arrayDedup = Object.values(porKey);
      await db.collection('azuos').doc('ciencias').collection('por_usuario').doc(hash).set({
        email: email,
        entries: arrayDedup,
        migrated_at: new Date().toISOString(),
        original_count: arr?.length || 0,
        deduped_count: arrayDedup.length
      });
      okC++;
      console.log('[migrate]   ✓ ' + email + ': ' + (arr?.length||0) + ' → ' + arrayDedup.length);
    } catch(e) { errC++; console.warn('[migrate]   ✗ ' + email + ':', e.message); }
  }
  console.log('[migrate] Ciências: ' + okC + ' OK, ' + errC + ' erros');

  // 3. Migrar edicoes_alvaras
  const edicoes = data.edicoes_alvaras || {};
  const alvIds = Object.keys(edicoes);
  console.log('[migrate] 4/4 Migrando ' + alvIds.length + ' edições de alvarás...');
  let okE = 0, errE = 0;
  // Em batches de 50 pra não estourar
  const batch = db.batch();
  let batchCount = 0;
  for (const alvId of alvIds) {
    try {
      const docRef = db.collection('azuos').doc('edicoes').collection('alvaras').doc(String(alvId));
      const dados = edicoes[alvId];
      if (!dados) continue;
      batch.set(docRef, { ...dados, _migrated_at: new Date().toISOString() });
      batchCount++;
      if (batchCount >= 400) { // limite Firestore batch = 500
        await batch.commit();
        console.log('[migrate]   commit batch (' + batchCount + ' edições)');
        batchCount = 0;
      }
      okE++;
    } catch(e) { errE++; console.warn('[migrate]   ✗ alvId ' + alvId + ':', e.message); }
  }
  if (batchCount > 0) {
    await batch.commit();
    console.log('[migrate]   commit final (' + batchCount + ' edições)');
  }
  console.log('[migrate] Edições: ' + okE + ' OK, ' + errE + ' erros');

  // 4. Marca migração concluída
  await db.collection('azuos').doc('shared').update({
    _fase1_migrated_at: new Date().toISOString(),
    _fase1_snapshot: snapshotId
  });
  console.log('[migrate] === FASE 1 - CONCLUÍDA ===');
  console.log('[migrate] Backup em: azuos/' + snapshotId);
  console.log('[migrate] Ciências: azuos/ciencias/por_usuario/<emailHash>');
  console.log('[migrate] Edições: azuos/edicoes/alvaras/<alvId>');
  console.log('[migrate] Próximo passo: deploy do código com leitura dupla');
  return { ts, snapshotId, ciencias: {ok: okC, err: errC}, edicoes: {ok: okE, err: errE} };
};

console.log('[migrate] Script carregado. Rode: migrateFase1()');
