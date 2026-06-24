# Arquitetura AZUOS Paralegal v6

## Princípios

1. **Sem patches empilhados** — proibido criar IIFE no final do script para "consertar" código anterior. Toda mudança vai direto na função/módulo correto.
2. **Testes antes de deploy** — nenhum commit em `main` sem `npm test` verde.
3. **Firestore com subcoleções** — dados grandes (ciências, edições) em coleções separadas, nunca empilhar em um único documento.
4. **Comportamento documentado** — cada função tem JSDoc explicando entrada, saída, side effects.

## Estrutura (em construção)

```
/
├── index.html              # entry point (vai ficar bem menor após modularização)
├── src/
│   ├── auth.js             # login, logout, sessão (Fase 2)
│   ├── firestore.js        # leitura/escrita Firestore — UMA fonte de verdade (Fase 2)
│   ├── empresas.js         # render tabela, filtros, ordenação (Fase 2)
│   ├── alvaras.js          # modal, save, validações (Fase 2)
│   ├── dashboard.js        # gráficos, rankings (Fase 2)
│   └── utils.js            # parseDataBR, sanitize, etc (Fase 2)
├── tests/
│   ├── smoke.test.js       # boot + edição + persist (rodando no Node)
│   ├── unit/
│   │   ├── calc-andamento.test.js
│   │   ├── parse-data.test.js
│   │   └── dedup-ciencias.test.js
│   └── fixtures/           # JSON com dados de teste
├── scripts/
│   ├── backup-firestore.js  # admin tool
│   ├── migrate-ciencias.js  # Fase 1
│   └── validate-html.js     # checa balanço de chaves, parse, etc
└── docs/
    ├── ARCHITECTURE.md
    ├── CONTRIBUTING.md
    └── MIGRATION.md
```

## Schema Firestore (alvo na Fase 1)

```
azuos/
├── shared                    # < 100KB sempre
│   ├── empresas_manuais
│   ├── historico (slice 200)
│   └── usuarios (metadata, sem ciências)
├── ciencias/                 # 1 doc por usuário
│   ├── <emailHash>           # { entries: [{key, ciencia_em}, ...] }
│   └── ...
├── edicoes_alvaras/          # 1 doc por alvará editado
│   ├── <alvId>               # { tipo, status, responsavel, vencimento, ... }
│   └── ...
└── snapshots/                # backups manuais antes de mudanças
    └── pre_v6_<timestamp>
```

## Padrões de código

- ES modules (`import`/`export`)
- Sem `var` (usar `const`/`let`)
- Funções com JSDoc obrigatório
- Async/await em vez de `.then()` quando possível
- Logs prefixados com `[modulo]`
