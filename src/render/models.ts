// Modele ze schematu: wczytywanie, pamięć podręczna i powierzchnie chodliwe modeli.
// Wewnętrznie każdy model to .glb; inne formaty zamienia import (modelImport.ts).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import type { Vec3 } from '../core/map';
import { fileStem, modelFormat } from '../core/modelFiles';
import type { Box3 } from '../core/objectModel';
import { importModelFromUrl } from './modelImport';

export type ModelState = 'loading' | 'ready' | 'error';

export class ModelLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<string, { state: ModelState; scene?: THREE.Group; animations?: THREE.AnimationClip[] }>();
  /** Modele wczytane przez użytkownika (nazwa bez rozszerzenia → adres blob z danymi .glb). */
  private files = new Map<string, string>();
  /** Dane .glb modeli (klucz: nazwa.glb) – do zapisu roboczego i pobrania. */
  readonly fileData = new Map<string, ArrayBuffer>();
  onChange: () => void = () => {};

  /** Dodaje model .glb. Schemat znajduje go po nazwie pliku bez rozszerzenia (drzewo.fbx → drzewo.glb). */
  addFile(name: string, data: ArrayBuffer): void {
    const key = fileStem(name);
    const old = this.files.get(key);
    if (old) URL.revokeObjectURL(old);
    this.files.set(key, URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' })));
    this.fileData.set(`${key}.glb`, data);
    // przeładuj modele, które wskazują na ten plik
    for (const k of [...this.cache.keys()]) if (fileStem(k) === key) this.cache.delete(k);
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
