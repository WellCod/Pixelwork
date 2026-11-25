# Plano de implementação da recepcionista de IA

**Gate de início** — Revisar e aprovar a [spec](../specs/2026-11-25-recepcionista-ia-design.md). O plano corresponde à branch `feat/recepcionista-ia`. Cada etapa abaixo termina em um commit pequeno, com os testes do trecho executados antes do próximo.

## 1. Validar o transporte e a interrupção

- Usar a versão de LiveKit self-hosted fixada no repo e conferir quais versões de `livekit-agents` e RTC Python funcionam em Linux e Windows. Fixar as versões depois da validação e da aprovação aplicável às dependências.
- Montar um harness com duas identidades humanas na mesma `space:` e um worker que recebe token do backend. Verificar `auto_subscribe=False`, vínculo explícito de microfone e ACL de saída aplicada antes da publicação. Forçar pedidos de assinatura de uma identidade que não recebeu autorização, incluindo corrida de publicação e reconexão.
- Usar áudio de teste para comprovar interrupção, limpeza da fila de áudio e descarte de frames antigos. Capturar falhas e compatibilidade como evidência da decisão. Se a ACL não isolar a trilha na versão implantável, parar para revisão do transporte.

## 2. Mapear a recepção e configurar por coworking

- Em `packages/shared/src/map.ts`, compilar a camada opcional `reception` com validação do ponto. Acrescentar o ponto ao template da demo e exercitar importação, exportação, reset e round-trip pelo editor.
- Gerar migration e default desativado em Drizzle. Em `packages/server/src/spaces/`, implementar configuração admin via REST sobre a resolução de `space_members`. Na UI, exibir estado e controle de ativação no painel do espaço.
- Testar mapas antigos, ponto inválido, membro comum, não membro, flags desligadas e configuração ausente. Documentar o contrato do mapa e a capacidade do admin no `docs/architecture.md` após aprovação.

## 3. Controlar presença, autorização e leases no runtime

- Criar um módulo de recepção com fronteira injetável para o worker, usar `nextProximity` com posições confirmadas e encaixar admissão e revogação nos eventos do runtime. Em `MediaService`, reutilizar defesa de autorização e retirada de sala para a identidade do worker.
- Adicionar mensagens opcionais de presença, início e fim em `packages/shared/src/protocol.ts`. Usar mensagens privadas para vínculo de mídia e estado de conversa. Manter posição e fala do NPC separadas dos movimentos do tick, e reutilizar os utilitários do `WorldScene` para o avatar.
- Testar concorrência, conexão substituída, fim de lease durante a abertura, mudança de mapa, a saída por posição ou sala, e revogação em caso de falha. Usar o dublê existente de `MediaService`.

## 4. Entregar o processo de voz e o consumo controlado

- Criar o worker Python opcional e um supervisor Node com IPC NDJSON versionado e validado. Dar ao worker apenas o necessário para cada lease. Aplicar deadlines, isolamento por sessão, limpeza de áudio e parada do processo quando houver falha de controle.
- Implementar portas de STT, LLM e TTS, com dublês determinísticos. Implementar o protocolo HTTP streaming de TTS compatível com ElevenLabs e exercitar um endpoint local compatível. Acrescentar provedores, URLs e chaves reais apenas mediante a autorização descrita na spec.
- Aplicar reserva transacional e contabilização de custo no Postgres. Testar teto global, uma conversa por espaço, excesso de duração, concorrência de reservas, fallback, desligamento e recuperação após crash. Verificar que logs e métricas contêm somente os dados operacionais definidos na spec.

## 5. Ligar as ferramentas e o fluxo do visitante

- Implementar as três ferramentas sobre o runtime e o `CompiledMap`, com esquema fechado e vínculo derivado do lease. Revisar respostas para homônimos, tranca alterada, membro desconectado, dados de zona privada e rótulos contendo instruções adversariais.
- Integrar **Conversar com IA**, o aviso, o estado do NPC e **Encerrar** na UI. Reutilizar a atenuação e o indicador de fala do LiveKit. Validar que o worker só assina a origem prevista e que a saída não aparece em `zone:` ou `call:`.
- Executar integração com dublês das três etapas. Quando viável, incluir no Playwright uma navegação até a recepção e a assinatura da trilha com LiveKit real. Manter o harness de isolamento de mídia no CI mesmo se o E2E de UI precisar ficar enxuto.

## 6. Medir, documentar e abrir o PR

- Medir tempo até o primeiro áudio recebido pelo cliente, segundo o protocolo da spec. Registrar p50, p95, amostra, erros, provedores, versões, máquina e rede. Identificar o ambiente de cada medição e obter aprovação antes de testar um provedor novo ou pago. Rodar a carga comparável dos 10, 25 e 50 bots e verificar o tick binário.
- Atualizar a tabela de decisões do README ou registrar um ADR, explicar como ativar, publicar os números medidos e comentar as variáveis no `.env.example`. Rodar geração de migration, `pnpm typecheck`, `pnpm lint`, `pnpm test`, a suíte do worker, E2E e build do Docker.
- Abrir PR da `feat/recepcionista-ia` para revisão. Incluir evidência dos limites, a cobertura de privacidade e a orientação visual como próximo passo previsto.

## Evidência do transporte local

- LiveKit self-hosted v1.13.11, Windows, CPython 3.12.13, SDK RTC Python 1.3.0. Harness: pnpm exec tsx scripts/reception-rtc-smoke.ts caminho/do/python (ambiente descartável com livekit==1.3.0).
- Com áudio sintético, só o interlocutor autorizado recebeu a resposta. O worker assinou somente o microfone autorizado. Um segundo membro foi bloqueado na publicação e após reconectar com assinatura automática e explícita. A troca de interlocutor usou uma nova identidade RTC.
- A fila foi esvaziada e a revogação da permissão produziu zero frames audíveis. O SDK não sinalizou desassinatura nesse cenário. A retirada pelo MediaService do Pixelwork foi confirmada pelo desaparecimento do participante. Usar essa retirada como confirmação de revogação.
- Próximo teste de áudio: validar AgentSession e a interrupção completa de STT/LLM/TTS depois que o worker estiver integrado. Este ensaio cobre transporte e fila RTC.
