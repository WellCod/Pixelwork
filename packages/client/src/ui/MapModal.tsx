import type { MapError } from '@pixelwork/shared';
import { useState, type ChangeEvent } from 'react';
import { mapApi } from '../api.ts';
import { Modal } from './Modal.tsx';

/** Texto de cada código de MapError para quem preparou o mapa no Tiled. */
export function describeMapError(error: MapError): string {
  switch (error.code) {
    case 'not_orthogonal':
      return 'O mapa precisa ser ortogonal.';
    case 'infinite':
      return 'Mapas infinitos não são aceitos; desmarque "Infinito" no Tiled.';
    case 'wrong_tile_size':
      return 'Os tiles precisam ter 16x16 px.';
    case 'too_large':
      return 'O mapa passa do limite (100x100 tiles ou 5 MB).';
    case 'compressed_layer':
      return 'Salve as camadas como CSV, sem base64 nem compressão.';
    case 'missing_layer':
      return `Falta a camada "${error.layer}".`;
    case 'wrong_layer_type':
      return `A camada "${error.layer}" é do tipo errado.`;
    case 'layer_size':
      return `A camada "${error.layer}" não tem o tamanho do mapa (largura x altura tiles).`;
    case 'unknown_tileset':
      return `Tileset fora do catálogo ou embutido: ${error.source}. Use os .tsj do catálogo como tilesets externos.`;
    case 'tileset_overlap':
      return `Os tilesets ${error.first} e ${error.second} dividem gids. Dê ao segundo um firstgid depois do fim do primeiro (o padrão é 100 por tileset).`;
    case 'duplicate_key':
      return `${error.kind === 'zone' ? 'zone_key' : 'desk_key'} repetido: ${error.key}.`;
    case 'invalid_key':
      return `${error.kind === 'zone' ? 'zone_key' : 'desk_key'} inválido: "${error.key}" (use a-z, 0-9 e hífen).`;
    case 'zone_overlap':
      return `As zonas ${error.first} e ${error.second} se sobrepõem.`;
    case 'zone_not_aligned':
      return `A zona ${error.key} não está alinhada à grade de 16 px.`;
    case 'invalid_zone_type':
      return `A zona ${error.key} precisa ter type "open" ou "meeting".`;
    case 'zone_outside':
      return `A zona ${error.key} está inteira fora do mapa.`;
    case 'chair_blocked':
      return `A cadeira da mesa ${error.deskKey} está num tile bloqueado.`;
    case 'desk_size':
      return `A mesa ${error.deskKey} precisa ocupar 1 tile, ou 2 tiles alinhados com a frente.`;
    case 'desk_outside':
      return `A mesa ${error.deskKey} está fora do mapa.`;
    case 'chair_shared':
      return `As mesas ${error.first} e ${error.second} usam a mesma cadeira.`;
    case 'furniture_position':
      return `O móvel ${error.objectId} não tem posição numérica (x e y).`;
    case 'invalid_orientation':
      return `A mesa ${error.deskKey} precisa de orientation up, down, left ou right.`;
    case 'spawn_count':
      return `A camada spawn precisa de exatamente um ponto (encontrei ${error.found}).`;
    case 'spawn_blocked':
      return 'O spawn está num tile bloqueado.';
    case 'spawn_in_meeting':
      return 'O spawn está dentro de uma sala de reunião; quem entra furaria a tranca.';
  }
}

interface Props {
  spaceId: string;
  baseVersion: number;
  onClose: () => void;
}

/** Mapa lido do arquivo e o resultado da validação no servidor (erros e mesas que deixariam de existir). */
type MapCheck = { map: unknown; errors: MapError[]; orphanDesks: string[] };

/**
 * Troca o mapa do coworking por um JSON do Tiled: valida no servidor antes, mostra os erros ou as
 * mesas que serão liberadas e só então deixa salvar. Também exporta o mapa atual.
 */
export function MapModal({ spaceId, baseVersion, onClose }: Props) {
  const [mapCheck, setMapCheck] = useState<MapCheck | null>(null);
  const [feedback, setFeedback] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Escolher um arquivo descarta a validação anterior; JSON inválido nem chega ao servidor.
  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    setMapCheck(null);
    setFeedback(null);
    if (!file) return;
    void file.text().then(async (text) => {
      let map: unknown;
      try {
        map = JSON.parse(text);
      } catch {
        setFeedback({ kind: 'error', text: 'O arquivo não é um JSON válido. Exporte o mapa do Tiled como JSON.' });
        return;
      }
      try {
        const validation = await mapApi.validate(spaceId, map);
        setMapCheck({ map, ...validation });
      } catch {
        setFeedback({ kind: 'error', text: 'Não deu para validar o mapa.' });
      }
    });
  };

  // `baseVersion` faz o servidor recusar (`stale_map`) se alguém salvou o mapa nesse meio-tempo.
  const save = () => {
    if (!mapCheck) return;
    setBusy(true);
    mapApi
      .save(spaceId, mapCheck.map, baseVersion)
      .then(() => {
        setFeedback({ kind: 'ok', text: 'Mapa salvo. Quem está online já vê o mapa novo.' });
        setMapCheck(null);
      })
      .catch((error: unknown) => {
        const code = (error as { code?: unknown }).code;
        setFeedback({
          kind: 'error',
          text:
            code === 'stale_map'
              ? 'Outra pessoa salvou o mapa antes. Feche, deixe o mapa novo carregar e envie de novo.'
              : 'O mapa foi recusado. Valide de novo.',
        });
      })
      .finally(() => setBusy(false));
  };

  return (
    <Modal title="Mapa do coworking" onClose={onClose}>
      <div className="fields">
        <label>
          Mapa do Tiled (JSON, tilesets externos do catálogo)
          <input type="file" accept="application/json,.json,.tmj" onChange={pickFile} />
        </label>
        {mapCheck && mapCheck.errors.length > 0 && (
          <ul className="map-errors">
            {mapCheck.errors.map((error, i) => (
              <li key={i}>{describeMapError(error)}</li>
            ))}
          </ul>
        )}
        {mapCheck && mapCheck.errors.length === 0 && (
          <>
            <p className="ok">O mapa é válido.</p>
            {mapCheck.orphanDesks.length > 0 && (
              <p className="error">
                Estas mesas ocupadas deixam de existir e serão liberadas: {mapCheck.orphanDesks.join(', ')}.
              </p>
            )}
            <button type="button" className="primary" disabled={busy} onClick={save}>
              Salvar mapa
            </button>
          </>
        )}
        {feedback && <p className={feedback.kind}>{feedback.text}</p>}
        <a className="button" href={`/spaces/${encodeURIComponent(spaceId)}/map/export`} download>
          Exportar mapa atual (zip para o Tiled)
        </a>
      </div>
      <div className="actions">
        <button type="button" onClick={onClose}>
          Fechar
        </button>
      </div>
    </Modal>
  );
}
