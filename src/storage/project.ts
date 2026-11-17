// Projekt w jednym archiwum .zip: mapa, schemat, foldery biblioteki i wszystkie modele .glb.
// Opis dla twórców gier: docs/formaty.md, rozdział 3.7a.
import { unzipSync, zipSync } from 'three/addons/libs/fflate.module.js';
import { MODEL_DIR } from '../core/objectModel';

export const PROJECT_MAP = 'mapa.json';
export const PROJECT_SCHEMA = 'schemat.json';
export const PROJECT_LIBRARY = 'biblioteka.json';

export interface ProjectFiles {
  mapJson: string;
  schemaRaw: unknown;
  library: unknown;
  /** Modele: nazwa pliku (np. beczka.glb) → dane. */
  models: Array<{ name: string; data: ArrayBuffer }>;
}

const enc = new TextEncoder();
const dec = new TextDecoder();

export function packProject(p: ProjectFiles): Uint8Array {
  const files: Record<string, Uint8Array> = {
    [PROJECT_MAP]: enc.encode(p.mapJson),
    [PROJECT_SCHEMA]: enc.encode(JSON.stringify(p.schemaRaw, null, 2)),
    [PROJECT_LIBRARY]: enc.encode(JSON.stringify(p.library, null, 2)),
  };
  // modele są już skompresowane (.glb z teksturami) – zapisujemy je bez kompresji
  for (const m of p.models) files[MODEL_DIR + m.name] = new Uint8Array(m.data);
  return zipSync(Object.fromEntries(Object.entries(files).map(([k, v]) => [k, k.startsWith(MODEL_DIR) ? [v, { level: 0 }] : v])) as Parameters<typeof zipSync>[0]);
}

/** Czy archiwum to projekt edytora (ma mapa.json). */
export function isProjectZip(data: ArrayBuffer): boolean {
  try {
    return PROJECT_MAP in unzipSync(new Uint8Array(data), { filter: (f) => f.name === PROJECT_MAP });
  } catch {
    return false;
  }
}

export function unpackProject(data: ArrayBuffer): ProjectFiles {
  const files = unzipSync(new Uint8Array(data));
  if (!files[PROJECT_MAP]) throw new Error(`W archiwum brakuje pliku ${PROJECT_MAP}.`);
  const json = (name: string) => (files[name] ? JSON.parse(dec.decode(files[name])) : undefined);
  const models = Object.entries(files)
    .filter(([k]) => k.startsWith(MODEL_DIR) && k.toLowerCase().endsWith('.glb'))
    .map(([k, v]) => ({ name: k.slice(MODEL_DIR.length), data: v.slice().buffer }));
  return { mapJson: dec.decode(files[PROJECT_MAP]), schemaRaw: json(PROJECT_SCHEMA), library: json(PROJECT_LIBRARY), models };
}
