# Azuos Paralegal — Estado Atual (encerramento)

_Última atualização: v6.1.3 (modularização Estágios 0–3.2 em produção)._

## Onde o sistema está

**Produção:** https://azuos-paralegal.web.app (Firebase Hosting) — publicada via **build** (Vite → `dist/`).

### Estrutura modular (em produção)
```
index.html            # UI do app (era 1594 KB → hoje ~445 KB)
public/seed.js        # dados (SEED) — a sincronização edita SÓ este arquivo
public/lib.js         # lógica pura (parseDataBR, statusClass, arrays de status)
public/data.js        # camada de persistência (saveState/quota/IndexedDB helpers)
public/firestore.js   # camada de sincronização (collect/apply + merge por id)
vite.config.js        # build
```
O deploy roda `npm run build` e publica o `dist/` (que contém index.html + os 4 módulos).

## O que foi entregue (resumo da jornada)

**Correções críticas (todas em produção, validadas ao vivo):**
- Salvamento à prova de estouro do navegador (não perde dados; nunca apaga o já salvo).
- Anexos migrados para **IndexedDB** (não entopem mais o navegador; backup dos antigos em `anexos_azuos_backup.zip`).
- Fim do bloat do Firestore por anexos base64; gravação por campo (não sobrescreve o colega).
- Merge por id (não perde itens em uso simultâneo); ids de histórico únicos.
- Desempenho: índice de alvarás por empresa (~67× no render), debounce de gravação, fim do polling duplicado.
- Logo horizontal "GRUPO AZUOS" no login e no menu.

**Modularização (Estágios 0–3.2, em produção):**
- 0: Vite + preview automático (branch `refactor/modular` → canal `preview-modular`).
- 1: SEED → `public/seed.js`; deploy passou a ser via build.
- 2: lógica pura → `public/lib.js`.
- 3.1: persistência → `public/data.js`.
- 3.2: Firestore → `public/firestore.js`.

## Automação

- **Sincronização** (`sincronizar-sistema-paralegal`, a cada 30 min): lê a planilha, atualiza **`public/seed.js`**, roda build + testes, commit e push → Actions publica.
- **Verificação de saúde** (`healthcheck-azuos-paralegal`, diária): confere estrutura modular, build, testes, credencial e deploy; avisa se algo sair do lugar.
- Deploy: GitHub Actions (`deploy.yml`) faz build e publica no Firebase a cada push na `main`.

## Como reverter (se algo der errado)

- **Git:** `git push origin backup-pre-estagio3:refs/heads/main --force` (volta à v6.1.1). Também há a tag e cópias em `backups/`.
- **Firebase Console:** Hosting → Histórico de versões → "Reverter" na versão anterior (1 clique, instantâneo).

## O que falta (Estágio 3 — parte 3) — NÃO feito de propósito

**Limpeza dos ~100 remendos/IIFEs.** É a única parte **de remoção** (as outras foram relocação segura). Risco alto: muitos remendos **são correções de bug** (inclusive as feitas nesta sessão). Só deve ser feito:
- peça por peça, provando que cada remendo é realmente redundante;
- com um **ambiente de teste multiusuário** (para pegar bugs de concorrência que um teste de 1 usuário não pega);
- nunca "apagando em massa às cegas".

Enquanto isso não existir, **recomenda-se não mexer** — o sistema está estável e a parte 3 é só arrumação, não afeta funcionalidade nem desempenho de forma relevante.

## Fluxo para retomar a modularização (parte 3, no futuro)

1. Alinhar a branch `refactor/modular` à `main` atual.
2. Trabalhar por incrementos pequenos → preview (`preview-modular`) → validar logado → só então `main`.
3. Backup/rollback prontos antes de cada passo.
