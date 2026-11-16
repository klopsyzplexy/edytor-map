// Widok 3D: renderer, scena, światła, kamera swobodna i „jak w grze”, promienie z kursora.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { Vec3 } from '../core/map';
import type { CameraDef } from '../core/schema';

export type CameraMode = 'free' | 'game';

export class Viewport {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly controls: OrbitControls;
  readonly root = new THREE.Group();
  mode: CameraMode = 'free';
  private freeState: { pos: THREE.Vector3; target: THREE.Vector3; fov: number } | null = null;
  private tickers: Array<(t: number, dt: number) => void> = [];
  private clock = new THREE.Clock();
  private raycaster = new THREE.Raycaster();

  constructor(readonly container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    container.appendChild(this.renderer.domElement);
    this.renderer.domElement.tabIndex = 0;

    this.scene.background = new THREE.Color(0x2a2f38);
    this.scene.add(new THREE.HemisphereLight(0xdfe8ff, 0x3a3020, 1.6));
    const sun = new THREE.DirectionalLight(0xffffff, 2.2);
    sun.position.set(45, 100, 30);
    this.scene.add(sun);
    this.scene.add(this.root);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 5000);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.15;
    this.setFreeButtons();
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.495;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Lewy przycisk należy do narzędzi; obrót prawym, przesuwanie środkowym (albo Shift + prawy). */
  private setFreeButtons(): void {
    this.controls.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  }

  onTick(fn: (t: number, dt: number) => void): void {
    this.tickers.push(fn);
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  private frame(): void {
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const t = this.clock.elapsedTime;
    for (const fn of this.tickers) fn(t, dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }

  /** Ustawia kamerę tak, żeby było widać całą mapę. */
  frameMap(size: [number, number], height = 0): void {
    const [w, d] = size;
    const target = new THREE.Vector3(w / 2, height, d / 2);
    const r = Math.max(w, d);
    this.controls.target.copy(target);
    this.camera.position.set(w / 2, height + r * 0.8, d / 2 + r * 0.85);
    this.controls.update();
  }

  focus(p: Vec3, radius = 6): void {
    const dir = this.camera.position.clone().sub(this.controls.target);
    const target = new THREE.Vector3(...p);
    if (this.mode === 'free') dir.setLength(Math.max(radius * 3, 8));
    this.controls.target.copy(target);
    this.camera.position.copy(target).add(dir);
  }

  /** Widok jak w grze: kąt, obrót, odległość i pole widzenia ze schematu. */
  setMode(mode: CameraMode, cam: CameraDef): void {
    if (mode === this.mode) return;
    const c = this.controls;
    if (mode === 'game') {
      this.freeState = { pos: this.camera.position.clone(), target: c.target.clone(), fov: this.camera.fov };
      const p = (cam.pitchDeg * Math.PI) / 180;
      const y = (cam.yawDeg * Math.PI) / 180;
      const off = new THREE.Vector3(Math.sin(y) * Math.cos(p), Math.sin(p), Math.cos(y) * Math.cos(p)).multiplyScalar(cam.distance);
      this.camera.fov = cam.fovDeg;
      this.camera.position.copy(c.target).add(off);
      c.enableRotate = false;
      c.enableZoom = false;
      c.screenSpacePanning = false;
      c.mouseButtons = { LEFT: null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.PAN };
    } else {
      c.enableRotate = true;
      c.enableZoom = true;
      this.setFreeButtons();
      if (this.freeState) {
        // zachowaj miejsce, w które przesunięto widok w trybie gry
        const delta = c.target.clone().sub(this.freeState.target);
        this.camera.position.copy(this.freeState.pos).add(delta);
        this.camera.fov = this.freeState.fov;
      }
    }
    this.camera.updateProjectionMatrix();
    this.mode = mode;
  }

  /** Promień z punktu ekranu (współrzędne zdarzenia myszy). */
  rayFromEvent(e: { clientX: number; clientY: number }): THREE.Ray {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    return this.raycaster.ray.clone();
  }

  pick(e: { clientX: number; clientY: number }, objects: THREE.Object3D[]): THREE.Intersection[] {
    const r = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    this.raycaster.params.Line = { threshold: 0.4 };
    return this.raycaster.intersectObjects(objects, true);
  }

  /** Punkt świata → piksele ekranu (do zaznaczania prostokątem). */
  project(p: Vec3): { x: number; y: number; visible: boolean } {
    const v = new THREE.Vector3(...p).project(this.camera);
    const r = this.renderer.domElement.getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, visible: v.z < 1 };
  }
}
