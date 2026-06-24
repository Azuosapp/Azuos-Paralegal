/**
 * Utilitários puros — sem dependência de DOM ou Firebase.
 * Testáveis em Node sem mock.
 */

const STATUS_COMPLETOS_PATTERNS = [
  s => s === 'Concluído',
  s => s === 'Pago',
  s => s === 'Em vigor (vencimento)',
  s => /^formalizado/i.test(s),
  s => /^em andamento/i.test(s),
  s => s === 'Arquivado pelo cliente',
  s => s === 'Serviço paralisado',
  s => s === 'Isento',
  s => /^aguardando cliente/i.test(s),
];

/**
 * Calcula o andamento (% completo) de uma lista de alvarás.
 * Sem obrigatoriedade é ignorado do denominador.
 *
 * @param {Array<{status: string}>} alvaras
 * @returns {{pct: number, completos: number, total: number}}
 */
export function calcAndamento(alvaras) {
  const obrigatorios = (alvaras || []).filter(a => a && a.status && a.status !== 'Sem obrigatoriedade');
  if (obrigatorios.length === 0) return { pct: 0, completos: 0, total: 0 };
  const completos = obrigatorios.filter(a => STATUS_COMPLETOS_PATTERNS.some(p => p(a.status || '')));
  return {
    pct: Math.round(100 * completos.length / obrigatorios.length),
    completos: completos.length,
    total: obrigatorios.length
  };
}

/**
 * Parseia data no formato brasileiro dd/mm/aaaa.
 *
 * @param {string} s
 * @returns {Date|null}
 */
export function parseDataBR(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  return new Date(parseInt(y, 10), parseInt(mo, 10) - 1, parseInt(d, 10));
}

/**
 * Diferença em dias entre duas datas brasileiras.
 *
 * @param {string} dataA dd/mm/aaaa
 * @param {string} dataB dd/mm/aaaa
 * @returns {number|null} diferença em dias, ou null se inválido
 */
export function diffDiasBR(dataA, dataB) {
  const a = parseDataBR(dataA);
  const b = parseDataBR(dataB);
  if (!a || !b) return null;
  return Math.round((a - b) / (1000 * 60 * 60 * 24));
}

/**
 * Sanitiza um objeto removendo undefined (Firestore rejeita).
 * Converte undefined → ''. Funciona recursivamente.
 *
 * @param {any} obj
 * @returns {any}
 */
export function sanitizarFirestore(obj) {
  if (obj === null || obj === undefined) return '';
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sanitizarFirestore);
  const o = {};
  Object.keys(obj).forEach(k => {
    const v = obj[k];
    if (v === undefined) o[k] = '';
    else if (typeof v === 'object' && v !== null) o[k] = sanitizarFirestore(v);
    else o[k] = v;
  });
  return o;
}

/**
 * Hash determinístico de email para usar como ID em subcoleção Firestore.
 *
 * @param {string} email
 * @returns {string}
 */
export function hashEmail(email) {
  return (email || '').replace(/[^a-zA-Z0-9]/g, '_');
}

/**
 * Deduplica array de ciências pela chave (key), mantendo a mais recente.
 *
 * @param {Array<{key: string, ciencia_em: string}>} arr
 * @returns {Array}
 */
export function dedupCiencias(arr) {
  if (!arr) return [];
  let lista = arr;
  // Objeto-indexado vira array
  if (!Array.isArray(arr) && typeof arr === 'object') {
    lista = Object.values(arr);
  }
  const porKey = {};
  lista.forEach(e => {
    if (!e || !e.key) return;
    const ex = porKey[e.key];
    if (!ex || (e.ciencia_em && ex.ciencia_em && e.ciencia_em > ex.ciencia_em)) {
      porKey[e.key] = e;
    }
  });
  return Object.values(porKey);
}

/**
 * Verifica se um status é considerado "concluído/completo" no cálculo.
 *
 * @param {string} status
 * @returns {boolean}
 */
export function statusEhCompleto(status) {
  if (!status) return false;
  return STATUS_COMPLETOS_PATTERNS.some(p => p(status));
}
