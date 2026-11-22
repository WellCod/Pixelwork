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
      return `Os tilesets ${error.a} e ${error.b} dividem gids. Dê ao segundo um firstgid depois do fim do primeiro (o padrão é 100 por tileset).`;
    case 'duplicate_key':
      return `${error.kind === 'zone' ? 'zone_key' : 'desk_key'} repetido: ${error.key}.`;
    case 'invalid_key':
      return `${error.kind === 'zone' ? 'zone_key' : 'desk_key'} inválido: "${error.key}" (use a-z, 0-9 e hífen).`;
    case 'zone_overlap':
      return `As zonas ${error.a} e ${error.b} se sobrepõem.`;
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
      return `As mesas ${error.a} e ${error.b} usam a mesma cadeira.`;
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

type Check = { map: unknown; errors: MapError[]; orphanDesks: string[] };

export function MapModal({ spaceId, baseVersion, onClose }: Props) {
  const [check, setCheck] = useState<Check | null>(null);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setCheck(null);
    setMessage(null);
    if (!file) return;
    void file.text().then(async (text) => {
      let map: unknown;
      try {
        map = JSON.parse(text);
      } catch {
        setMessage({ kind: 'error', text: 'O arquivo não é um JSON válido. Exporte o mapa do Tiled como JSON.' });
        return;
      }
      try {
        const result = await mapApi.validate(spaceId, map);
        setCheck({ map, ...result });
      } catch {
        setMessage({ kind: 'error', text: 'Não deu para validar o mapa.' });
      }
    });
  };

  const save = () => {
    if (!check) return;
    setBusy(true);
    mapApi
      .save(spaceId, check.map, baseVersion)
      .then(() => {
        setMessage({ kind: 'ok', text: 'Mapa salvo. Quem está online já vê o mapa novo.' });
        setCheck(null);
      })
      .catch((error: unknown) => {
        const code = (error as { code?: unknown }).code;
        setMessage({
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
          <input type="file" accept="application/json,.json,.tmj" onChange={pick} />
        </label>
        {check && check.errors.length > 0 && (
          <ul className="map-errors">
            {check.errors.map((error, i) => (
              <li key={i}>{describeMapError(error)}</li>
            ))}
          </ul>
        )}
        {check && check.errors.length === 0 && (
          <>
            <p className="ok">O mapa é válido.</p>
            {check.orphanDesks.length > 0 && (
              <p className="error">
                Estas mesas ocupadas deixam de existir e serão liberadas: {check.orphanDesks.join(', ')}.
              </p>
            )}
            <button type="button" className="primary" disabled={busy} onClick={save}>
              Salvar mapa
            </button>
          </>
        )}
        {message && <p className={message.kind}>{message.text}</p>}
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
