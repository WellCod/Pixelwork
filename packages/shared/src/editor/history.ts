import { apply, type EditorCommand, type TiledDoc } from './commands.ts';

/** Pilha de desfazer e refazer; um comando novo descarta o que dava para refazer. */
export class CommandStack {
  private undoStack: EditorCommand[] = [];
  private redoStack: EditorCommand[] = [];
  private current: TiledDoc;
  private readonly listeners = new Set<() => void>();
  /** Conta as mudanças, para a interface saber quando redesenhar (assinantes via `subscribe`). */
  version = 0;

  constructor(doc: TiledDoc) {
    this.current = doc;
  }

  get doc(): TiledDoc {
    return this.current;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  execute(command: EditorCommand | null): void {
    if (!command) return;
    const result = apply(this.current, command);
    this.current = result.doc;
    this.undoStack.push(result.inverse);
    this.redoStack = [];
    this.changed();
  }

  undo(): void {
    const command = this.undoStack.pop();
    if (!command) return;
    const result = apply(this.current, command);
    this.current = result.doc;
    this.redoStack.push(result.inverse);
    this.changed();
  }

  redo(): void {
    const command = this.redoStack.pop();
    if (!command) return;
    const result = apply(this.current, command);
    this.current = result.doc;
    this.undoStack.push(result.inverse);
    this.changed();
  }

  /** Começa de novo a partir de outro mapa (recarregar depois de um 409, por exemplo). */
  reset(doc: TiledDoc): void {
    this.current = doc;
    this.undoStack = [];
    this.redoStack = [];
    this.changed();
  }

  private changed(): void {
    this.version++;
    for (const listener of this.listeners) listener();
  }
}
