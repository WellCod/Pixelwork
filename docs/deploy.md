# Deploy numa VPS

Preparado, não feito: uma VPS com Docker roda tudo com `docker-compose.prod.yml`.

## Peças

| Serviço    | Imagem                               | Papel                                                        |
|------------|--------------------------------------|--------------------------------------------------------------|
| `web`      | Caddy 2 com o cliente compilado      | TLS automático, cliente estático, proxy da API e do WebSocket |
| `app`      | Node 24 + tsx (alvo `app` do Dockerfile) | Fastify, tempo real, jobs; roda migrations e seed ao subir |
| `postgres` | `postgres:17`                        | Banco, com volume `pgdata`                                   |
| `livekit`  | `livekit/livekit-server:v1.13.11`    | SFU de áudio e vídeo                                         |

## Passo a passo

1. Dois domínios apontando para a VPS: o do app (`APP_DOMAIN`) e o do LiveKit
   (`LIVEKIT_DOMAIN`). O Caddy pede os certificados sozinho.
2. `cp .env.production.example .env.production` e preencher. Chave e segredo do LiveKit:
   `docker run --rm livekit/livekit-server:v1.13.11 generate-keys`.
3. `docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build`.

HTTPS é obrigatório: o navegador só libera câmera e microfone (`getUserMedia`) em contexto seguro.

## Portas no firewall

| Porta             | Protocolo | Para quê                                                    |
|-------------------|-----------|-------------------------------------------------------------|
| 80, 443           | TCP       | Caddy: app, API, WebSocket e sinalização do LiveKit (wss)   |
| 50000-50100       | UDP       | Mídia do LiveKit (WebRTC). Sem isso, conecta mas não há som |
| 7881              | TCP       | ICE por TCP, para redes que bloqueiam UDP                   |

A faixa UDP é pequena (100 portas) de propósito, para caber no mapeamento do Docker; cada
participante usa poucas portas. Para mais gente, aumentar a faixa no `deploy/livekit.yaml` e no
compose.

O LiveKit descobre o IP público por STUN (`use_external_ip: true`). Se a mídia não passar, o
nó pode estar anunciando um IP interno: definir `NODE_IP` com o IP público no serviço.

## TURN

Redes corporativas que só deixam passar TCP 443 precisam de TURN sobre TLS na 443. O LiveKit tem
TURN embutido (seção `turn` comentada em `deploy/livekit.yaml`), mas a 443 da VPS já é do Caddy.
Duas saídas:

- IP extra na VPS só para o TURN, com `tls_port: 443`, `domain` próprio e o certificado desse
  domínio em `cert_file` e `key_file`.
- Um balanceador L4 que termina TLS na frente e repassa para o LiveKit com `external_tls: true`.

Sem TURN, quem está em rede que bloqueia UDP ainda tenta o ICE por TCP na 7881.

## Limites

Um nó só: o estado de tempo real fica na memória do processo `app`. O caminho para escalar está no
README.
