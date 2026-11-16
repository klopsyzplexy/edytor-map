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
  private timer = new THREE.Timer();
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
    // kółko przybliża w stronę kursora
    this.controls.zoomToCursor = true;

    new ResizeObserver(() => this.resize()).observe(container);
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  /** Lewy przycisk należy do narzędzi; obrót prawym, przesuwanie środkowym (albo Shift + prawy, albo spacja + lewy). */
  private setFreeButtons(): void {
    this.controls.mouseButtons = { LEFT: this.spacePan ? THREE.MOUSE.PAN : null, MIDDLE: THREE.MOUSE.PAN, RIGHT: THREE.MOUSE.ROTATE };
  }

  private spacePan = false;

  /** Przytrzymana spacja: lewy przycisk przesuwa widok zamiast działać narzędziem. */
  setSpacePan(on: boolean): void {
    if (this.spacePan === on) return;
    this.spacePan = on;
    this.controls.mouseButtons = { ...this.controls.mouseButtons, LEFT: on ? THREE.MOUSE.PAN : null };
    this.renderer.domElement.style.cursor = on ? 'grab' : '';
  }

  /** Przesuwa kamerę razem z punktem, na który patrzy (dx, dz w jednostkach mapy). */
  panBy(dx: number, dz: number): void {
    const d = new THREE.Vector3(dx, 0, dz);
    this.controls.target.add(d);
    this.camera.position.add(d);
  }

  /** Przesunięcie klawiszami: kierunek względem ekranu (w górę ekranu = do przodu), prędkość zależy od odległości. */
  panScreen(right: number, forward: number, dt: number, fast: boolean): void {
    const f = this.controls.target.clone().sub(this.camera.position);
    f.y = 0;
    if (f.lengthSq() < 1e-9) f.set(0, 0, -1);
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const speed = Math.max(4, this.camera.position.distanceTo(this.controls.target)) * (fast ? 2.4 : 0.8) * dt;
    this.panBy((r.x * right + f.x * forward) * speed, (r.z * right + f.z * forward) * speed);
  }

  /** Ustawia punkt, na który patrzy kamera (zachowuje kąt i odległość). */
  lookAtPoint(x: number, y: number, z: number): void {
    const t = this.controls.target;
    this.panBy(x - t.x, z - t.z);
    const dy = y - t.y;
    t.y += dy;
    this.camera.position.y += dy;
  }

  /** Ślad widoku na płaszczyźnie y = poziom punktu patrzenia: cztery rogi ekranu (do minimapy). */
  footprint(): Array<[number, number]> {
    const y = this.controls.target.y;
    const far = this.camera.position.distanceTo(this.controls.target) * 6;
    const out: Array<[number, number]> = [];
    for (const [x, yy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      this.raycaster.setFromCamera(new THREE.Vector2(x, yy), this.camera);
      const r = this.raycaster.ray;
      let t = r.direction.y < -1e-4 ? (y - r.origin.y) / r.direction.y : far;
      if (t < 0 || t > far) t = far;
      out.push([r.origin.x + r.direction.x * t, r.origin.z + r.direction.z * t]);
    }
    return out;
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
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 0.1);
    const t = this.timer.getElapsed();
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
    if (this.mode === 'free') {
      // odległość tak, żeby kula o promieniu `radius` mieściła się w kadrze
      const fov = (Math.min(this.camera.fov, this.camera.fov * this.camera.aspect) * Math.PI) / 180;
      dir.setLength(Math.max(radius / Math.sin(fov / 2) * 1.15, 6));
    }
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
