import { DIRS, type Dir } from '@pixelwork/shared';
import { MAX_DESKS_PER_ROW, adoptDocument, textProp, type DeskArrangement, type RugId, type TiledDoc, type ZoneType } from '@pixelwork/shared/editor';
import { useEffect, useState, useSyncExternalStore } from 'react';
import smallOffice from '../../../../maps/templates/small-office.json';
import { api, mapApi } from '../api.ts';
import { describeMapError } from '../ui/MapModal.tsx';
import { TileThumb } from '../ui/TileThumb.tsx';
import { isTyping } from '../input-focus.ts';
import { label } from '../ui/labels.ts';
import { categorize } from './categories.ts';
import { FLOOR_OPTIONS, FURNITURE_OPTIONS, RUG_OPTIONS, WALL_OPTIONS, demoDraftKey, type EditorController, type Tool } from './editor-controller.ts';

const TOOLS: { tool: Tool; label: string; hint: string }[] = [
  { tool: 'select', label: 'Selecionar', hint: 'Clique para selecionar; arraste para mover.' },
  { tool: 'floor', label: 'Piso', hint: 'Arraste para pintar o piso.' },
  { tool: 'wall', label: 'Parede', hint: 'Arraste para levantar paredes.' },
  { tool: 'rug', label: 'Tapete', hint: 'Arraste para desenhar o tapete, de qualquer tamanho.' },
  { tool: 'erase', label: 'Borracha', hint: 'Arraste para apagar a camada escolhida.' },
  { tool: 'furniture', label: 'Móvel', hint: 'Clique para pôr o móvel escolhido.' },
  { tool: 'zone', label: 'Zona', hint: 'Arraste para desenhar a zona.' },
  { tool: 'desk', label: 'Mesa', hint: 'Clique no mapa para colocar a mesa ou bancada.' },
  { tool: 'spawn', label: 'Spawn', hint: 'Clique onde as pessoas aparecem ao entrar.' },
];

const DIR_LABEL: Record<Dir, string> = { up: 'cima', down: 'baixo', left: 'esquerda', right: 'direita' };

/** Re-renderiza o componente a cada mudança do controlador (versão como snapshot). */
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
  localDraft: boolean;
  onBaseVersion: (version: number) => void;
  onClose: () => void;
}

