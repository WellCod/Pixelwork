# Fase 3: proximidade

Leia `CLAUDE.md` e `docs/architecture.md` (seções 3, 8 e 10).

## Objetivo

Chegar perto de alguém liga áudio e balão de vídeo; se afastar desliga. Chat em balão para quem
está perto.

## Escopo

- Servidor: emissão de token do LiveKit para `space:<spaceId>` e envio de `media.join` depois do
  `welcome`. Confira na documentação do SDK de servidor como definir os grants; não presuma.
- Cliente: gerenciador de mídia com uma única sala ativa, trocando de sala a cada `media.join`.
  Assinatura manual de trilhas na sala `space:`.
- Função pura de proximidade com histerese e zonas, e a assinatura de trilhas derivada dela.
- Volume atenuado pela distância. Verifique na documentação do `livekit-client` como ajustar o
  volume de um participante remoto; se não houver API, use Web Audio.
- Controles de microfone e câmera; câmera desligada por padrão; indicador de "visível para quem está
  perto".
- Balões de vídeo como `<video>` sobre o canvas, reposicionados a cada frame; no máximo
  `MAX_VIDEO_BUBBLES`, os mais próximos; camada de menor qualidade; expandir um balão pede
  qualidade alta. Confirme como simulcast e adaptive stream são configurados na versão fixada.
- Chat efêmero: `chat.say` e `chat.said`, destinatários calculados no servidor, limite de taxa,
  balão por `CHAT_BUBBLE_MS`.

## Fora de escopo

Salas de reunião como salas de mídia, chamadas, compartilhamento de tela (fase 4). Nesta fase, quem
está em zona `meeting` simplesmente não tem proximidade com quem está fora.

## Testes obrigatórios

- Proximidade: entra no raio de entrada; não sai entre os raios; sai acima do raio de saída; sai ao
  trocar de zona mesmo estando perto.
- Seleção dos balões: os mais próximos com câmera, limitados ao máximo.
- Chat: destinatários em zona aberta (mesma zona e raio) e em zona de reunião (todos os ocupantes);
  limite de taxa com rajada; texto vazio e longo demais recusados.
- Token da sala `space:`: identidade correta e sala correta.

## Pontos de atenção

- Trilhas de quem sai do raio precisam ser desassinadas, não só silenciadas.
- O gerenciador de mídia precisa lidar com um `media.join` chegando enquanto a conexão anterior
  ainda está sendo estabelecida.

## Pronto quando

Com dois perfis do Chrome usando as flags de mídia falsa, aproximar os avatares liga áudio e o
balão de vídeo (com a câmera ligada), afastar desliga, e o chat aparece só para quem está perto.

## Execução

1. Apresente o plano e espere aprovação.
2. Implemente com os testes.
3. Rode `pnpm typecheck`, `pnpm lint` e `pnpm test`.
4. Resuma o que ficou pronto e o roteiro de verificação manual com mídia falsa. Pare.
