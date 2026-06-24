# Arquitetura AZUOS Paralegal v6

## Princípios

1. **Sem patches empilhados** — proibido criar IIFE no final do script para "consertar" código anterior
2. **Testes antes de deploy** — nenhum commit em `main` sem `npm test` verde
3. **Firestore com subcoleções** — dados grandes em coleções separadas
4. **Comportamento documentado** — cada função pública tem JSDoc
5. **Idempotência** — operações de migração e dedup podem rodar várias vezes

## Estrutura

```
/
├── index.html              # SPA — entry point (em modularização gradual)
├── src/                    # módulos ES (puros, testáveis)
│   ├── utils.js            ✅ calcAndamento, parseDataBR, sanitize, etc
│   ├── status-classes.js   ✅ mapa Tailwind por status
│   ├── auth.js             ⏳ login, logout, sessão (próxima sessão)
│   ├── firestore.js        ⏳ uma fonte de verdade para read/write
│   ├── empresas.js         ⏳ render tabela, filtros, ordenação
│   ├── alvaras.js          ⏳ modal, save, validações
│   └── dashboard.js        ⏳ gráficos, rankings
├── tests/
│   ├── unit/               ✅ testes de módulos puros (49 casos)
│   ├── smoke.test.js       ✅ sanity checks (10 casos)
│   └── e2e/                ✅ JSDOM estrutura DOM (7 casos)
├── scripts/
│   ├── validate-html.js    ✅ pré-commit
│   └── migrate-firestore.js ✅ migração manual (Fase 1)
├── docs/
│   ├── ARCHITECTURE.md     ✅ este arquivo
│   ├── CONTRIBUTING.md     ✅ regras
│   └── MIGRATION.md        ✅ v5 → v6
└── .github/workflows/
    ├── tests.yml           ✅ CI em todo push
    ├── pr.yml              ✅ CI em PRs
    └── deploy.yml          ✅ deploy só se testes verdes
```

## Schema Firestore (alvo)

```
azuos/
├── shared                          # < 100 KB sempre
│   ├── empresas_manuais            # array
│   ├── historico (slice 200)       # array recente
│   ├── usuarios                    # metadata, sem ciências
│   ├── resumo_visto_por_usuario    # { email: timestamp }
│   ├── _fase1_migrated_at          # marca de migração
│   └── _fase1_snapshot             # ref do backup
├── ciencias/
│   └── por_usuario/
│       └── <emailHash>             # 1 doc por usuário
│           ├── email
│           ├── entries[]           # array dedup
│           └── migrated_at
├── edicoes/
│   └── alvaras/
│       └── <alvId>                 # 1 doc por alvará editado
│           ├── status, tipo, etc
│           └── _editado_em, _editado_por
└── snapshots/                      # backups antes de migrações
    └── pre_v6_<timestamp>
```

## Pipeline de dados

```
Usuário edita alvará no modal
         │
         ▼
  salvarAlvara()  ◄── (em index.html, vai pra src/alvaras.js na Fase 2 completa)
         │
         ├──► state.alvaras (in-memory, render imediato)
         ├──► state.edicoes_alvaras (overlay)
         ├──► localStorage (offline-first)
         └──► Firestore:
                ├── azuos/edicoes/alvaras/<alvId>  (novo, subcoleção)
                └── azuos/shared (legado, durante 7d de transição)
```

## Como o cálculo de andamento funciona

Fonte de verdade: `src/utils.js` → `calcAndamento(alvaras)`.

Regras de status:
- **Contam como completo** (`statusEhCompleto === true`):
  - Concluído, Pago, Em vigor (vencimento)
  - Formalizado, Formalizado com o cliente
  - Em andamento, Em andamento (pendência)
  - Arquivado pelo cliente
  - Serviço paralisado
  - Isento
  - Aguardando cliente
- **NÃO contam (pendentes)**:
  - Não iniciado, Aguardando pagamento, Encaminhado
  - Arquivado com pendências
- **Excluídos do denominador**:
  - Sem obrigatoriedade (não conta nem como obrigatório)
  - Status vazio/null

## Decisões registradas

### Por que subcoleções no Firestore?
- Documento Firestore limite: 1 MB
- v5 estourou: `ciencias_por_usuario` ocupava 773 KB sozinho
- Subcoleção 1 doc/usuário escala linear sem limite global

### Por que ES modules sem bundler?
- Sem build step = simplicidade no deploy (só copia HTML pro Firebase Hosting)
- Compatibilidade nativa em browsers modernos
- Tests Node usam mesmo import

### Por que Node test runner (e não Vitest/Jest)?
- Zero config
- Zero dependências runtime (jsdom só pra E2E)
- Roda em qualquer máquina com Node 20+

### Por que JSDOM com runScripts: 'outside-only'?
- O script principal tem 6.900 linhas + setIntervals — `dangerously` trava 40s+
- Lógica de negócio extraída em `src/` é testada em unit/ (rápida)
- JSDOM ainda valida estrutura DOM (presença de #app, configs, etc)
