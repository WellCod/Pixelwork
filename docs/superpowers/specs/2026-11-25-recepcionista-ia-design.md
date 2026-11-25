# Recepcionista de IA por voz no Pixelwork

Proposta para revisão · 25 de novembro de 2026

## Experiência

O mapa pode ter um NPC fixo chamado **Recepção**, com a indicação **IA** ao lado do nome. Ao se aproximar, o visitante vê **Conversar com IA** e o aviso de que, ao iniciar, seu microfone será processado para responder. O botão é um aceite por conversa. A recepcionista se apresenta, explica o básico do escritório e responde sobre lugares, mesas, pessoas disponíveis no coworking e como pedir entrada em reuniões.

Uma conversa por coworking. O primeiro pedido elegível aceito pelo servidor ocupa a recepção. As outras pessoas próximas veem **Em atendimento** e podem tentar depois. Quem conversa ouve a recepcionista com a mesma atenuação por distância dos outros avatares. A fala de resposta fica disponível à pessoa atendida. Ao terminar, a interface libera a próxima conversa, sem fila automática. O anel de fala usa a indicação de fala do LiveKit enquanto a trilha da recepcionista está ativa.

O servidor aplica a mesma zona aberta e a histerese de `nextProximity` com posições confirmadas. Cruzar o raio de saída, trocar de zona, entrar em reunião ou chamada, desconectar, perder a participação, silenciar a entrada da recepção pela UI ou tocar em **Encerrar** termina o atendimento. A troca retira a IA e fecha a entrada de áudio antes de liberar o próximo atendimento. O usuário pode conversar com a IA novamente ao se aproximar e aceitar.

## Decisões

| Tema | Proposta | Motivo |
| --- | --- | --- |
| Processo de voz | LiveKit Agents em Python, em um processo filho local e opcional, controlado pelo servidor Node | O SDK RTC Python documenta a lista de quem pode assinar trilhas publicadas, necessária na sala aberta compartilhada. A referência pública de `LocalParticipant` do RTC Node consultada para esta spec não apresenta essa operação. A fronteira de processo também tira inferência e áudio do loop de movimento. |
| Entrada na sala | O Fastify emite token por atendimento para `space:<spaceId>` com identidade única, publicação de microfone e assinatura seletiva. A URL do worker é a interna do LiveKit. | O Pixelwork mantém a autoridade sobre `space:`, `zone:` e `call:`. A recepção só opera em `space:`. |
| Canal de controle | Mensagens NDJSON versionadas, validadas e limitadas em `stdin` e `stdout` entre o servidor e o worker. | Serve em desenvolvimento Windows e em container Linux, dispensa porta pública e entrega credenciais de mídia por atendimento. |
| Pipeline | STT, LLM e TTS encadeados, com adaptadores e modelos configurados no ambiente. TTS via streaming HTTP compatível com ElevenLabs e fallback opcional compatível com o mesmo contrato. | Permite testar com dublês e apontar para um k-voice aprovado usando URL e chave. Formato de áudio e voz viram parte da configuração do adaptador. |
| Turnos | LiveKit Agents com detecção de voz e interrupção do áudio pelo interlocutor cujo lease está ativo. | Uma voz de terceiro na sala não concorre pelo turno. Cancelamento esvazia a saída e invalida respostas antigas. |
| Várias pessoas | Uma conversa por coworking e um teto global configurável. O primeiro pedido aceito ganha o lease. | O atendimento fica previsível e o custo e a privacidade têm limites claros. |

