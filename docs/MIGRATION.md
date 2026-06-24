# Migração v5 → v6

## Visão geral

A v6 reorganiza o código (modular) e o Firestore (subcoleções) sem mudar **nada** que a equipe vê. É uma refatoração interna.

## Por que migrar?

| Problema v5 | Solução v6 |
|---|---|
| `index.html` com 6.900 linhas e 48+ IIFEs empilhadas | Módulos ES em `src/` |
| Documento Firestore monolítico → estoura 1MB | Subcoleções por usuário e por alvará |
| Patches que se cancelam (toggle preso, piscar, etc) | Lógica consolidada e testada |
| Sem testes automatizados → cada deploy era apostar | 63 testes verdes obrigatórios antes de deploy |

## Como ativar

### Pré-requisitos
- Acesso de admin (`contato@azuoscontabil.com.br`)
- Branch `arquitetura-v6` mergeada em `main` (deploy automático)

### Passo a passo

#### 1. Merge da branch
```bash
git checkout main
git merge arquitetura-v6
git push  # CI roda testes, se OK faz deploy
```

#### 2. Rodar migração no Firestore (uma vez só)

Abra produção logado como admin:
1. https://azuos-paralegal.web.app
2. F12 → Console
3. Cole o conteúdo de `scripts/migrate-firestore.js`
4. Execute: `migrateFase1()`

O que acontece:
- Backup completo em `azuos/snapshots/pre_v6_<timestamp>`
- `ciencias_por_usuario` migra para `azuos/ciencias/por_usuario/<emailHash>`
- `edicoes_alvaras` migra para `azuos/edicoes/alvaras/<alvId>`
- Documento `shared` ainda contém os campos legados (não apaga)

#### 3. Verificar
- Console deve mostrar `[migrate] === FASE 1 - CONCLUÍDA ===`
- Tamanho do documento `shared` cai (verificar no Firebase Console)
- Aplicação continua funcionando normalmente (compatibilidade lê dos dois lugares)

#### 4. Aguardar 7 dias
Período de observação. Se ninguém reclamar, o campo legado pode ser removido.

#### 5. Remover campos legados (apenas em Fase 1.b, futura)
```js
firebase.firestore().collection('azuos').doc('shared').update({
  ciencias_por_usuario: firebase.firestore.FieldValue.delete(),
  edicoes_alvaras: firebase.firestore.FieldValue.delete()
});
```

## Rollback

Se algo der errado:

```js
// Restaura do backup criado no passo 2
const snap = await firebase.firestore().collection('azuos').doc('pre_v6_<TIMESTAMP>').get();
await firebase.firestore().collection('azuos').doc('shared').set(snap.data());
```

Ou via git:
```bash
git checkout main
git revert HEAD  # desfaz o merge
git push
```

## FAQ

**P: Vai derrubar a equipe?**
R: Não. A leitura é dupla: subcoleção tem prioridade, campo legado como fallback. Equipe não sente nada.

**P: E se algum paralegal estiver no meio de uma edição?**
R: Edições em curso continuam funcionando. O save vai pros dois lugares enquanto leitura dupla está ativa.

**P: Posso rodar a migração de novo?**
R: Sim, é idempotente. Cada ciência só é gravada uma vez por chave.

**P: O documento de backup `pre_v6_<ts>` pode ser apagado?**
R: Não recomendado. É a apólice de seguro pra reverter. Mantenha por pelo menos 30 dias.
