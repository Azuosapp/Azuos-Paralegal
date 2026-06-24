# Contributing

## Para mim mesmo (Claude) — regras estritas

### Sempre
- ✅ Trabalhe em **branch separada**, nunca direto em `main`
- ✅ Rode `npm test` antes de cada commit
- ✅ Rode `node scripts/validate-html.js` antes de cada commit
- ✅ Cada commit tem mensagem descritiva: `[Fase N|tema] verbo objeto - motivo`
- ✅ Se mexer em produção, documente plano de rollback no PR
- ✅ Pegue um bug por vez (atomic commits)

### Nunca
- ❌ Empilhar IIFE no final do script para "consertar" código anterior. Se uma função está errada, conserta a função.
- ❌ Deploy sem testes verdes
- ❌ `Object.defineProperty(window, ..., {configurable: false})` — trava redefinição e quebra patches futuros
- ❌ MutationObserver observando `document.body` inteiro sem flag de cooldown — causa loops
- ❌ Commit em `main` direto. Sempre via PR.
- ❌ Adicionar dependências pesadas sem necessidade (manter Node-only)
- ❌ Misturar várias mudanças num mesmo commit/PR

## Workflow padrão

```bash
# 1. Branch
git checkout -b fix/<descricao-curta>

# 2. Mudança
vim src/utils.js  # ou outro arquivo

# 3. Validar localmente
npm test
node scripts/validate-html.js

# 4. Commit pequeno e descritivo
git add .
git commit -m "fix(utils): corrigir parseDataBR para anos < 1000"

# 5. Push e abrir PR
git push origin fix/<descricao-curta>
# Abrir PR pela UI do GitHub. CI roda automaticamente.

# 6. Após review: merge via "Squash and merge" (1 commit limpo na main)
```

## Estrutura de teste pra cada feature

| Tipo | Onde | Quando usar |
|---|---|---|
| Unit | `tests/unit/*.test.js` | Lógica pura (cálculo, parse, sanitização) |
| Smoke | `tests/smoke.test.js` | Sanity checks no `index.html` (presença de funções, configs) |
| E2E | `tests/e2e/*.test.js` | Estrutura DOM via JSDOM |

## Antes de mexer em algo que já estava lá

1. Procure o arquivo no `src/` — se for lógica pura, mexe lá
2. Se for em `index.html`: leia toda a função antes; nunca empilhe IIFE
3. Adicione um teste que cobre o caso que você está corrigindo
4. Rode os testes — eles devem estar verdes ANTES da sua mudança e DEPOIS

## Como adicionar nova dependência

Reluta. Justifique no PR. Se for indispensável:
- Apenas dev dependencies (não em runtime)
- Sem dependências pesadas (mais de 50MB)
- Sem dependências de mineração de criptomoeda, sem deprecated, sem CVEs
