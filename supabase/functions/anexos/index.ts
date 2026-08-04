// AZUOS Paralegal — autorizador de anexos no Storage do Supabase.
//
// POR QUE ESTA FUNCAO EXISTE.
// O Paralegal e uma pagina estatica, sem servidor. A chave de administracao do
// Supabase da acesso total ao banco (que e COMPARTILHADO com o Trilha: alunos,
// feed, financeiro). Colocar essa chave na pagina entrega o sistema inteiro a
// qualquer pessoa que abra o inspecionar do navegador.
//
// Entao a pagina nao recebe chave nenhuma. Ela apresenta o cracha do usuario — o
// token do Firebase Auth — e esta funcao faz tres coisas:
//   1) confere que o token e legitimo, assinado pelo Google, para ESTE projeto;
//   2) confere que o e-mail esta na lista de autorizados do Paralegal;
//   3) devolve um endereco assinado, de validade curta, para UM arquivo especifico.
//
// O arquivo sobe direto do navegador para o Storage. A funcao so autoriza: ela nao
// carrega o arquivo, nao consome banda e nao vira gargalo.
//
// A funcao NAO toca em nada do Trilha. Ela usa um balde proprio e nao altera
// nenhuma politica existente. Foi por isso que descartamos configurar o Supabase
// para aceitar login do Firebase de forma global: isso faria os usuarios do
// Paralegal virarem "autenticados" para TODAS as regras ja existentes do Trilha,
// inclusive o balde `feed`, que aceita insercao de qualquer autenticado.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { importX509, jwtVerify } from 'https://deno.land/x/jose@v5.9.6/index.ts';

const PROJETO_FIREBASE = 'azuos-paralegal';
const BALDE = 'paralegal-anexos';
const VALIDADE_SEGUNDOS = 120;

// Mesma lista do firestore.rules. Conferida em 04/08/2026 contra as contas reais
// do Firebase Authentication. Ao mexer aqui, mexa la tambem.
const AUTORIZADOS = new Set([
  'contato@azuoscontabil.com.br',
  'thierrymforte@gmail.com',
  'comercial@azuoscontabil.com.br',
  'camila@azuoscontabil.com.br',
  'ketrin@azuoscontabil.com.br',
  'luannaferreirabatista20@gmail.com',
  'diogenes@azuoscontabil.com.br',
  'leylabraz1994@outlook.com',
  'paralegal10@gmail.com',
  'integracao.grupoazuos@gmail.com',
  'grupob2bbrasil@icloud.com',
  'paralalegal6@gmail.com',
  'advgabryelisaac@gmail.com',
  'paralalegal2@gmail.com',
  'paralalegal2@gmail.com.br',
]);

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// Chaves publicas do Google, com cache — sao trocadas periodicamente.
let chavesCache: { valores: Record<string, string>; ate: number } | null = null;
async function chavesDoGoogle(): Promise<Record<string, string>> {
  const agora = Date.now();
  if (chavesCache && chavesCache.ate > agora) return chavesCache.valores;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const valores = await r.json();
  // respeita o max-age do proprio Google em vez de chutar um tempo
  const cc = r.headers.get('cache-control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  chavesCache = { valores, ate: agora + (m ? Number(m[1]) : 3600) * 1000 };
  return valores;
}

/* Verificacao do token do Firebase.
   Usa a biblioteca `jose` em vez de analisar o certificado a mao. A primeira versao
   desta funcao localizava a chave publica dentro do X.509 procurando o OID de
   rsaEncryption byte a byte — funciona ate o Google mudar um detalhe do formato, e
   ai falha em silencio, que e o pior modo de falha possivel num ponto de
   autenticacao. Biblioteca consolidada faz esse trabalho melhor do que eu. */
let chavesCache: { valores: Record<string, string>; ate: number } | null = null;
async function chavesDoGoogle(): Promise<Record<string, string>> {
  const agora = Date.now();
  if (chavesCache && chavesCache.ate > agora) return chavesCache.valores;
  const r = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const valores = await r.json();
  const cc = r.headers.get('cache-control') || '';
  const m = /max-age=(\d+)/.exec(cc);
  chavesCache = { valores, ate: agora + (m ? Number(m[1]) : 3600) * 1000 };
  return valores;
}

async function verificarTokenFirebase(jwt: string): Promise<{ email: string }> {
  const certs = await chavesDoGoogle();

  // O `kid` do cabecalho diz qual certificado assinou. Nao confiamos nele as cegas:
  // ele so escolhe entre os certificados que o PROPRIO Google publicou.
  const cab = JSON.parse(new TextDecoder().decode(
    Uint8Array.from(atob(jwt.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)),
  ));
  const pem = certs[cab.kid];
  if (!pem) throw new Error('chave de assinatura desconhecida');

  const chave = await importX509(pem, 'RS256');
  const { payload } = await jwtVerify(jwt, chave, {
    issuer: `https://securetoken.google.com/${PROJETO_FIREBASE}`,
    audience: PROJETO_FIREBASE,
    // jwtVerify ja recusa token expirado; a folga cobre relogio fora de sincronia
    clockTolerance: 60,
  });

  const email = String(payload.email || '').toLowerCase().trim();
  if (!email) throw new Error('token sem e-mail');
  return { email };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  const responder = (corpo: unknown, status = 200) =>
    new Response(JSON.stringify(corpo), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

  try {
    const auth = req.headers.get('Authorization') || '';
    if (!auth.startsWith('Bearer ')) return responder({ erro: 'sem credencial' }, 401);

    const { email } = await verificarTokenFirebase(auth.slice(7));
    if (!AUTORIZADOS.has(email)) return responder({ erro: 'nao autorizado' }, 403);

    const { acao, chave } = await req.json();
    // A chave vira caminho de arquivo: sanitizar impede subir um nivel de pasta e
    // gravar por cima de outra coisa dentro do balde.
    const nomeArquivo = String(chave || '').replace(/[^A-Za-z0-9_.-]/g, '').slice(0, 120);
    if (!nomeArquivo) return responder({ erro: 'chave invalida' }, 400);

    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false } },
    );

    // Balde PRIVADO: sao documentos de clientes, alvaras, CNPJs. A leitura tambem
    // passa por endereco assinado, nunca por link publico.
    await admin.storage.createBucket(BALDE, { public: false }).catch(() => {});

    const caminho = `anexos/${nomeArquivo}`;

    if (acao === 'upload') {
      const { data, error } = await admin.storage.from(BALDE).createSignedUploadUrl(caminho, { upsert: true });
      if (error) return responder({ erro: error.message }, 500);
      return responder({ url: data.signedUrl, caminho });
    }

    if (acao === 'download') {
      const { data, error } = await admin.storage.from(BALDE).createSignedUrl(caminho, VALIDADE_SEGUNDOS);
      if (error) return responder({ erro: error.message }, 404);
      return responder({ url: data.signedUrl, caminho });
    }

    return responder({ erro: 'acao desconhecida' }, 400);
  } catch (e) {
    return responder({ erro: String((e as Error).message || e) }, 401);
  }
});