/** Ferramentas, seleção, erros ao vivo e salvar. A edição em si acontece na cena. */
export function EditorPanel({ controller, spaceId, baseVersion, localDraft, onBaseVersion, onClose }: Props) {
  useEditor(controller);
  const [status, setStatus] = useState<{ kind: 'ok' | 'error' | 'stale'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const errors = controller.errors();
  const selected = controller.selected();
  const layer = controller.selection?.layer;

  useEffect(() => {
    // Atalhos do editor: Ctrl/Cmd+Z desfaz, Ctrl/Cmd+Y ou Ctrl/Cmd+Shift+Z refaz, Delete remove e R gira.
    const onKey = (event: KeyboardEvent) => {
      const typing = isTyping();
      if (typing) return;
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'z' && !event.shiftKey) {
        event.preventDefault();
        controller.undo();
      } else if (modifier && (event.key.toLowerCase() === 'y' || (event.key.toLowerCase() === 'z' && event.shiftKey))) {
        event.preventDefault();
        controller.redo();
      } else if (event.key === 'Delete' || event.key === 'Backspace') {
        controller.removeSelected();
      } else if (event.key.toLowerCase() === 'r') {
        controller.rotateSelected();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [controller]);

  /** Valida no servidor, confirma a liberação de mesas ocupadas que somem e salva com a versão base. */
  const save = async () => {
    setSaving(true);
    setStatus(null);
    try {
      if (localDraft) {
        sessionStorage.setItem(demoDraftKey(spaceId), JSON.stringify(controller.doc));
        controller.markClean();
        setStatus({ kind: 'ok', text: 'Cópia salva nesta aba.' });
        return;
      }
      const validation = await mapApi.validate(spaceId, controller.doc);
      if (validation.errors.length > 0) {
        setStatus({ kind: 'error', text: 'O servidor recusou o mapa: corrija os erros abaixo.' });
        return;
      }
      if (
        validation.orphanDesks.length > 0 &&
        !confirm(`Estas mesas ocupadas deixam de existir e serão liberadas: ${validation.orphanDesks.join(', ')}. Salvar mesmo assim?`)
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
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (controller.dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [controller]);

  const fromTemplate = () => {
    if (!confirm('Começar do modelo descarta o mapa em edição. Continuar?')) return;
    controller.reset(adoptDocument(controller.doc, smallOffice as TiledDoc));
  };

  const restoreDemo = async () => {
    if (!confirm('Restaurar o mapa original da demo nesta aba?')) return;
    try {
      const space = await api.space(spaceId);
      sessionStorage.removeItem(demoDraftKey(spaceId));
      controller.reset(space.map as TiledDoc);
      controller.markClean();
      setStatus({ kind: 'ok', text: 'Mapa original restaurado nesta aba.' });
    } catch {
      setStatus({ kind: 'error', text: 'Não deu para restaurar o mapa original.' });
    }
  };

  return (
    <aside className="sidebar editor-panel">
      <section>
        <h3>Editar mapa</h3>
        {localDraft && <p className="muted">Suas alterações ficam na cópia desta aba. O escritório compartilhado continua disponível quando você sai do editor.</p>}
        <div className="tool-grid">
          {TOOLS.map((entry) => (
            <button
              key={entry.tool}
              type="button"
              className={controller.tool === entry.tool ? 'primary' : ''}
              aria-pressed={controller.tool === entry.tool}
              title={entry.hint}
              onClick={() => controller.setTool(entry.tool)}
            >
              {entry.label}
            </button>
          ))}
        </div>
        <p className="muted">{TOOLS.find((entry) => entry.tool === controller.tool)?.hint} Setas movem a câmera.</p>

        {controller.tool === 'floor' && (
          <label className="fields">
            Tipo de piso
            <select value={controller.floorFrame} onChange={(event) => controller.setOption({ floorFrame: Number(event.target.value) })}>
              {FLOOR_OPTIONS.map((floor) => (
                <option key={floor.frame} value={floor.frame}>
                  {floor.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'wall' && (
          <label className="fields">
            Tipo de parede
            <select value={controller.wallFrame} onChange={(event) => controller.setOption({ wallFrame: Number(event.target.value) })}>
              {WALL_OPTIONS.map((wall) => (
                <option key={wall.frame} value={wall.frame}>
                  {wall.label}
                </option>
              ))}
            </select>
          </label>
        )}
        {controller.tool === 'rug' && (
          <label className="fields">
            Tapete
            <select value={controller.rug} onChange={(event) => controller.setOption({ rug: event.target.value as RugId })}>
              {RUG_OPTIONS.map((rug) => (
                <option key={rug.rug} value={rug.rug}>
                  {rug.label}
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
              onChange={(event) => controller.setOption({ eraseLayer: event.target.value as 'walls' | 'floor' })}
            >
              <option value="walls">paredes</option>
              <option value="floor">piso</option>
            </select>
          </label>
        )}
        {controller.tool === 'furniture' && (
          <div className="furniture-palette">
            {categorize(FURNITURE_OPTIONS).map((group) => (
              <fieldset key={group.label} className="picker">
                <legend>{group.label}</legend>
                <div role="radiogroup" aria-label={group.label} className="furniture-grid">
                  {group.items.map((furniture) => {
                    const selected = controller.furniture.tileset === furniture.tileset && controller.furniture.frame === furniture.frame;
                    const name = label(furniture.item, 'furniture');
                    return (
                      <button
                        key={`${furniture.tileset}:${furniture.frame}`}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        aria-label={name}
                        title={name}
                        className={selected ? 'furniture-option selected' : 'furniture-option'}
                        onClick={() => controller.setOption({ furniture: { tileset: furniture.tileset, frame: furniture.frame } })}
                      >
                        <TileThumb tileset={furniture.tileset} frame={furniture.frame} />
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}
          </div>
        )}
        {controller.tool === 'desk' && (
          <div className="fields">
            <label>
              Disposição
              <select
                value={controller.deskArrangement}
                onChange={(event) => controller.setOption({ deskArrangement: event.target.value as DeskArrangement })}
              >
                <option value="single">Individual</option>
                <option value="row">Fileira</option>
                <option value="spine">Espinha (duas fileiras)</option>
              </select>
            </label>
            {controller.deskArrangement !== 'single' && (
              <label>
                {controller.deskArrangement === 'spine' ? 'Mesas de cada lado' : 'Mesas na fileira'}
                <select value={controller.deskCount} onChange={(event) => controller.setOption({ deskCount: Number(event.target.value) })}>
                  {Array.from({ length: MAX_DESKS_PER_ROW }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>{count}</option>
                  ))}
                </select>
              </label>
            )}
            <label>
              {controller.deskArrangement === 'spine' ? 'Sentido da espinha' : 'Cadeira para'}
              <select
                value={controller.deskArrangement === 'spine' ? (controller.deskOrientation === 'up' || controller.deskOrientation === 'down' ? 'down' : 'right') : controller.deskOrientation}
                onChange={(event) => controller.setOption({ deskOrientation: event.target.value as Dir })}
              >
                {controller.deskArrangement === 'spine' ? (
                  <>
                    <option value="down">Horizontal</option>
                    <option value="right">Vertical</option>
                  </>
                ) : DIRS.map((dir) => (
                  <option key={dir} value={dir}>{DIR_LABEL[dir]}</option>
                ))}
              </select>
            </label>
            {controller.deskPlacementBlocked && (
              <span className="error" role="status">Escolha uma área livre com espaço para as mesas e as cadeiras.</span>
            )}
          </div>
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
                  onBlur={(event) => controller.setZone({ name: event.target.value })}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                />
              </label>
              <label>
                Tipo
                <select
                  value={textProp(selected, 'type', 'open')}
                  onChange={(event) => controller.setZone({ type: event.target.value as ZoneType })}
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
          {controller.selectedGameTable() && (
            <button type="button" onClick={() => controller.rotateSelected()}>
              Girar (R)
            </button>
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
          {saving ? 'Salvando…' : localDraft ? 'Salvar cópia nesta aba' : 'Salvar mapa'}
        </button>
        {localDraft && <button type="button" onClick={() => void restoreDemo()}>Restaurar mapa da demo</button>}
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
