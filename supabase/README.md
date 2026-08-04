# Anexos no Storage do Supabase — como publicar

## O que isto resolve

Os anexos moram hoje DENTRO do Firestore: 13.219 documentos, mais de 2 GB. O
Firestore cobra caro por espaço, o plano do projeto dá 1 GiB, e cada abertura de
anexo gasta cota de LEITURA do banco — a mesma cota que, esgotada, chega para a
equipe como "não consigo salvar". Arquivo pertence a um serviço de arquivo.

Vamos usar o Storage do Supabase que o Trilha já usa (plano Pro, 100 GB).

## Por que existe uma função no meio

O Paralegal é uma página estática, sem servidor. A chave de administração do
Supabase dá acesso total ao banco COMPARTILHADO com o Trilha (alunos, feed,
financeiro). Colocá-la na página entregaria o sistema inteiro a quem abrisse o
inspecionar do navegador.

Então a página não recebe chave nenhuma: ela apresenta o crachá do usuário (token
do Firebase Auth) e a função devolve um endereço assinado, válido por 2 minutos,
para UM arquivo específico. O arquivo sobe direto do navegador para o Storage — a
função só autoriza.

**Esta função não toca em nada do Trilha.** Balde próprio (`paralegal-anexos`,
privado), nenhuma política existente alterada. Descartamos de propósito a opção de
configurar o Supabase para aceitar login do Firebase de forma global: isso faria os
usuários do Paralegal virarem "autenticados" para TODAS as regras já existentes do
Trilha — inclusive o balde `feed`, que aceita inserção de qualquer autenticado.

## Publicar (uma vez)

Precisa do Supabase CLI e de acesso ao projeto:

    npm i -g supabase
    supabase login
    supabase link --project-ref <REF-DO-PROJETO-DO-TRILHA>
    supabase functions deploy anexos --no-verify-jwt

`--no-verify-jwt` é obrigatório: o token que chega é do **Firebase**, não do
Supabase. Quem valida é a própria função, contra as chaves públicas do Google, e
depois confere o e-mail na lista de autorizados.

As variáveis `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` já existem no ambiente
das Edge Functions — não precisa configurar nem colar chave em lugar nenhum.

## Ligar no app

Em `index.html`, preencher:

```js
window._SB_CFG = {
  url:    'https://<REF>.supabase.co',
  anon:   '<NEXT_PUBLIC_SUPABASE_ANON_KEY>',
  funcao: 'anexos'
};
```

A chave `anon` é pública por natureza — ela já vai no pacote do site do Trilha.
A chave de serviço **nunca** entra aqui.

Enquanto `_SB_CFG` estiver vazio, o sistema funciona exatamente como hoje: grava e
lê os anexos no Firestore. Nada quebra por estar sem configuração.

## Ordem segura da migração

1. Publicar a função e preencher `_SB_CFG`. **Anexo novo já vai para o Storage.**
2. A leitura tenta os dois lugares, então os 13.219 antigos continuam abrindo
   normalmente. A troca é invisível para a equipe.
3. Só depois, migrar os antigos em lotes: copia os bytes → confere que chegaram →
   **só então** apaga do Firestore. Nunca apagar antes de confirmar.
4. Por último, separar os órfãos (anexo que nenhum alvará referencia) e revisar a
   lista ANTES de apagar qualquer coisa.

O ponteiro do anexo (`_idb`) não muda em nenhum momento — muda só onde os bytes
estão. Por isso a migração nunca precisa tocar em alvará nenhum.
