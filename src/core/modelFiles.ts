// Pliki modeli 3D przy imporcie: rozpoznawanie formatów i plików towarzyszących. Czyste funkcje, bez DOM i Three.js.
//
// Edytor przyjmuje .glb, .gltf (z .bin i teksturami), .fbx i .obj (z .mtl i teksturami), także spakowane w .zip.
// Każdy model zamienia na .glb (binarny glTF) – jeden format wewnętrzny dla mapy i eksportu.

export type ModelFormat = 'glb' | 'gltf' | 'fbx' | 'obj';
export const MODEL_FORMATS: ModelFormat[] = ['glb', 'gltf', 'fbx', 'obj'];
export const IMAGE_EXTS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'tga', 'ktx2'];
export const COMPANION_EXTS = ['bin', 'mtl', ...IMAGE_EXTS];
/** Rozszerzenia do okna wyboru plików. */
export const MODEL_ACCEPT = ['.glb', '.gltf', '.fbx', '.obj', '.zip', ...COMPANION_EXTS.map((e) => `.${e}`)].join(',');

/** Nazwa pliku bez katalogów (obsługuje też ścieżki z Windows i zakodowane spacje). */
export function fileBase(path: string): string {
  let p = path.split('?')[0].split('#')[0];
  try {
    p = decodeURIComponent(p);
  } catch {
    /* zostaw bez dekodowania */
  }
  return p.split(/[\\/]/).pop() ?? p;
}

export function fileExt(path: string): string {
  const b = fileBase(path);
  const k = b.lastIndexOf('.');
  return k > 0 ? b.slice(k + 1).toLowerCase() : '';
}

/** Nazwa pliku bez rozszerzenia – po niej schemat znajduje model (kladka.fbx i kladka.glb to ten sam model). */
export function fileStem(path: string): string {
  const b = fileBase(path);
  const k = b.lastIndexOf('.');
  return k > 0 ? b.slice(0, k) : b;
}

export function modelFormat(path: string): ModelFormat | null {
  const e = fileExt(path);
  return (MODEL_FORMATS as string[]).includes(e) ? (e as ModelFormat) : null;
}

/** Dzieli wskazane pliki na modele i pliki towarzyszące (tekstury, .bin, .mtl). Pozostałe są nieznane. */
export function classifyModelFiles(names: string[]): { models: string[]; companions: string[]; unknown: string[] } {
  const models: string[] = [];
  const companions: string[] = [];
  const unknown: string[] = [];
  for (const n of names) {
    if (modelFormat(n)) models.push(n);
    else if (COMPANION_EXTS.includes(fileExt(n))) companions.push(n);
    else unknown.push(n);
  }
  return { models, companions, unknown };
}

const isExternal = (uri: string) => !/^(data|blob):/i.test(uri);

/** Pliki zewnętrzne wskazane w .gltf (bufory i obrazy), bez danych wbudowanych (data:). */
export function gltfExternalFiles(json: unknown): string[] {
  const out: string[] = [];
  const j = json as { buffers?: Array<{ uri?: unknown }>; images?: Array<{ uri?: unknown }> };
  for (const list of [j?.buffers, j?.images]) for (const it of Array.isArray(list) ? list : []) if (typeof it?.uri === 'string' && isExternal(it.uri)) out.push(it.uri);
  return out;
}

/** Biblioteki materiałów (`mtllib`) wskazane w pliku .obj. */
export function objMaterialLibs(text: string): string[] {
  const out: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*mtllib\s+(.+?)\s*$/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Tekstury wskazane w pliku .mtl (map_Kd, map_Bump, bump, norm…), ostatni wyraz linii to nazwa pliku. */
export function mtlTextureFiles(text: string): string[] {
  const out = new Set<string>();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(map_\w+|bump|disp|decal|norm|refl)\s+(.+?)\s*$/i.exec(line);
    if (!m) continue;
    const parts = m[2].split(/\s+/);
    out.add(parts[parts.length - 1]);
  }
  return [...out];
}

/** Szuka pliku po nazwie bez względu na katalog i wielkość liter. */
export function findFile<T>(files: Map<string, T>, ref: string): T | undefined {
  const base = fileBase(ref);
  if (files.has(base)) return files.get(base);
  const low = base.toLowerCase();
  for (const [k, v] of files) if (k.toLowerCase() === low) return v;
  return undefined;
}
