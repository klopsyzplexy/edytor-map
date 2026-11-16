// Import modeli 3D: .glb, .gltf (z .bin i teksturami), .fbx, .obj (z .mtl i teksturami), także w archiwum .zip.
// Każdy model zamieniamy na .glb (binarny glTF) – jeden format wewnętrzny dla mapy, zapisu roboczego i eksportu.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { unzipSync, zipSync } from 'three/addons/libs/fflate.module.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MTLLoader } from 'three/addons/loaders/MTLLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { TGALoader } from 'three/addons/loaders/TGALoader.js';
import { classifyModelFiles, fileBase, fileExt, fileStem, findFile, modelFormat, objMaterialLibs } from '../core/modelFiles';

export interface InputFile {
  name: string;
  data: ArrayBuffer;
}

export interface ImportedModel {
  /** Nazwa modelu (nazwa pliku bez rozszerzenia) – po niej schemat znajduje model. */
  name: string;
  /** Plik, z którego powstał model. */
  source: string;
  glb: ArrayBuffer;
}

export type ImportProblem =
  | { code: 'missing'; file: string; missing: string[] }
  | { code: 'failed'; file: string; detail: string }
  | { code: 'unused'; file: string }
  | { code: 'noModel' };

const MIME: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', bmp: 'image/bmp' };

/** Rozpakowuje archiwa .zip (pomija katalogi i śmieci z macOS). */
function expandZips(files: InputFile[]): InputFile[] {
  const out: InputFile[] = [];
  for (const f of files) {
    if (fileExt(f.name) !== 'zip') {
      out.push(f);
      continue;
    }
    const entries = unzipSync(new Uint8Array(f.data));
    for (const [path, bytes] of Object.entries(entries)) {
      if (path.endsWith('/') || path.includes('__MACOSX') || fileBase(path).startsWith('.')) continue;
      out.push({ name: fileBase(path), data: bytes.slice().buffer });
    }
  }
  return out;
}

/**
 * Zamienia wskazane pliki na modele .glb. Pliki towarzyszące (tekstury, .bin, .mtl) dobiera po nazwie,
 * bez względu na katalogi. Zwraca modele i listę problemów (brakujące pliki, błędy wczytania).
 */
