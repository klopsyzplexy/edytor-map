// Modele ze schematu: wczytywanie, pamięć podręczna i powierzchnie chodliwe modeli.
// Wewnętrznie każdy model to .glb; inne formaty zamienia import (modelImport.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Vec3 } from '../core/map';
import { fileStem, modelFormat } from '../core/modelFiles';
import type { Box3 } from '../core/objectModel';
import { cloneModelCollision, collisionBand, computeOutline, parseModelCollision, type ModelCollision, type Outline } from '../core/modelCollision';
import { importModelFromUrl } from './modelImport';

export type ModelState = 'loading' | 'ready' | 'error';

export class ModelLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<string, { state: ModelState; scene?: THREE.Group; animations?: THREE.AnimationClip[] }>();
  /** Modele wczytane przez użytkownika (nazwa bez rozszerzenia → adres blob z danymi .glb). */
  private files = new Map<string, string>();
  /** Dane .glb modeli (klucz: nazwa.glb) – do zapisu roboczego i pobrania. */
  readonly fileData = new Map<string, ArrayBuffer>();
  /** Folder modelu w bibliotece (klucz: nazwa.glb; brak = bez folderu). */
  readonly folders = new Map<string, string>();
  /** Skala bazowa modelu w bibliotece (klucz: nazwa.glb) – domyślna dla map, które jej jeszcze nie mają. */
  readonly baseScales = new Map<string, number>();
  /** Kategoria modelu użyta przy normalizacji (klucz: nazwa.glb). */
  readonly categories = new Map<string, string>();
  /** Domyślny obrys kolizji modelu w bibliotece (klucz: nazwa.glb) – dla map, które modelu jeszcze nie znają. */
  readonly collisions = new Map<string, ModelCollision>();
  /** Wyliczone obrysy kolizji (klucz: odwołanie|szczegół|pasmo) i trójkąty modeli. */
  private outlines = new Map<string, Outline>();
  private tris = new Map<string, Float32Array>();
  /** Licznik zmian pliku modelu (miniatury odświeżają się po podmianie). */
  readonly versions = new Map<string, number>();
  onChange: () => void = () => {};

  /** Dodaje model .glb. Schemat znajduje go po nazwie pliku bez rozszerzenia (drzewo.fbx → drzewo.glb). */
  addFile(name: string, data: ArrayBuffer): void {
    const key = fileStem(name);
    const old = this.files.get(key);
    if (old) URL.revokeObjectURL(old);
    this.files.set(key, URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' })));
    this.fileData.set(`${key}.glb`, data);
    this.versions.set(`${key}.glb`, (this.versions.get(`${key}.glb`) ?? 0) + 1);
    // przeładuj modele, które wskazują na ten plik
    for (const k of [...this.cache.keys()]) if (fileStem(k) === key) this.cache.delete(k);
    this.forgetGeometry(key);
    this.onChange();
  }

  /** Usuwa model z biblioteki (obiekty, które go używają, pokażą zastępczą bryłę). */
  remove(name: string): void {
    const key = fileStem(name);
    const url = this.files.get(key);
    if (url) URL.revokeObjectURL(url);
    this.files.delete(key);
    this.fileData.delete(`${key}.glb`);
    this.folders.delete(`${key}.glb`);
    this.baseScales.delete(`${key}.glb`);
    this.categories.delete(`${key}.glb`);
    this.collisions.delete(`${key}.glb`);
    for (const k of [...this.cache.keys()]) if (fileStem(k) === key) this.cache.delete(k);
    this.forgetGeometry(key);
    this.onChange();
  }

  setFolder(name: string, folder: string): void {
    const key = `${fileStem(name)}.glb`;
    if (folder.trim()) this.folders.set(key, folder.trim());
    else this.folders.delete(key);
    this.onChange();
  }

  /** Skala bazowa i kategoria modelu w bibliotece (1 / brak = bez normalizacji). */
  setBaseScale(name: string, baseScale: number, category?: string): void {
    const key = `${fileStem(name)}.glb`;
    if (baseScale === 1) this.baseScales.delete(key);
    else this.baseScales.set(key, baseScale);
    if (category) this.categories.set(key, category);
    else if (category === '') this.categories.delete(key);
    this.onChange();
  }

  baseScaleOf(name: string): number | undefined {
    return this.baseScales.get(`${fileStem(name)}.glb`);
  }

  /** Domyślny obrys kolizji modelu w bibliotece (undefined – wyliczany z kształtu z domyślnym szczegółem). */
  setCollision(name: string, c: ModelCollision | undefined): void {
    const key = `${fileStem(name)}.glb`;
    if (c && (c.detail !== undefined || c.polygons?.length)) this.collisions.set(key, cloneModelCollision(c));
    else this.collisions.delete(key);
    this.onChange();
  }

  collisionOf(name: string): ModelCollision | undefined {
    const c = this.collisions.get(`${fileStem(name)}.glb`);
    return c ? cloneModelCollision(c) : undefined;
  }

  /** Dostawca obrysów dla core/collision (collectCollision, buildTriggers). */
  readonly outlineProvider = (ref: string, detail: number, band: number): Outline | null => this.collisionOutline(ref, detail, band);

  private forgetGeometry(stem: string): void {
    for (const k of [...this.tris.keys()]) if (fileStem(k) === stem) this.tris.delete(k);
    for (const k of [...this.outlines.keys()]) if (fileStem(k.split('|')[0]) === stem) this.outlines.delete(k);
  }

  /** Wszystkie trójkąty modelu w jego własnym układzie (x, y, z × 3) albo null, dopóki się nie wczyta. */
  triangles(ref: string): Float32Array | null {
    const hit = this.tris.get(ref);
    if (hit) return hit;
    const scene = this.cache.get(ref)?.scene;
    if (!scene) {
      this.instance(ref);
      return null;
    }
    scene.updateMatrixWorld(true);
    const out: number[] = [];
    const v = new THREE.Vector3();
    scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (!m.isMesh) return;
      const pos = m.geometry.getAttribute('position');
      const index = m.geometry.getIndex();
      const count = index ? index.count : pos.count;
      for (let k = 0; k + 2 < count; k += 3)
        for (let c = 0; c < 3; c++) {
          v.fromBufferAttribute(pos, index ? index.getX(k + c) : k + c).applyMatrix4(m.matrixWorld);
          out.push(v.x, v.y, v.z);
        }
    });
    const tris = new Float32Array(out);
    this.tris.set(ref, tris);
    return tris;
  }

  /**
   * Obrys kolizji z kształtu modelu (układ modelu): przekrój w paśmie `band` nad podstawą modelu,
   * z poziomem szczegółu `detail`. Liczony raz i pamiętany. Null, dopóki model się nie wczyta.
   */
  collisionOutline(ref: string, detail: number, band: number): Outline | null {
    const key = `${ref}|${detail.toFixed(3)}|${band.toFixed(4)}`;
    const hit = this.outlines.get(key);
    if (hit) return hit;
    const tris = this.triangles(ref);
    if (!tris) return null;
    const b = collisionBand(tris, band);
    const o = b ? computeOutline(tris, b[0], b[1], detail) : [];
    this.outlines.set(key, o);
    return o;
  }

  /** Foldery, skale bazowe i kategorie biblioteki do zapisu (plik biblioteka.json w projekcie i zapis roboczy). */
  libraryJson(): { models: Array<{ file: string; folder?: string; baseScale?: number; category?: string; collision?: ModelCollision }> } {
    return {
      models: this.fileNames.map((f) => ({
        file: f,
        ...(this.folders.get(f) ? { folder: this.folders.get(f) } : {}),
        ...(this.baseScales.has(f) ? { baseScale: this.baseScales.get(f) } : {}),
        ...(this.categories.has(f) ? { category: this.categories.get(f) } : {}),
        ...(this.collisions.has(f) ? { collision: this.collisions.get(f) } : {}),
      })),
    };
  }

  applyLibraryJson(j: unknown): void {
    const list = typeof j === 'object' && j && Array.isArray((j as { models?: unknown }).models) ? (j as { models: unknown[] }).models : [];
    for (const m of list) {
      if (typeof m !== 'object' || !m) continue;
      const { file, folder, baseScale, category, collision } = m as { file?: unknown; folder?: unknown; baseScale?: unknown; category?: unknown; collision?: unknown };
      if (typeof file !== 'string') continue;
      const key = `${fileStem(file)}.glb`;
      if (typeof folder === 'string' && folder) this.folders.set(key, folder);
      if (typeof baseScale === 'number' && baseScale > 0 && baseScale !== 1) this.baseScales.set(key, baseScale);
      if (typeof category === 'string' && category) this.categories.set(key, category);
      const c = parseModelCollision(collision);
      if (c) this.collisions.set(key, c);
    }
    this.onChange();
  }

  get fileNames(): string[] {
    return [...this.fileData.keys()];
  }

  /** Wczytuje model: najpierw spośród wskazanych plików, potem spod adresu (inne formaty niż .glb są zamieniane). */
  private async load(ref: string): Promise<{ scene: THREE.Group; animations: THREE.AnimationClip[] }> {
    const local = this.files.get(fileStem(ref));
    if (local) return this.loader.loadAsync(local);
    const fmt = modelFormat(ref);
    if (fmt && fmt !== 'glb') return this.loader.parseAsync(await importModelFromUrl(ref), '');
    return this.loader.loadAsync(ref);
  }

  state(ref: string): ModelState {
    return this.cache.get(ref)?.state ?? 'loading';
  }

  /** Kopia modelu albo null, jeśli jeszcze się wczytuje lub nie udało się go wczytać. */
  instance(ref: string): THREE.Object3D | null {
    const c = this.cache.get(ref);
    if (!c) {
      this.cache.set(ref, { state: 'loading' });
      this.load(ref).then(
        ({ scene, animations }) => {
          this.cache.set(ref, { state: 'ready', scene, animations });
          this.onChange();
        },
        () => {
          this.cache.set(ref, { state: 'error' });
          this.onChange();
        },
      );
      return null;
    }
    return c.scene ? cloneSkinned(c.scene) : null;
  }

  /** Kopia modelu z animacjami (postać w trybie gry) albo null, dopóki się wczytuje. */
  animated(ref: string): { object: THREE.Object3D; clips: THREE.AnimationClip[] } | null {
    const object = this.instance(ref);
    return object ? { object, clips: this.cache.get(ref)?.animations ?? [] } : null;
  }

  /** Wczytuje model (jeśli trzeba) i zwraca jego pudełko; null, gdy wczytać się nie da. */
  async measure(ref: string): Promise<Box3 | null> {
    for (let k = 0; k < 600; k++) {
      this.instance(ref);
      const st = this.state(ref);
      if (st === 'error') return null;
      if (st === 'ready') return this.bounds(ref);
      await new Promise((r) => setTimeout(r, 50));
    }
    return null;
  }

  /** Pudełko modelu w jego własnym układzie (null, dopóki się nie wczyta). */
  bounds(ref: string): Box3 | null {
    const scene = this.cache.get(ref)?.scene;
    if (!scene) {
      this.instance(ref);
      return null;
    }
    const b = new THREE.Box3().setFromObject(scene, true);
    if (b.isEmpty()) return null;
    return { min: b.min.toArray() as Vec3, max: b.max.toArray() as Vec3 };
  }

  /**
   * Trójkąty powierzchni chodliwej w układzie modelu: siatki z „walkable” w nazwie,
   * a gdy ich nie ma – ściany skierowane do góry (normalna Y > 0,7).
   */
  walkableTriangles(ref: string): Float32Array | null {
    const scene = this.cache.get(ref)?.scene;
    if (!scene) return null;
    scene.updateMatrixWorld(true);
    const meshes: THREE.Mesh[] = [];
    scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) meshes.push(o as THREE.Mesh);
    });
    const named = meshes.filter((m) => /walkable/i.test(m.name) || /walkable/i.test(m.parent?.name ?? ''));
    const useAll = named.length > 0;
    const out: number[] = [];
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const c = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (const m of useAll ? named : meshes) {
      const g = m.geometry;
      const pos = g.getAttribute('position');
      const index = g.getIndex();
      const count = index ? index.count : pos.count;
      for (let k = 0; k < count; k += 3) {
        const ia = index ? index.getX(k) : k;
        const ib = index ? index.getX(k + 1) : k + 1;
        const ic = index ? index.getX(k + 2) : k + 2;
        a.fromBufferAttribute(pos, ia).applyMatrix4(m.matrixWorld);
        b.fromBufferAttribute(pos, ib).applyMatrix4(m.matrixWorld);
        c.fromBufferAttribute(pos, ic).applyMatrix4(m.matrixWorld);
        n.subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
        // z siatki „walkable” bierzemy ściany skierowane choć trochę do góry, z całego modelu – tylko prawie poziome
        if (n.y < (useAll ? 0.1 : 0.7)) continue;
        out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
    return new Float32Array(out);
  }
}
