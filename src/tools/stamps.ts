// Stemple wysokości: przykładowe obrazy z examples/stemple/ i obrazy wgrane przez użytkownika.
// Obraz zamieniamy na jasność 0–1 (HeightStamp); jasny piksel = wyżej.
import type { HeightStamp } from '../core/terrain';

export interface StampEntry {
  id: string;
  /** Wbudowane: klucz tłumaczenia `stamp.<id>`; własne: nazwa pliku. */
  name: string;
  builtin: boolean;
  /** Szary 50% = bez zmian (ciemniejsze obniża). Wbudowane mają to ustawione z góry. */
  midZero: boolean;
  /** Adres obrazka (miniatura w panelu). */
  url: string;
  stamp: HeightStamp | null;
  /** Dane własnego obrazu (do zapisu roboczego). */
  data?: ArrayBuffer;
}

const BUILTIN: Array<{ id: string; midZero: boolean }> = [
  { id: 'gora', midZero: false },
  { id: 'plaskowyz', midZero: false },
  { id: 'krater', midZero: true },
  { id: 'wawoz', midZero: true },
];

const MAX = 256;

/** Obraz → jasność 0–1 (zmniejszony do najwyżej 256 × 256). */
async function decode(url: string): Promise<HeightStamp> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const img = await createImageBitmap(await res.blob());
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const w = Math.max(2, Math.round(img.width * k));
  const h = Math.max(2, Math.round(img.height * k));
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.drawImage(img, 0, 0, w, h);
  const px = g.getImageData(0, 0, w, h).data;
  const data = new Float32Array(w * h);
  for (let p = 0; p < w * h; p++) {
    const a = px[p * 4 + 3] / 255;
    // przezroczystość traktujemy jak czerń (bez zmian)
    data[p] = ((0.2126 * px[p * 4] + 0.7152 * px[p * 4 + 1] + 0.0722 * px[p * 4 + 2]) / 255) * a;
  }
  return { w, h, data };
}

export class StampLibrary {
  readonly entries: StampEntry[] = BUILTIN.map((b) => ({ id: b.id, name: `stamp.${b.id}`, builtin: true, midZero: b.midZero, url: `stemple/${b.id}.png`, stamp: null }));
  onChange: () => void = () => {};

  constructor() {
    for (const e of this.entries)
      decode(e.url).then(
        (st) => {
          e.stamp = st;
          this.onChange();
        },
        (err) => console.warn('Nie udało się wczytać stempla', e.url, err),
      );
  }

  get(id: string): StampEntry | undefined {
    return this.entries.find((e) => e.id === id);
  }

  /** Własny obraz (PNG, JPG…). Ten sam plik wgrany drugi raz zastępuje poprzedni. */
  async addFile(name: string, data: ArrayBuffer): Promise<StampEntry> {
    const url = URL.createObjectURL(new Blob([data]));
    const stamp = await decode(url);
    const id = `wlasny:${name}`;
    const old = this.get(id);
    if (old) {
      URL.revokeObjectURL(old.url);
      this.entries.splice(this.entries.indexOf(old), 1);
    }
    const e: StampEntry = { id, name, builtin: false, midZero: false, url, stamp, data };
    this.entries.push(e);
    this.onChange();
    return e;
  }

  /** Własne stemple do zapisu roboczego. */
  custom(): Record<string, ArrayBuffer> {
    const out: Record<string, ArrayBuffer> = {};
    for (const e of this.entries) if (!e.builtin && e.data) out[e.name] = e.data;
    return out;
  }
}
