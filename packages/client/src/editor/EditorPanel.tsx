import { DIRS, type Dir } from '@pixelwork/shared';
import { adoptDocument, textProp, type RugId, type TiledDoc, type ZoneType } from '@pixelwork/shared/editor';
import { useEffect, useState, useSyncExternalStore } from 'react';
import smallOffice from '../../../../maps/templates/small-office.json';
import { api, mapApi } from '../api.ts';
import { describeMapError } from '../ui/MapModal.tsx';
import { FLOOR_OPTIONS, FURNITURE_OPTIONS, RUG_OPTIONS, WALL_OPTIONS, type EditorController, type Tool } from './editor-controller.ts';

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: 'select', label: 'Selecionar', hint: 'Clique para selecionar; arraste para mover.' },
  { tool: 'floor', label: 'Piso', hint: 'Arraste para pintar o piso.' },
  { tool: 'wall', label: 'Parede', hint: 'Arraste para levantar paredes.' },
  { tool: 'rug', label: 'Tapete', hint: 'Arraste para desenhar o tapete, de qualquer tamanho.' },
  { tool: 'erase', label: 'Borracha', hint: 'Arraste para apagar a camada escolhida.' },
  { tool: 'furniture', label: 'Móvel', hint: 'Clique para pôr o móvel escolhido.' },
  { tool: 'zone', label: 'Zona', hint: 'Arraste para desenhar a zona.' },
  { tool: 'desk', label: 'Mesa', hint: 'Clique para pôr uma mesa; R gira a selecionada.' },
  { tool: 'spawn', label: 'Spawn', hint: 'Clique onde as pessoas aparecem ao entrar.' },
];

const DIR_LABEL: Record<Dir, string> = { up: 'cima', down: 'baixo', left: 'esquerda', right: 'direita' };

export function useEditor(controller: EditorController): EditorController {
  useSyncExternalStore(
    (onChange) => controller.subscribe(onChange),
    () => controller.version,
  );
  return controller;
}

interface Props {
  controller: EditorController;
  spaceId: string;
  baseVersion: number;
  onBaseVersion: (version: number) => void;
  onClose: () => void;
}

