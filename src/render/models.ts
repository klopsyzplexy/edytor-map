// Modele .glb ze schematu: wczytywanie, pamięć podręczna i powierzchnie chodliwe modeli.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export type ModelState = 'loading' | 'ready' | 'error';

export class ModelLibrary {
  private loader = new GLTFLoader();
  private cache = new Map<string, { state: ModelState; scene?: THREE.Group }>();
  /** Pliki wskazane przez użytkownika (nazwa pliku → adres blob). */
  private files = new Map<string, string>();
  /** Surowe dane plików (do zapisu roboczego). */
  readonly fileData = new Map<string, ArrayBuffer>();
  onChange: () => void = () => {};

  addFile(name: string, data: ArrayBuffer): void {
    const key = baseName(name);
    const old = this.files.get(key);
    if (old) URL.revokeObjectURL(old);
    this.files.set(key, URL.createObjectURL(new Blob([data], { type: 'model/gltf-binary' })));
    this.fileData.set(key, data);
    // przeładuj modele, które wskazują na ten plik
    for (const k of [...this.cache.keys()]) if (baseName(k) === key) this.cache.delete(k);
    this.onChange();
  }

  get fileNames(): string[] {
    return [...this.files.keys()];
  }

  private resolve(ref: string): string {
    return this.files.get(baseName(ref)) ?? ref;
  }

  state(ref: string): ModelState {
    return this.cache.get(ref)?.state ?? 'loading';
  }

  /** Kopia modelu albo null, jeśli jeszcze się wczytuje lub nie udało się go wczytać. */
  instance(ref: string): THREE.Object3D | null {
    const c = this.cache.get(ref);
    if (!c) {
      this.cache.set(ref, { state: 'loading' });
      this.loader.load(
        this.resolve(ref),
        (gltf) => {
          this.cache.set(ref, { state: 'ready', scene: gltf.scene });
          this.onChange();
        },
        undefined,
        () => {
          this.cache.set(ref, { state: 'error' });
          this.onChange();
        },
      );
      return null;
    }
    return c.scene ? c.scene.clone(true) : null;
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
        n.subVectors(c, b).cross(new THREE.Vector3().subVectors(a, b)).normalize();
        if (!useAll && n.y < 0.7) continue;
        out.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
      }
    }
    return new Float32Array(out);
  }
}

export function baseName(p: string): string {
  return p.split(/[\\/]/).pop() ?? p;
}
