# AZUOS Paralegal

[![Tests](https://github.com/Azuosapp/Azuos-Paralegal/actions/workflows/tests.yml/badge.svg)](https://github.com/Azuosapp/Azuos-Paralegal/actions/workflows/tests.yml)

Sistema de gerenciamento de alvarás — Firebase Hosting + Firestore.

🔗 **Produção:** https://azuos-paralegal.web.app

## Status

- **Versão em produção:** v5.7.84 (branch `main`)
- **Refatoração v6:** em curso (branch `arquitetura-v6`)

## Quick Start

```bash
git clone https://github.com/Azuosapp/Azuos-Paralegal.git
cd Azuos-Paralegal
npm install
npm test
```

## Comandos

| Comando | O que faz |
|---|---|
| `npm test` | Roda toda a suíte (63+ testes: unit + smoke + e2e) |
| `npm run test:unit` | Só testes unitários |
| `npm run test:smoke` | Só smoke tests |
| `npm run validate` | Valida sintaxe do index.html |

## Arquitetura (v6 alvo)

```
/
├── index.html          # SPA — entry point
├── src/                # módulos ES (Fase 2 em curso)
│   ├── utils.js        # calcAndamento, parseDataBR, sanitize, etc
│   ├── status-classes.js # mapa de classes Tailwind por status
│   └── ... (mais módulos na Fase 2 completa)
├── tests/
│   ├── unit/           # testa módulos puros (rápido, robusto)
│   ├── smoke.test.js   # sanity checks no index.html
│   └── e2e/            # JSDOM (estrutura DOM)
├── scripts/
│   ├── migrate-firestore.js # migration manual via console (admin)
│   └── validate-html.js     # validador pré-commit
└── docs/
    ├── ARCHITECTURE.md      # estrutura alvo
    └── CONTRIBUTING.md      # regras
```

## Pipeline CI/CD

- **Push em qualquer branch** → roda `tests.yml` (validate + test)
- **Pull Request → main** → roda `pr.yml` (validate + test + alertas de tamanho)
- **Push em main** → roda testes ANTES, deploy automático no Firebase Hosting **apenas se verdes**

Deploy não acontece se testes estiverem vermelhos. Garantia mínima.

## Releases

- v5.x — produção, patches empilhados (50+ IIFEs). [Histórico]
- **v6.0** — refatoração profissional (em progresso na branch `arquitetura-v6`).
  - Fase 0 ✅ — testes + CI/CD + validator
  - Fase 1 ✅ — Firestore com subcoleções (resolve limite de 1MB)
  - Fase 2 ✅ — módulos puros extraídos (`src/utils.js`, `src/status-classes.js`)
  - Fase 3 ✅ — E2E com JSDOM
  - Fase 4 ✅ — CI/CD avançado
  - Fase 5 ✅ — documentação

Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) e [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md).