/** Ferramentas, seleção, erros ao vivo e salvar. A edição em si acontece na cena. */
export function EditorPanel({ controller, spaceId, baseVersion, onBaseVersion, onClose }: Props) {
  useEditor(controller);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'stale'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = controller.errors();
  const selected = controller.selected();
  const layer = controller.selection?.layer;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = document.activeElement instanceof HTMLInputElement || document.activeElement instanceof HTMLSelectElement;
      if (typing) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z' && !e.shiftKey) {
        e.preventDefault();
        controller.undo();
      } else if (mod && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) {
        e.preventDefault();
        controller.redo();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        controller.removeSelected();
      } else if (e.key.toLowerCase() === 'r') {
        controller.rotateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      const check = await mapApi.validate(spaceId, controller.doc);
      if (check.errors.length > 0) {
        setStatus({ kind: 'error', text: 'O servidor recusou o mapa: corrija os erros abaixo.' });
        return;
      }
      if (
        check.orphanDesks.length > 0 &&
        !confirm(`Estas mesas ocupadas deixam de existir e serão liberadas: ${check.orphanDesks.join(', ')}. Salvar mesmo assim?`)
      ) {
        return;
      }
      await mapApi.save(spaceId, controller.doc, baseVersion);
      onClose();
    } catch (error) {
      const code = (error as { code?: unknown }).code;
      setStatus(
        code === 'stale_map'
          ? { kind: 'stale', text: 'Outra pessoa salvou o mapa enquanto você editava.' }
          : { kind: 'error', text: 'Não deu para salvar. Tente de novo.' },
      );
    } finally {
      setSaving(false);
    }
  };

  /** Depois de um 409: descarta a edição e parte do mapa que está salvo agora. */
  const reloadCurrent = async () => {
    try {
      const space = await api.space(spaceId);
      controller.reset(space.map as TiledDoc);
      controller.markClean();
      onBaseVersion(space.mapVersion);
      setStatus({ kind: 'ok', text: 'Mapa atual carregado. Suas mudanças foram descartadas.' });
    } catch {
      setStatus({ kind: 'error', text: 'Não deu para carregar o mapa atual. Tente de novo.' });
    }
  };

  const leave = () => {
    if (controller.dirty && !confirm('Sair do editor e descartar as mudanças não salvas?')) return;
    onClose();
  };

  // Fechar a aba com edição pendente pede confirmação ao navegador.
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (controller.dirty) e.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [controller]);

  const fromTemplate = () => {
    if (!confirm('Começar do modelo descarta o mapa em edição. Continuar?')) return;
    controller.reset(adoptDocument(controller.doc, smallOffice as TiledDoc));
  };

  return (
    <aside className="sidebar editor-panel">
      <section>
        <h3>Editar mapa</h3>
        <div className="tool-grid">
          {TOOLS.map((t) => (
            <button
              key={t.tool}
              type="button"
              className={controller.tool === t.tool ? 'primary' : ''}
              aria-pressed={controller.tool === t.tool}
              title={t.hint}
              onClick={() => controller.setTool(t.tool)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <p className="muted">{TOOLS.find((t) => t.tool === controller.tool)?.hint} Setas movem a câmera.</p>

        {controller.tool === 'floor' && (
          <label className="fields">
            Tipo de piso
            <select value={controller.floorFrame} onChange={(e) => controller.setOption({ floorFrame: Number(e.target.value) })}>
              {FLOOR_OPTIONS.map((o) => (
                <option key={o.frame} value={o.frame}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'wall' && (
          <label className="fields">
            Tipo de parede
            <select value={controller.wallFrame} onChange={(e) => controller.setOption({ wallFrame: Number(e.target.value) })}>
              {WALL_OPTIONS.map((o) => (
                <option key={o.frame} value={o.frame}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'rug' && (
          <label className="fields">
            Tapete
            <select value={controller.rug} onChange={(e) => controller.setOption({ rug: e.target.value as RugId })}>
              {RUG_OPTIONS.map((o) => (
                <option key={o.rug} value={o.rug}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'erase' && (
          <label className="fields">
            Apagar
            <select
              value={controller.eraseLayer}
              onChange={(e) => controller.setOption({ eraseLayer: e.target.value as 'walls' | 'floor' })}
            >
              <option value="walls">paredes</option>
              <option value="floor">piso</option>
            </select>
          </label>
        )}
        {controller.tool === 'furniture' && (
          <label className="fields">
            Móvel
            <select
              value={`${controller.furniture.tileset}:${controller.furniture.frame}`}
              onChange={(e) => {
                const choice = FURNITURE_OPTIONS.find((o) => `${o.tileset}:${o.frame}` === e.target.value);
                if (choice) controller.setOption({ furniture: { tileset: choice.tileset, frame: choice.frame } });
              }}
            >
              {FURNITURE_OPTIONS.map((o) => (
                <option key={`${o.tileset}:${o.frame}`} value={`${o.tileset}:${o.frame}`}>
                  {o.item}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'desk' && (
          <label className="fields">
            Cadeira para
            <select
              value={controller.deskOrientation}
              onChange={(e) => controller.setOption({ deskOrientation: e.target.value as Dir })}
            >
              {DIRS.map((d) => (
                <option key={d} value={d}>
                  {DIR_LABEL[d]}
                </option>
              ))}
            </select>
          </label>
        )}
      </section>

      {selected && (
        <section>
          <h3>Selecionado</h3>
          {layer === 'zones' && (
            <div className="fields">
              <label>
                Nome
                {/* Grava ao sair do campo: um comando por renomeação, não por tecla. */}
                <input
                  key={selected.id}
                  defaultValue={textProp(selected, 'name')}
                  onBlur={(e) => controller.setZone({ name: e.target.value })}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
              </label>
              <label>
                Tipo
                <select
                  value={textProp(selected, 'type', 'open')}
                  onChange={(e) => controller.setZone({ type: e.target.value as ZoneType })}
                >
                  <option value="open">aberta</option>
                  <option value="meeting">sala de reunião</option>
                </select>
              </label>
              <span className="muted">Chave: {textProp(selected, 'zone_key')}</span>
            </div>
          )}
          {layer === 'desks' && (
            <div className="fields">
              <span>
                Mesa {textProp(selected, 'desk_key')}, cadeira para{' '}
                {DIR_LABEL[textProp(selected, 'orientation', 'down') as Dir]}
              </span>
              <button type="button" onClick={() => controller.rotateSelected()}>
                Girar (R)
              </button>
            </div>
          )}
          {layer !== 'spawn' && (
            <button type="button" onClick={() => controller.removeSelected()}>
              Remover (Delete)
            </button>
          )}
        </section>
      )}

      <section>
        <div className="row">
          <button type="button" disabled={!controller.stack.canUndo} onClick={() => controller.undo()}>
            Desfazer
          </button>
          <button type="button" disabled={!controller.stack.canRedo} onClick={() => controller.redo()}>
            Refazer
          </button>
        </div>
      </section>

      <section>
        <h3>Erros ({errors.length})</h3>
        {errors.length === 0 ? (
          <p className="ok">O mapa está no contrato.</p>
        ) : (
          <ul className="map-errors">
            {errors.map((error, i) => (
              <li key={i}>{describeMapError(error)}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="fields">
        {status && <p className={status.kind === 'ok' ? 'ok' : 'error'}>{status.text}</p>}
        {status?.kind === 'stale' && (
          <button type="button" onClick={() => void reloadCurrent()}>
            Recarregar o mapa atual
          </button>
        )}
        <button type="button" className="primary" disabled={saving || errors.length > 0} onClick={() => void save()}>
          {saving ? 'Salvando…' : 'Salvar mapa'}
        </button>
        <button type="button" onClick={fromTemplate}>
          Começar do modelo
        </button>
        <button type="button" onClick={leave}>
          Sair sem salvar
        </button>
      </section>
    </aside>
  );
}
