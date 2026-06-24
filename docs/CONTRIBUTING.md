# Contributing

## Regras (pra mim mesmo, Claude)

### Proibido
- **Empilhar IIFE no final do script** pra "consertar" algo. Se uma função está errada, conserta a função.
- Deploy sem rodar `npm test` antes.
- `Object.defineProperty(window, ..., {configurable: false})` — trava redefinição e quebra outros patches.
- MutationObserver observando `document.body` inteiro — usa container específico.
- Commit em `main` direto. Sempre passa por branch e PR.

### Obrigatório
- Antes de qualquer fix, rodar `npm test` — se já tava vermelho, **conserta o que tá vermelho** primeiro, depois faz o novo fix.
- Cada commit tem mensagem descritiva: `[Fase N] verbo objeto - motivo`.
- Mudança em produção → rollback plan documentado no PR.
