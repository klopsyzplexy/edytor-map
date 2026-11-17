// Miniatury modeli do panelu Biblioteka: jeden mały renderer poza ekranem, wynik w pamięci podręcznej.
import * as THREE from 'three';
import type { ModelLibrary } from './models';

const SIZE = 112;

export class Thumbnails {
  private renderer: THREE.WebGLRenderer | null = null;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.01, 10000);
  private cache = new Map<string, string>();

  constructor(private models: ModelLibrary) {
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 1.8));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(3, 5, 4);
    this.scene.add(sun);
  }

  /** Adres obrazka miniatury albo null, dopóki model się wczytuje (wtedy wywołaj ponownie po `onChange`). */
  get(name: string): string | null {
    const key = `${name}#${this.models.versions.get(name) ?? 0}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    if (this.models.state(name) === 'error') return null;
    const obj = this.models.instance(name);
    if (!obj) return null;
    const url = this.render(obj);
    this.cache.set(key, url);
    return url;
  }

  private render(obj: THREE.Object3D): string {
    if (!this.renderer) {
      this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      this.renderer.setSize(SIZE, SIZE);
      this.renderer.setClearColor(0x000000, 0);
    }
    this.scene.add(obj);
    const box = new THREE.Box3().setFromObject(obj, true);
    const center = box.getCenter(new THREE.Vector3());
    const radius = Math.max(box.getSize(new THREE.Vector3()).length() / 2, 1e-3);
    const dist = radius / Math.sin((this.camera.fov * Math.PI) / 360);
    this.camera.position.copy(center).add(new THREE.Vector3(0.75, 0.55, 1).normalize().multiplyScalar(dist));
    this.camera.near = dist / 100;
    this.camera.far = dist * 10;
    this.camera.updateProjectionMatrix();
    this.camera.lookAt(center);
    this.renderer.render(this.scene, this.camera);
    this.scene.remove(obj);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
