# Fase 5: multi-coworking

Leia `CLAUDE.md` e `docs/architecture.md` (seções 4, 5 e 9).

## Objetivo

Uma conta real participa de coworkings de empresas diferentes, com cargos diferentes em cada um.

## Escopo

- GitHub OAuth com `state` em cookie de curta duração; vínculo em `oauth_accounts`.
- Criar empresa e criar coworking a partir de template (owner ou admin da empresa).
- Convites: criar (admin do coworking), aceitar, expiração, limite de usos, token guardado só como
  hash.
- Papéis: admin do coworking edita cargos e remove membros; qualquer membro pode sair.
- UI: lista dos coworkings do usuário, troca entre eles (fecha o WebSocket e a mídia do anterior),
  tela de criação de empresa e coworking, tela de convite.

## Testes obrigatórios

- Isolamento de tenant: uma tabela com todas as rotas `/spaces/:id/...` existentes, verificando
  404 para não membro em cada uma. A tabela precisa falhar se alguém adicionar uma rota nova sem
  incluí-la (derive a lista do registro de rotas do Fastify).
- Convites: expirado, sem usos restantes, já membro, token inexistente.
- OAuth: callback com `state` divergente é recusado.
- Remover um membro libera a mesa dele (cascata) e o desconecta do coworking.

## Pronto quando

Uma conta do GitHub cria uma empresa e um coworking, convida outra conta, e a outra conta alterna
entre o coworking de demo e esse, com cargos diferentes em cada um.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o que verificar manualmente (inclusive como configurar o OAuth App
   do GitHub em localhost). Pare.