Referências para o transporte e os turnos. [RTC Python e permissões de trilha](https://docs.livekit.io/reference/python/livekit/rtc/participant.html) · [RTC Node](https://docs.livekit.io/reference/client-sdk-node/classes/LocalParticipant.html) · [AgentSession e participante vinculado](https://docs.livekit.io/agents/logic/sessions/) · [Seleção de trilhas](https://docs.livekit.io/transport/media/subscribe/) · [Turnos e interrupção](https://docs.livekit.io/agents/logic/turns/) · [TTS streaming compatível](https://elevenlabs.io/docs/api-reference/text-to-speech/stream)

## Mapa, estado e autorização

- Adicionar a camada opcional de objetos Tiled `reception`, com zero ou um ponto. O `compileMap` converte o ponto para tile e valida coordenadas finitas, limites do mapa, piso caminhável e zona aberta. A demo recebe um ponto perto da entrada. Upload, exportação, edição do mapa e reset mantêm o marcador. A colocação do ponto no MVP usa Tiled ou o mapa padrão.
- A configuração tem `enabled=false` como padrão no banco por coworking. Um admin liga pela interface e por uma rota em `/spaces/:spaceId`, usando resolução de membro com 404 para não membros e papel de admin para alteração. A permissão de edição da demo é separada. `RECEPTIONIST_ENABLED` precisa estar ativo e o worker precisa anunciar que o pipeline e seus limites estão completos. Quando a instalação estiver desligada, omitir a recepção. Com o recurso habilitado, o painel admin indica a falta de marcador e o NPC indica **Indisponível** em caso de falha de worker ou limite.
- O runtime valida o pedido WebSocket com a conexão atual, membro vinculado, configuração, mapa atual, elegibilidade, sala de mídia `space:<spaceId>` e capacidade antes de emitir o token. Um lease contém `spaceId`, membro, geração da conexão, versão do mapa, identidade LiveKit do worker e deadline monotônico. Solicitações repetidas têm resposta idempotente. A ocupação é reservada antes do primeiro efeito externo.
- O avatar da recepção usa a composição e as poses existentes com identidade lógica própria. O estado público opcional informa posição e disponibilidade. Uma mensagem privada informa o vínculo de mídia e o estado da conversa ao solicitante. A recepção fica fora da lista de humanos, das atribuições de mesa e do codec de movimento binário. Os estados efêmeros passam por WebSocket e a configuração persistida passa por REST.
- A elegibilidade é reavaliada após um movimento confirmado da pessoa atendida e nos eventos relevantes de sala, chamada, mapa, conexão e configuração. O worker recebe ordens de revogação e o servidor remove a identidade de mídia pela interface `MediaService`. Se o worker travar, o supervisor encerra o processo e libera suas reservas após revogar os leases. O caminho desligado faz apenas a checagem de configuração, sem executar trabalho de áudio no tick.

## Áudio e interrupção

1. O servidor usa a integração de mídia para assinar um token curto e restrito à sala aberta, com microfone como única fonte de publicação, assinatura permitida e publicação de dados desativada. O token, a identidade do usuário e o lease viajam pelo canal local ao worker. As chaves de administração do LiveKit ficam no servidor.
2. O worker conecta com `auto_subscribe=False`, aplica a autorização de saída para o membro ativo e vincula a sessão apenas à publicação de microfone desse membro. A entrada de voz fica desabilitada até haver consentimento e lease vigente. A entrega da saída a terceiros precisa falhar no teste com LiveKit real, inclusive durante publicação, reconexão e troca do interlocutor. Se essa proteção falhar, o recurso fica indisponível até haver solução aprovada.
3. O cliente adiciona a trilha da IA às assinaturas desejadas durante um lease válido, usando `volumeAt` e identificação da publicação. A lista de mídia humana, as exceções de jogos e as salas privadas continuam com suas regras existentes. O worker só produz a saudação após a conexão, a autorização da trilha e a confirmação de prontidão. O usuário pode encerrar enquanto a sessão está abrindo.
4. Para barge-in, detecção de início de voz autorizada interrompe o `AgentSession`, cancela requisições em andamento e limpa os frames ainda enfileirados. Cada turno tem uma geração. Frames e resultados com geração vencida são descartados. O reconhecimento do próximo turno começa com o áudio da pessoa atendida, mantendo em memória apenas o contexto necessário à conversa.

## Ferramentas e escopo de resposta

| Operação | Entrada validada | Fonte e resposta |
| --- | --- | --- |
| `list_online_people` | Busca opcional por nome, paginação ou limite pequeno imposto pelo servidor | Membros online do runtime do próprio coworking. Nome de exibição e área aberta ou a indicação genérica **Em reunião privada** ou **Em chamada**. |
| `locate_place` | Nome de sala ou mesa | Zonas e mesas do `CompiledMap` atual. Retorna nome, área e coordenada acessível quando conhecida. Nomes ambíguos geram uma pergunta curta para esclarecer. |
| `explain_locked_room` | Nome da sala | Estado de tranca do runtime e instruções para bater na porta e aguardar autorização. |

O worker invoca a lista fechada de operações por IPC. O servidor resolve o coworking e o membro pelo lease, ignora identificadores de tenant vindos do modelo e confirma a autorização a cada chamada. O modelo escolhe uma intenção dentre a FAQ local, as operações acima, esclarecimento ou recusa. O servidor valida argumentos Zod e devolve dados estruturados com limites de tamanho. Nomes de sala, mesa e usuário entram como campos de exibição em modelos fixos de resposta em português. Textos livres de status, contatos, credenciais, conteúdos de chamada e dados de outros coworkings ficam fora do conjunto consultável. A saída usa somente os campos aprovados e frases da FAQ, inclusive para esclarecimento e recusa. A ferramenta opcional de caminho pode usar A* e o mapa atual em uma fase posterior.

## Configuração, privacidade e custo

- Inicialmente desligado tanto no ambiente quanto no coworking. A configuração proposta inclui `RECEPTIONIST_ENABLED`, caminho do Python, limites globais e por conversa, e grupos `RECEPTIONIST_STT_*`, `RECEPTIONIST_LLM_*`, `RECEPTIONIST_TTS_*` e `RECEPTIONIST_TTS_FALLBACK_*` para tipo de adaptador, URL, modelo, voz e credencial aplicáveis. Definir os nomes finais e seus valores no `.env.example` antes da implementação. Falsos provedores em testes. Configuração comercial, serviços externos adicionais e fornecimento de chaves passam por aprovação específica.
- Proposta inicial para review: duas conversas simultâneas na instalação, uma por coworking, 120 s por conversa e 20 s de ociosidade. Tetos de áudio e tokens por turno garantem uma reserva estimável. O orçamento diário por coworking usa unidades inteiras de custo e taxas configuradas por provedor e unidade. Sem taxa ou orçamento válido, o provedor real fica indisponível. O primeiro deploy será avaliado com limites explícitos.
- Reservar atomicamente, no Postgres, o máximo estimado antes de chamar cada turno ou fallback. Reconciliar com áudio de entrada e saída, tokens de entrada e saída e caracteres de TTS quando aplicável. Em falhas com consumo desconhecido, contabilizar até a reserva de forma conservadora. Usar IDs opacos de sessão, motivo de encerramento e contadores por conversa. O orçamento vale também para chamadas frustradas e retries, com limite e deadline.
- O fallback TTS é explícito e orçado, acionado para erro transitório antes do primeiro áudio reproduzido. A nova tentativa usa um provedor previamente autorizado, recebe só o texto necessário e respeita o mesmo cancelamento. Após áudio parcial, encerrar o turno com aviso visual evita repetir a resposta.
- Manter áudio e transcrição em memória pelo prazo do turno e do atendimento. Limpar buffers, estado do modelo e histórico efêmero ao encerrar, inclusive em falhas e desligamento. Métricas e registros persistidos guardam apenas contadores, tempos, provedor, coworking, sessão opaca e motivo. O aviso ao visitante identifica a IA e o processamento de voz. Antes de usar provedores reais, validar configurações, país de tratamento e retenção oferecida, documentando o comportamento efetivo. A privacidade do Pixelwork e a política do provedor são controles distintos.

## Critérios de aceitação e medição

| Nível | Evidência |
| --- | --- |
| Unitário | `compileMap` com mapas antigos e marcadores inválidos, elegibilidade com histerese e transições, limites concorrentes, tool calling com nomes maliciosos, 404 para não membros, descarte de gerações, revogação, budget e fallback. |
| Integração | Postgres real e dublê de `MediaService`, com STT, LLM e TTS falsos. Exercitar duas conexões concorrentes, terceiro membro, outro coworking, troca de sala, troca de conexão, alteração de mapa, reinício do worker e app desligado. |
| LiveKit real | Linux no CI. Provar que o cliente autorizado assina a trilha, que outro membro e um cliente que tenta assinar manualmente ficam sem recepção de áudio, e que revogação e barge-in interrompem a trilha. Se o E2E de UI for instável, manter o teste de autorização de mídia real em harness isolado. |
| Latência | Medir do fim de um trecho de fala conhecido até o primeiro áudio de resposta recebido no navegador. Publicar p50, p95, tamanho e distribuição da amostra, máquina, versões, rede e provedores, com erros e condições frias e aquecidas separados. Sem número até executar. |
| Carga | Repetir os cenários do README de 10, 25 e 50 bots com a recepção desligada e com um atendimento por dublês, usando a mesma máquina e janela do teste comparativo. Reportar tick, tamanho binário, CPU e RSS lado a lado. |

No fechamento, atualizar `docs/architecture.md` e `README.md` com o contrato aprovado, uso e decisões, comentar as variáveis em `.env.example` e preparar o PR da branch `feat/recepcionista-ia`. O PR registra as medições e indica como próxima etapa a orientação visual de caminho.
