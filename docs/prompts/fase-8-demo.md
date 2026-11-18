# Fase 8: preparação da demo

Leia `CLAUDE.md` e `docs/architecture.md` (seções 13, 14 e 15).

## Objetivo

O projeto pronto para ser avaliado: números medidos, E2E, jobs da demo, deploy preparado e README.

## Escopo

- `pnpm load --bots N` com os bots dos testes de integração andando aleatoriamente; saída com
  latência entre tick e recebimento (p50, p95, p99), tamanho médio de mensagem e CPU do processo.
  Rode com 10, 25 e 50 bots e registre os resultados.
- E2E de fumaça com Playwright: dois contextos do Chromium com mídia falsa; um anda até o outro;
  verifica a trilha remota assinada por um estado de debug exposto só em modo de teste. No CI, com
  o LiveKit como service container.
- Jobs: limpeza horária de convidados expirados; reset noturno do coworking de demo. Agendamento
  dentro do processo do servidor, com o relógio injetável.
- `docker-compose.prod.yml` com Caddy, app, Postgres e LiveKit; `.env.production.example`;
  documentação das portas UDP e do TURN. Sem deploy real.
- README: o que é, como rodar, arquitetura em um diagrama, decisões e o que foi descartado,
  números de carga, limites conhecidos (um nó só) e o caminho para escalar.

## Testes obrigatórios

- Jobs com relógio manual: convidado expirado removido e mesa liberada; coworking de demo
  restaurado.
- E2E de fumaça passando no CI.

## Pronto quando

O README permite que alguém entenda as decisões em poucos minutos e rode o projeto localmente, e
os números de carga estão medidos e publicados.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto. Pare.
