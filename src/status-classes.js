/**
 * Mapeamento de status → classes CSS (Tailwind).
 * Centraliza o que estava espalhado em vários lugares no index.html.
 */

const STATUS_CLASSES = {
  'Concluído':              {bg: 'bg-emerald-100', txt: 'text-emerald-700', label: 'text-emerald-600'},
  'Pago':                   {bg: 'bg-emerald-100', txt: 'text-emerald-700', label: 'text-emerald-600'},
  'Em vigor (vencimento)':  {bg: 'bg-emerald-100', txt: 'text-emerald-700', label: 'text-emerald-600'},
  'Formalizado':            {bg: 'bg-cyan-100',    txt: 'text-cyan-700',    label: 'text-cyan-600'},
  'Formalizado com o cliente': {bg: 'bg-cyan-100', txt: 'text-cyan-700',    label: 'text-cyan-600'},
  'Em andamento':           {bg: 'bg-blue-100',    txt: 'text-blue-700',    label: 'text-blue-600'},
  'Em andamento (pendência)': {bg: 'bg-blue-100',  txt: 'text-blue-700',    label: 'text-blue-600'},
  'Isento':                 {bg: 'bg-purple-100',  txt: 'text-purple-700',  label: 'text-purple-600'},
  'Sem obrigatoriedade':    {bg: 'bg-slate-100',   txt: 'text-slate-700',   label: 'text-slate-600'},
  'Aguardando pagamento':   {bg: 'bg-yellow-100',  txt: 'text-yellow-700',  label: 'text-yellow-600'},
  'Aguardando cliente':     {bg: 'bg-yellow-100',  txt: 'text-yellow-700',  label: 'text-yellow-600'},
  'Não iniciado':           {bg: 'bg-gray-100',    txt: 'text-gray-700',    label: 'text-gray-600'},
  'Arquivado pelo cliente': {bg: 'bg-gray-100',    txt: 'text-gray-600',    label: 'text-gray-500'},
  'Arquivado com pendências': {bg: 'bg-orange-100', txt: 'text-orange-700', label: 'text-orange-600'},
  'Serviço paralisado':     {bg: 'bg-orange-100',  txt: 'text-orange-700',  label: 'text-orange-600'},
  'Encaminhado':            {bg: 'bg-indigo-100',  txt: 'text-indigo-700',  label: 'text-indigo-600'},
};

const DEFAULT = {bg: 'bg-slate-100', txt: 'text-slate-700', label: 'text-slate-600'};

/**
 * Classes CSS pra um status. Sempre retorna objeto (nunca undefined).
 *
 * @param {string} status
 * @returns {{bg: string, txt: string, label: string}}
 */
export function classesDeStatus(status) {
  return STATUS_CLASSES[status] || DEFAULT;
}

export const STATUS_PENDENTES = [
  'Em andamento', 'Em andamento (pendência)',
  'Aguardando pagamento', 'Aguardando cliente',
  'Não iniciado', 'Serviço paralisado',
  'Arquivado com pendências', 'Encaminhado'
];

export function statusEhPendente(status) {
  return STATUS_PENDENTES.includes(status);
}
