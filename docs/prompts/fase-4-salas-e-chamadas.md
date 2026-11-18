# Fase 4: salas privadas e chamadas

Leia `CLAUDE.md` e `docs/architecture.md` (seções 7, 8, 10 e 14).

## Objetivo

Reuniões trancadas inacessíveis mesmo para um cliente modificado, chamadas da mesa e
compartilhamento de tela.

## Escopo

- Zonas `meeting` como salas `zone:<spaceId>:<zoneKey>`: ao entrar ou sair, o servidor emite o
  token da nova sala e envia `media.join`. Ao sair, remove o participante da sala anterior pela
  API de servidor do LiveKit (confirme o método no SDK).
- Tranca, lista de permitidos, `zone.knock` só em tile adjacente, resposta do primeiro ocupante,
  expiração de 30 segundos, destranca automática quando a sala esvazia. A simulação recusa a
  entrada em zona trancada para quem não está na lista.
- Chamadas 1:1: `call.invite` só com o autor sentado na própria mesa; `busy`, `timeout` e
  `declined`; sala `call:<callId>`; `call.leave` e desconexão encerram.
- `activity` derivada (`meeting`, `call`) propagada por `player.update`.
- Compartilhamento de tela nas salas de reunião e de chamada. Verifique se o grant do token pode
  restringir a fonte de trilha na sala `space:`; se não puder, restrinja só pela UI e sinalize.
- UI: trancar e destrancar, bater na porta, aprovar pedidos, receber e recusar chamada, iniciar
  chamada a partir da lista de pessoas quando sentado, compartilhar tela.

## Testes obrigatórios

Os de autorização são os mais importantes desta fase:

- Quem foi recusado na porta nunca recebe `media.join` nem token da sala da zona.
- Quem sai da zona recebe `media.join` de `space:` e é removido da sala da zona (verificado contra
  uma interface do serviço do LiveKit substituída por dublê).
- Quem não está numa chamada nunca recebe token dela.
- Fluxo de batida na porta com relógio manual: aprovação, recusa, expiração.
- Sala vazia destranca e limpa a lista.
- Chamada: autor fora da mesa recusado; destino em reunião gera `busy`; expiração gera `timeout`.

## Pronto quando

Uma reunião trancada não deixa ninguém de fora entrar nem ouvir; uma chamada iniciada da mesa
conecta duas pessoas em qualquer ponto do mapa; tela compartilhada aparece para os participantes.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o roteiro de verificação manual. Pare.
