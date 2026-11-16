// Otwieranie i zapisywanie plików: File System Access API (Chrome, Edge), a gdzie go nie ma – wgranie i pobranie.

interface FsHandle {
  name: string;
  getFile(): Promise<File>;
  createWritable(): Promise<{ write(d: Blob | string): Promise<void>; close(): Promise<void> }>;
}
type PickerWindow = Window & {
  showOpenFilePicker?: (o?: unknown) => Promise<FsHandle[]>;
  showSaveFilePicker?: (o?: unknown) => Promise<FsHandle>;
};
const w = window as PickerWindow;

export const hasFileSystemAccess = typeof w.showSaveFilePicker === 'function';

export interface OpenedFile {
  name: string;
  text: string;
  handle?: FsHandle;
}

const JSON_TYPES = [{ description: 'JSON', accept: { 'application/json': ['.json'] } }];

function inputPick(accept: string, multiple: boolean): Promise<File[]> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.multiple = multiple;
    input.onchange = () => resolve([...(input.files ?? [])]);
    input.addEventListener('cancel', () => resolve([]));
    input.click();
  });
}

/** Otwiera plik JSON. Zwraca null, gdy użytkownik anulował. */
export async function openJsonFile(): Promise<OpenedFile | null> {
  if (w.showOpenFilePicker) {
    try {
      const [handle] = await w.showOpenFilePicker({ types: JSON_TYPES, multiple: false });
      const file = await handle.getFile();
      return { name: file.name, text: await file.text(), handle };
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  const [file] = await inputPick('.json,application/json', false);
  return file ? { name: file.name, text: await file.text() } : null;
}

export async function openBinaryFiles(accept: string): Promise<Array<{ name: string; data: ArrayBuffer }>> {
  const files = await inputPick(accept, true);
  return Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() })));
}

/**
 * Zapisuje tekst. Z uchwytem pliku – nadpisuje go; bez – pyta o miejsce (albo pobiera plik).
 * Zwraca uchwyt i nazwę albo null, gdy anulowano.
 */
export async function saveTextFile(text: string, suggestedName: string, handle?: FsHandle): Promise<{ name: string; handle?: FsHandle } | null> {
  const blob = new Blob([text], { type: 'application/json' });
  if (handle) {
    const wr = await handle.createWritable();
    await wr.write(blob);
    await wr.close();
    return { name: handle.name, handle };
  }
  if (w.showSaveFilePicker) {
    try {
      const h = await w.showSaveFilePicker({ suggestedName, types: JSON_TYPES });
      return saveTextFile(text, suggestedName, h);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = suggestedName;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  return { name: suggestedName };
}

/** Pobiera plik binarny (np. archiwum modeli) do folderu „Pobrane”. */
export function downloadBlob(blob: Blob, name: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

export type { FsHandle };
