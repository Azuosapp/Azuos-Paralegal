# AZUOS Paralegal

Sistema de gerenciamento de alvarás — Firebase Hosting + Firestore.

🔗 **Produção:** https://azuos-paralegal.web.app

## Status

- **Versão atual em produção:** v5.7.84
- **Branch atual de refatoração:** `arquitetura-v6` (Fase 0 concluída)

## Desenvolvimento

### Pré-requisitos
- Node.js 20+

### Comandos
```bash
npm test              # roda toda a suíte (30 testes)
npm run test:unit     # só testes unitários
npm run test:smoke    # só smoke tests
npm run validate      # valida sintaxe do index.html
```

### CI/CD
- A cada `push` em qualquer branch: testes rodam (`.github/workflows/tests.yml`)
- A cada `push` em `main`: testes rodam ANTES do deploy. Se vermelho, deploy **não acontece**.

## Documentação

- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — visão geral da arquitetura
- [`docs/CONTRIBUTING.md`](docs/CONTRIBUTING.md) — regras de contribuição

## Arquitetura

Ver `docs/ARCHITECTURE.md`. Resumo:
- Em refatoração ativa (v6.0)
- Estrutura modular em construção
- Fase 0 (setup): ✅ concluída
- Fase 1 (Firestore subcoleções): próxima
