/* Azuos Paralegal — logica pura extraida do HTML (Estagio 2 modularizacao) */
/* Carregado antes do app; funcoes/const ficam globais, comportamento identico ao inline. */

var PENDENTE = ['Em andamento','Em andamento (pendência)','Aguardando pagamento','Aguardando cliente','Não iniciado','Serviço paralisado','Arquivado com pendências','Encaminhado'];
var CONCLUIDO = ['Concluído','Pago'];

function statusClass(s){
  const m = {
    'Concluído':'bg-emerald-100 text-emerald-700','Pago':'bg-emerald-100 text-emerald-700',
    'Em andamento':'bg-blue-100 text-blue-700','Em vigor (vencimento)':'bg-cyan-100 text-cyan-700',
    'Em andamento (pendência)':'bg-orange-100 text-orange-700',
    'Aguardando pagamento':'bg-yellow-100 text-yellow-700','Aguardando cliente':'bg-yellow-100 text-yellow-700',
    'Não iniciado':'bg-gray-100 text-gray-700','Arquivado pelo cliente':'bg-gray-100 text-gray-600',
    'Sem obrigatoriedade':'bg-purple-100 text-purple-700','Arquivado com pendências':'bg-orange-100 text-orange-700',
    'Serviço paralisado':'bg-red-100 text-red-700','Encaminhado':'bg-purple-100 text-purple-700',
    'Formalizado com o cliente':'bg-indigo-100 text-indigo-700'
  };
  return m[s] || 'bg-gray-100 text-gray-700';
}

function parseDataBR(s) {
  if (!s) return null;
  s = String(s).trim();
  // Remove extras tipo "30/12/2026 00:00:00" -> só a parte da data
  s = s.split(/\s+/)[0];
  // dd/mm/aaaa ou dd-mm-aaaa ou dd.mm.aaaa
  let m = s.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})$/);
  if (m) {
    let [_,d,mm,y] = m;
    if (y.length === 2) y = '20' + y;
    const dt = new Date(parseInt(y), parseInt(mm)-1, parseInt(d));
    if (isNaN(dt.getTime())) return null;
    return dt;
  }
  // aaaa-mm-dd ou aaaa/mm/dd ou aaaa.mm.dd
  m = s.match(/^(\d{4})[\/\-\.](\d{1,2})[\/\-\.](\d{1,2})/);
  if (m) {
    const dt = new Date(parseInt(m[1]), parseInt(m[2])-1, parseInt(m[3]));
    if (isNaN(dt.getTime())) return null;
    return dt;
  }
  // Tenta o parser nativo como último recurso (ex: "2026-06-30T00:00:00")
  const native = new Date(s);
  if (!isNaN(native.getTime())) {
    // Sanity: ano entre 2000-2100
    if (native.getFullYear() >= 2000 && native.getFullYear() <= 2100) return native;
  }
  return null;
}
