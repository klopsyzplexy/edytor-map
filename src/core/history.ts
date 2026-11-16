// Historia cofnij/ponów. Każda zmiana mapy to wpis z funkcjami undo/redo.
export interface HistoryEntry {
  label: string;
  undo(): void;
  redo(): void;
}

export class History {
  private past: HistoryEntry[] = [];
  private future: HistoryEntry[] = [];
  constructor(private readonly limit = 200) {}

  push(e: HistoryEntry): void {
    this.past.push(e);
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  undo(): HistoryEntry | null {
    const e = this.past.pop();
    if (!e) return null;
    e.undo();
    this.future.push(e);
    return e;
  }

  redo(): HistoryEntry | null {
    const e = this.future.pop();
    if (!e) return null;
    e.redo();
    this.past.push(e);
    return e;
  }

  clear(): void {
    this.past = [];
    this.future = [];
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }
  get canRedo(): boolean {
    return this.future.length > 0;
  }
  get undoLabel(): string | undefined {
    return this.past[this.past.length - 1]?.label;
  }
  get redoLabel(): string | undefined {
    return this.future[this.future.length - 1]?.label;
  }
}