export async function importModelFiles(input: InputFile[]): Promise<{ models: ImportedModel[]; problems: ImportProblem[] }> {
  const problems: ImportProblem[] = [];
  let files: InputFile[];
  try {
    files = expandZips(input);
  } catch (e) {
    return { models: [], problems: [{ code: 'failed', file: input.map((f) => f.name).join(', '), detail: String(e) }] };
  }
  const byName = new Map(files.map((f) => [fileBase(f.name), f]));
  const urls = new Map<string, string>();
  const resolve = (ref: string): string | undefined => {
    const f = findFile(byName, ref);
    if (!f) return undefined;
    if (!urls.has(f.name)) urls.set(f.name, URL.createObjectURL(new Blob([f.data], { type: MIME[fileExt(f.name)] ?? 'application/octet-stream' })));
    return urls.get(f.name);
  };
  const { models: mains, unknown } = classifyModelFiles(files.map((f) => f.name));
  for (const u of unknown) problems.push({ code: 'unused', file: u });
  if (!mains.length) problems.push({ code: 'noModel' });
  const models: ImportedModel[] = [];
  try {
    for (const name of mains) {
      const missing = new Set<string>();
      try {
        const glb = await convert(byName.get(name)!, resolve, missing, (ref) => findFile(byName, ref));
        models.push({ name: fileStem(name), source: name, glb });
        if (missing.size) problems.push({ code: 'missing', file: name, missing: [...missing] });
      } catch (e) {
        if (missing.size) problems.push({ code: 'missing', file: name, missing: [...missing] });
        else problems.push({ code: 'failed', file: name, detail: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    for (const u of urls.values()) URL.revokeObjectURL(u);
  }
  return { models, problems };
}

/** Model wskazany w schemacie adresem URL w innym formacie niż .glb: pobiera go i zamienia na .glb. */
export async function importModelFromUrl(url: string): Promise<ArrayBuffer> {
  const base = new URL(url, document.baseURI);
  const res = await fetch(base);
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  const main = { name: fileBase(base.pathname), data: await res.arrayBuffer() };
  const missing = new Set<string>();
  const texts = new Map<string, string>();
  // .mtl dla .obj pobieramy z góry, bo loader potrzebuje tekstu
  if (modelFormat(main.name) === 'obj')
    for (const lib of objMaterialLibs(new TextDecoder().decode(main.data))) {
      const r = await fetch(new URL(lib, base)).catch(() => null);
      if (r?.ok) texts.set(fileBase(lib), await r.text());
    }
  return convert(main, (ref) => new URL(ref, base).href, missing, (ref) => {
    const t = texts.get(fileBase(ref));
    return t === undefined ? undefined : { name: ref, data: new TextEncoder().encode(t).buffer as ArrayBuffer };
  });
}

/** Śledzi wczytywanie tekstur, żeby eksport poczekał na wszystkie. */
function trackedManager(resolve: (ref: string) => string | undefined, missing: Set<string>) {
  const manager = new THREE.LoadingManager();
  const names = new Map<string, string>();
  let pending = 0;
  let waiters: Array<() => void> = [];
  manager.setURLModifier((url) => {
    if (/^(data|blob):/i.test(url)) return url;
    const r = resolve(url);
    if (!r) {
      missing.add(fileBase(url));
      return 'data:,';
    }
    names.set(r, fileBase(url));
    return r;
  });
  const start = manager.itemStart.bind(manager);
  const end = manager.itemEnd.bind(manager);
  const error = manager.itemError.bind(manager);
  manager.itemStart = (u: string) => {
    pending++;
    start(u);
  };
  manager.itemEnd = (u: string) => {
    pending = Math.max(0, pending - 1);
    end(u);
    if (pending === 0) {
      const w = waiters;
      waiters = [];
      w.forEach((fn) => fn());
    }
  };
  manager.itemError = (u: string) => {
    // brakujący plik zgłosił już modyfikator adresów; tu łapiemy pliki, których nie dało się odczytać
    if (u !== 'data:,') missing.add(names.get(u) ?? fileBase(u));
    error(u);
  };
  manager.addHandler(/\.tga$/i, new TGALoader(manager));
  const idle = () =>
    new Promise<void>((res) => {
      if (pending === 0) return res();
      waiters.push(res);
      setTimeout(res, 20000);
    });
  return { manager, idle };
}

async function convert(main: InputFile, resolve: (ref: string) => string | undefined, missing: Set<string>, companion: (ref: string) => InputFile | undefined): Promise<ArrayBuffer> {
  const fmt = modelFormat(main.name);
  const { manager, idle } = trackedManager(resolve, missing);
  let root: THREE.Object3D;
  let animations: THREE.AnimationClip[] = [];
  switch (fmt) {
    case 'glb': {
      // już w formacie wewnętrznym; sprawdzamy tylko, czy się wczytuje
      await new GLTFLoader(manager).parseAsync(main.data, '');
      return main.data;
    }
    case 'gltf': {
      const gltf = await new GLTFLoader(manager).parseAsync(new TextDecoder().decode(main.data), '');
      root = gltf.scene;
      animations = gltf.animations;
      break;
    }
    case 'fbx': {
      root = new FBXLoader(manager).parse(main.data, '');
      animations = (root as THREE.Group).animations ?? [];
      break;
    }
    case 'obj': {
      const text = new TextDecoder().decode(main.data);
      const loader = new OBJLoader(manager);
      for (const lib of objMaterialLibs(text)) {
        const f = companion(lib);
        if (!f) {
          missing.add(fileBase(lib));
          continue;
        }
        const creator = new MTLLoader(manager).parse(new TextDecoder().decode(f.data), '');
        creator.preload();
        loader.setMaterials(creator);
      }
      root = loader.parse(text);
      break;
    }
    default:
      throw new Error(`Nieobsługiwany format: ${main.name}`);
  }
  await idle();
  prepareForExport(root);
  const out = await new GLTFExporter().parseAsync(root, { binary: true, animations, onlyVisible: false });
  return out as ArrayBuffer;
}

const TEX_SLOTS = ['map', 'normalMap', 'emissiveMap', 'alphaMap', 'aoMap', 'bumpMap', 'specularMap', 'roughnessMap', 'metalnessMap', 'lightMap', 'displacementMap'] as const;

function hasImage(t: THREE.Texture): boolean {
  const img = t.image as { width?: number; naturalWidth?: number; data?: unknown } | undefined;
  if (!img) return false;
  if (img.data) return true;
  return (img.naturalWidth ?? img.width ?? 0) > 0;
}

/** Usuwa tekstury, których nie udało się wczytać, i zamienia materiały Phong/Lambert na PBR (glTF zna tylko PBR). */
function prepareForExport(root: THREE.Object3D): void {
  const convertMat = (m: THREE.Material): THREE.Material => {
    const any = m as unknown as Record<string, unknown>;
    for (const slot of TEX_SLOTS) {
      const t = any[slot];
      if (t instanceof THREE.Texture && !hasImage(t)) any[slot] = null;
    }
    if (!(m instanceof THREE.MeshPhongMaterial || m instanceof THREE.MeshLambertMaterial)) return m;
    const shininess = m instanceof THREE.MeshPhongMaterial ? m.shininess : 0;
    const out = new THREE.MeshStandardMaterial({
      name: m.name,
      color: m.color,
      map: m.map,
      emissive: m.emissive,
      emissiveMap: m.emissiveMap,
      emissiveIntensity: m.emissiveIntensity,
      normalMap: m instanceof THREE.MeshPhongMaterial ? m.normalMap : null,
      alphaMap: m.alphaMap,
      aoMap: m.aoMap,
      opacity: m.opacity,
      transparent: m.transparent,
      alphaTest: m.alphaTest,
      side: m.side,
      vertexColors: m.vertexColors,
      roughness: 1 - Math.min(shininess / 100, 1) * 0.6,
      metalness: 0,
    });
    return out;
  };
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(convertMat) : convertMat(mesh.material);
  });
}

/** Archiwum .zip z modelami .glb (do przekazania grze). */
export function zipModels(models: Array<{ name: string; data: ArrayBuffer }>): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const m of models) entries[m.name] = new Uint8Array(m.data);
  return zipSync(entries, { level: 0 });
}
