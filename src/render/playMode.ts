// Tryb „zagraj tę mapę”: postać na mapie, kamera jak w grze, sterowanie, nakładki i panel z pomiarami.
// Ruch i kolizje liczy core/play.ts; tutaj tylko scena, wejście i interfejs. Mapa się nie zmienia.
import * as THREE from 'three';
import type { Ctx } from '../context';
import { collectCollision, COLLISION_LINE, COLLISION_ZONE, type CollisionShape } from '../core/collision';
import { heightAt, modelBaseScale, objectCenter, type Vec3 } from '../core/map';
import { withBaseScale } from '../core/objectModel';
import { buildPlayWorld, pickAnimations, slopeDegAt, spawnAt, stepPlayer, type PlayerState, type PlayWorld, type StepResult } from '../core/play';
import { getType, locText } from '../core/schema';
import { raycastTerrain } from '../core/terrain';
import { collectWalkable } from '../core/walkable';
import { buildTriggers, TriggerState, zonesAt, type Trigger, type TriggerEvent } from '../core/triggers';
import { getLang, t } from '../i18n';
import { clear, h } from '../ui/dom';

const D2R = Math.PI / 180;
/** Kolory nakładki kolizji (legenda w panelu). */
export const OVERLAY_COLORS = { zone: '#ff4d4d', line: '#ff8a3d', object: '#e040fb', mask: '#f21f1a', walkable: '#3ddc84', teleport: '#38e1ff' };
const MAX_LABELS = 120;

export interface Overlays {
  collision: boolean;
  guides: boolean;
  names: boolean;
}

export class PlayMode {
  active = false;
  /** Włączone nakładki (klawisz C włącza i wyłącza wszystkie naraz). */
  overlays: Overlays = { collision: true, guides: true, names: false };
  private overlaysOn = false;
  private world!: PlayWorld;
  private shapes: CollisionShape[] = [];
  private state!: PlayerState;
  private last: StepResult | null = null;
  private char = new THREE.Group();
  private charModelRef: string | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions: { idle: THREE.AnimationAction | null; walk: THREE.AnimationAction | null } = { idle: null, walk: null };
  private overlayGroup = new THREE.Group();
  private camTarget = new THREE.Vector3();
  private distance = 30;
  private saved: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; gameView: boolean } | null = null;
  private keys = new Set<string>();
  private mouse: { x: number; y: number; down: boolean; t0: number; x0: number; y0: number } = { x: 0, y: 0, down: false, t0: 0, x0: 0, y0: 0 };
  private walkTo: [number, number] | null = null;
  private stuck = 0;
  private fps = { frames: 0, time: 0, value: 0 };
  private hudTimer = 0;
  private hud = h('div', { class: 'play-hud' });
  private labels = h('div', { class: 'play-labels' });
  /** Przejścia i strefy z komunikatem (zachowania typów ze schematu). */
  private triggers: Trigger[] = [];
  private trig: TriggerState | null = null;
  /** Przyciemnienie ekranu przy przejściu: czas od początku i punkt docelowy. */
  private fade: { time: number; to: Vec3; done: boolean } | null = null;
  private fadeEl = h('div', { class: 'play-fade' });
  private messageEl = h('div', { class: 'play-message' });
  private messageTimer = 0;
  /** Komunikat w panelu (np. przejście bez celu) i czas, przez jaki jest widoczny. */
  private notice: { text: string; time: number } | null = null;
  private onWheel = (e: WheelEvent) => {
    if (!this.active) return;
    e.preventDefault();
    const c = this.ctx.doc.schema.camera;
    this.distance = Math.min(c.maxDistance, Math.max(c.minDistance, this.distance * Math.pow(1.0015, e.deltaY)));
  };

  constructor(
    private ctx: Ctx,
    private view: HTMLElement,
    /** Pokazuje i ukrywa obiekty widoczne tylko w edytorze (jak „Widok gry”) oraz strefy i ścieżki. */
    private setObjectsMode: (game: boolean, guides: boolean) => void,
    private onExit: () => void,
  ) {
    this.char.name = 'play-character';
    this.ctx.viewport.renderer.domElement.addEventListener('wheel', this.onWheel, { passive: false });
  }

  /** Start w punkcie (x, y, z); y to wysokość stóp (start na moście) albo NaN – najwyższe podłoże. */
  start(at: Vec3): void {
    const { doc, viewport, models } = this.ctx;
    const schema = doc.schema;
    const map = doc.map;
    this.shapes = collectCollision(schema, map, (ref) => models.bounds(ref), models.outlineProvider);
    this.world = buildPlayWorld(schema, map, { collision: this.shapes, walkable: collectWalkable(schema, map, (ref) => models.walkableTriangles(ref)) });
    this.state = spawnAt(this.world, at[0], at[2], Number.isFinite(at[1]) ? at[1] + 0.05 : Infinity);
    this.triggers = buildTriggers(schema, map, (ref) => models.bounds(ref), models.outlineProvider);
    this.trig = new TriggerState(this.triggers, map);
    this.fade = null;
    this.notice = null;
    this.messageTimer = 0;
    this.messageEl.style.opacity = '0';
    this.fadeEl.style.opacity = '0';
    this.last = null;
    this.walkTo = null;
    this.keys.clear();
    this.mouse.down = false;
    if (!this.active) {
      const c = viewport.controls;
      this.saved = { pos: viewport.camera.position.clone(), target: c.target.clone(), fov: viewport.camera.fov, gameView: false };
      c.enabled = false;
      viewport.camera.fov = schema.camera.fovDeg;
      viewport.camera.updateProjectionMatrix();
      viewport.root.add(this.char, this.overlayGroup);
      this.view.append(this.hud, this.labels, this.messageEl, this.fadeEl);
      this.distance = schema.camera.distance;
    }
    this.active = true;
    this.buildCharacter();
    this.syncChar(1);
    this.camTarget.set(this.state.pos[0], this.state.pos[1] + schema.player.height * 0.5, this.state.pos[2]);
    this.placeCamera();
    this.applyOverlays();
    this.renderHud();
    // start w strefie z komunikatem pokazuje go od razu; start w przejściu nie przenosi
    this.handleTriggers(this.trig.update(this.state.pos[0], this.state.pos[2], schema.player.radius, true));
  }

  stop(): void {
    if (!this.active) return;
    const { viewport } = this.ctx;
    this.active = false;
    viewport.root.remove(this.char, this.overlayGroup);
    this.hud.remove();
    this.labels.remove();
    this.messageEl.remove();
    this.fadeEl.remove();
    this.disposeGroup(this.overlayGroup);
    this.mixer?.stopAllAction();
    this.mixer = null;
    const s = this.saved;
    if (s) {
      viewport.camera.position.copy(s.pos);
      viewport.controls.target.copy(s.target);
      viewport.camera.fov = s.fov;
      viewport.camera.updateProjectionMatrix();
    }
    viewport.controls.enabled = true;
    this.ctx.terrain.setBlockedOverlay(null);
    this.setObjectsMode(false, false);
    this.onExit();
  }

  // ---------- wejście ----------

  /** Klawisze w trybie gry; zwraca true, gdy klawisz obsłużony. */
  key(e: KeyboardEvent, down: boolean): boolean {
    const MOVE = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    if (MOVE.includes(e.code)) {
      if (down) {
        this.keys.add(e.code);
        this.walkTo = null;
      } else this.keys.delete(e.code);
      return true;
    }
    if (!down) return false;
    if (e.code === 'KeyC') {
      this.overlaysOn = !this.overlaysOn;
      this.applyOverlays();
      this.renderHud();
      return true;
    }
    return false;
  }

  blur(): void {
    this.keys.clear();
    this.mouse.down = false;
  }

  pointerDown(e: PointerEvent): void {
    if (e.button !== 0) return;
    Object.assign(this.mouse, { x: e.clientX, y: e.clientY, down: true, t0: performance.now(), x0: e.clientX, y0: e.clientY });
    this.walkTo = null;
  }

  pointerMove(e: PointerEvent): void {
    this.mouse.x = e.clientX;
    this.mouse.y = e.clientY;
  }

  pointerUp(e: PointerEvent): void {
    if (!this.mouse.down) return;
    this.mouse.down = false;
    // krótkie kliknięcie: idź do punktu; przytrzymanie: szło, dopóki przycisk był wciśnięty
    if (performance.now() - this.mouse.t0 < 250 && Math.hypot(e.clientX - this.mouse.x0, e.clientY - this.mouse.y0) < 6) {
      const hit = this.cursorHit();
      if (hit) this.walkTo = [hit[0], hit[2]];
    }
  }

  private cursorHit(): Vec3 | null {
    const ray = this.ctx.viewport.rayFromEvent({ clientX: this.mouse.x, clientY: this.mouse.y });
    return raycastTerrain(this.ctx.doc.map, [ray.origin.x, ray.origin.y, ray.origin.z], [ray.direction.x, ray.direction.y, ray.direction.z]);
  }

  /** Kierunek ruchu na ziemi: klawisze względem kamery, mysz – w stronę kursora albo celu kliknięcia. */
  private inputDir(): [number, number] {
    const cam = this.ctx.viewport.camera;
    const f = this.camTarget.clone().sub(cam.position);
    f.y = 0;
    if (f.lengthSq() < 1e-9) f.set(0, 0, -1);
    f.normalize();
    const r = new THREE.Vector3(-f.z, 0, f.x);
    const k = this.keys;
    const right = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
    const fwd = (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0) - (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0);
    if (right || fwd) {
      const x = r.x * right + f.x * fwd;
      const z = r.z * right + f.z * fwd;
      const l = Math.hypot(x, z);
      return [x / l, z / l];
    }
    const [px, , pz] = this.state.pos;
    let goal: [number, number] | null = null;
    if (this.mouse.down) {
      const hit = this.cursorHit();
      if (hit) goal = [hit[0], hit[2]];
    } else goal = this.walkTo;
    if (!goal) return [0, 0];
    const dx = goal[0] - px;
    const dz = goal[1] - pz;
    const d = Math.hypot(dx, dz);
    if (d < 0.15) {
      if (!this.mouse.down) this.walkTo = null;
      return [0, 0];
    }
    // tuż przy celu zwalnia, żeby nie przeskoczyć punktu
    const s = Math.min(1, d / Math.max(0.3, this.world.player.speed * 0.05));
    return [(dx / d) * s, (dz / d) * s];
  }

  // ---------- klatka ----------

  tick(dt: number): void {
    if (!this.active) return;
    this.fps.frames++;
    this.fps.time += dt;
    if (this.fps.time >= 0.5) {
      this.fps.value = this.fps.frames / this.fps.time;
      this.fps.frames = 0;
      this.fps.time = 0;
    }
    if (this.charModelRef === null && this.ctx.doc.schema.player.model && this.ctx.models.state(this.ctx.doc.schema.player.model) === 'ready') this.buildCharacter();
    // w trakcie przejścia postać stoi
    const dir: [number, number] = this.fade ? [0, 0] : this.inputDir();
    this.last = stepPlayer(this.world, this.state, dir, dt);
    if (this.fade) this.tickFade(dt);
    else if (this.trig) this.handleTriggers(this.trig.update(this.state.pos[0], this.state.pos[2], this.world.player.radius));
    this.tickMessages(dt);
    // cel kliknięcia nieosiągalny (np. za ścianą) – po chwili postać się zatrzymuje
    if (this.walkTo && !this.last.moved) {
      this.stuck += dt;
      if (this.stuck > 0.3) this.walkTo = null;
    } else this.stuck = 0;
    const walking = this.last.moved && Math.hypot(dir[0], dir[1]) > 0.05;
    this.animate(walking, dt);
    this.syncChar(dt);
    // kamera dogania postać (wykładniczo, stała czasowa z schematu)
    const p = this.state.pos;
    const goal = new THREE.Vector3(p[0], p[1] + this.world.player.height * 0.5, p[2]);
    const tau = this.ctx.doc.schema.camera.followSmoothing;
    this.camTarget.lerp(goal, tau > 0 ? 1 - Math.exp(-dt / tau) : 1);
    this.placeCamera();
    if (this.overlaysOn && this.overlays.names) this.updateLabels();
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.2;
      this.updateStats();
    }
  }

  // ---------- przejścia i strefy z komunikatem ----------

  private handleTriggers(events: TriggerEvent[]): void {
    for (const e of events) {
      if (e.type === 'teleport') {
        this.fade = { time: 0, to: e.to, done: false };
        this.walkTo = null;
        this.keys.clear();
        this.mouse.down = false;
      } else if (e.type === 'noTarget') {
        const o = this.ctx.doc.getObject(e.trigger.objectId);
        this.notice = { text: t('play.noTarget', { name: o?.name ?? e.trigger.objectId }), time: 4 };
        this.updateStats();
      } else this.showMessage(e.type === 'enter' ? e.trigger.text : t('play.zoneLeave', { text: e.trigger.text }), e.type === 'enter');
    }
  }

  /** Przyciemnienie: 0,25 s do czerni, przeniesienie, 0,25 s z powrotem. */
  private tickFade(dt: number): void {
    const f = this.fade!;
    const HALF = 0.25;
    f.time += dt;
    if (!f.done && f.time >= HALF) {
      f.done = true;
      this.state = spawnAt(this.world, f.to[0], f.to[2], f.to[1] + this.world.player.stepHeight + 0.05);
      const p = this.state.pos;
      this.heading = this.state.heading;
      this.camTarget.set(p[0], p[1] + this.world.player.height * 0.5, p[2]);
      this.syncChar(1);
      this.handleTriggers(this.trig!.update(p[0], p[2], this.world.player.radius, true));
    }
    const k = f.time < HALF ? f.time / HALF : Math.max(0, 1 - (f.time - HALF) / HALF);
    this.fadeEl.style.opacity = String(k);
    if (f.time >= HALF * 2) {
      this.fade = null;
      this.fadeEl.style.opacity = '0';
    }
  }

  private showMessage(text: string, enter: boolean): void {
    this.messageEl.textContent = text;
    this.messageEl.classList.toggle('leave', !enter);
    this.messageEl.style.opacity = '1';
    this.messageTimer = 2.5;
  }

  private tickMessages(dt: number): void {
    if (this.messageTimer > 0) {
      this.messageTimer -= dt;
      // ostatnie pół sekundy – wygaszanie
      this.messageEl.style.opacity = String(Math.min(1, Math.max(0, this.messageTimer / 0.5)));
    }
    if (this.notice) {
      this.notice.time -= dt;
      if (this.notice.time <= 0) this.notice = null;
    }
  }

  private placeCamera(): void {
    const { viewport, doc } = this.ctx;
    const cam = doc.schema.camera;
    const pitch = cam.pitchDeg * D2R;
    const yaw = cam.yawDeg * D2R;
    const off = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(this.distance);
    viewport.controls.target.copy(this.camTarget);
    viewport.camera.position.copy(this.camTarget).add(off);
    viewport.camera.lookAt(this.camTarget);
  }

  // ---------- postać ----------

  private buildCharacter(): void {
    const { doc, models } = this.ctx;
    const pl = doc.schema.player;
    this.disposeGroup(this.char);
    this.mixer = null;
    this.actions = { idle: null, walk: null };
    this.charModelRef = null;
    const anim = pl.model ? models.animated(pl.model) : null;
    if (pl.model && anim) {
      this.charModelRef = pl.model;
      const holder = new THREE.Group();
      const tr = withBaseScale(pl.modelTransform, modelBaseScale(doc.map, pl.model));
      holder.position.set(...tr.offset);
      holder.rotation.set(tr.rotation[0] * D2R, tr.rotation[1] * D2R, tr.rotation[2] * D2R, 'XYZ');
      holder.scale.set(...tr.scale);
      holder.add(anim.object);
      this.char.add(holder);
      if (anim.clips.length) {
        this.mixer = new THREE.AnimationMixer(anim.object);
        const pick = pickAnimations(anim.clips.map((c) => c.name), pl.animations);
        const action = (name: string | null) => {
          const clip = name ? anim.clips.find((c) => c.name === name) : undefined;
          return clip ? this.mixer!.clipAction(clip) : null;
        };
        this.actions = { idle: action(pick.idle), walk: action(pick.walk) };
        this.actions.idle?.play();
        if (this.actions.walk) {
          this.actions.walk.play();
          this.actions.walk.setEffectiveWeight(0);
        }
      }
      return;
    }
    // kapsuła o promieniu i wysokości postaci, z „nosem” pokazującym kierunek
    const r = pl.radius;
    const body = new THREE.Mesh(
      new THREE.CapsuleGeometry(r, Math.max(0.01, pl.height - 2 * r), 6, 16).translate(0, pl.height / 2, 0),
      new THREE.MeshLambertMaterial({ color: 0x4f9cff }),
    );
    const nose = new THREE.Mesh(new THREE.ConeGeometry(r * 0.35, r * 0.8, 12).rotateX(Math.PI / 2).translate(0, pl.height * 0.75, r * 0.9), new THREE.MeshLambertMaterial({ color: 0xffd000 }));
    this.char.add(body, nose);
  }

  private walkWeight = 0;

  private animate(walking: boolean, dt: number): void {
    if (!this.mixer) return;
    const target = walking ? 1 : 0;
    this.walkWeight += (target - this.walkWeight) * Math.min(1, dt * 8);
    if (this.actions.walk) {
      this.actions.walk.setEffectiveWeight(this.walkWeight);
      this.actions.idle?.setEffectiveWeight(1 - this.walkWeight);
      // jedyna animacja to chodzenie – na postoju zatrzymana
      if (!this.actions.idle) this.actions.walk.setEffectiveWeight(1).paused = !walking;
    }
    this.mixer.update(dt);
  }

  private heading = 0;

  private syncChar(dt: number): void {
    const p = this.state.pos;
    this.char.position.set(p[0], p[1], p[2]);
    // płynny obrót w stronę ruchu (najkrótszą drogą)
    let d = this.state.heading - this.heading;
    d = Math.atan2(Math.sin(d), Math.cos(d));
    this.heading += d * Math.min(1, dt * 12);
    this.char.rotation.y = this.heading;
  }

  // ---------- nakładki ----------

  private applyOverlays(): void {
    const on = this.overlaysOn;
    this.disposeGroup(this.overlayGroup);
    this.setObjectsMode(true, on && this.overlays.guides);
    this.ctx.terrain.setBlockedOverlay(on && this.overlays.collision ? this.world.terrainMask : null);
    if (on && this.overlays.collision) this.buildCollisionOverlay();
    if (on && this.overlays.guides) this.buildTeleportArrows();
    clear(this.labels);
    this.labels.style.display = on && this.overlays.names ? '' : 'none';
  }

  /** Kształty kolizji na terenie (kolorami według rodzaju) i powierzchnie chodliwe. */
  private buildCollisionOverlay(): void {
    const map = this.ctx.doc.map;
    const lift = 0.12;
    const follow = (pts: Array<[number, number]>, closed: boolean): THREE.Vector3[] => {
      // odcinki dzielone co ~1 jednostkę, żeby linia szła po terenie
      const out: THREE.Vector3[] = [];
      const n = closed ? pts.length : pts.length - 1;
      for (let k = 0; k < n; k++) {
        const [ax, az] = pts[k];
        const [bx, bz] = pts[(k + 1) % pts.length];
        const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az)));
        for (let s = 0; s < steps; s++) {
          const x = ax + ((bx - ax) * s) / steps;
          const z = az + ((bz - az) * s) / steps;
          out.push(new THREE.Vector3(x, heightAt(map, x, z) + lift, z));
        }
      }
      if (!closed && pts.length) {
        const [x, z] = pts[pts.length - 1];
        out.push(new THREE.Vector3(x, heightAt(map, x, z) + lift, z));
      } else if (out.length) out.push(out[0].clone());
      return out;
    };
    // wszystkie kształty jednego koloru w jednej siatce odcinków (tysiące kolizji = kilka wywołań rysowania)
    const solid = new Map<string, number[]>();
    const dashed = new Map<string, number[]>();
    const push = (to: Map<string, number[]>, color: string, line: THREE.Vector3[]) => {
      if (!to.has(color)) to.set(color, []);
      const arr = to.get(color)!;
      for (let k = 0; k + 1 < line.length; k++) arr.push(line[k].x, line[k].y, line[k].z, line[k + 1].x, line[k + 1].y, line[k + 1].z);
    };
    for (const s of this.shapes) {
      const color = s.type === COLLISION_ZONE ? OVERLAY_COLORS.zone : s.type === COLLISION_LINE ? OVERLAY_COLORS.line : OVERLAY_COLORS.object;
      push(solid, color, follow(s.points, s.shape === 'polygon'));
      if (s.shape === 'line' && s.width > 0.05) {
        // obrys pasa linii kolizji po obu stronach
        for (const side of [-1, 1]) {
          const off: Array<[number, number]> = [];
          for (let k = 0; k < s.points.length; k++) {
            const a = s.points[Math.max(0, k - 1)];
            const b = s.points[Math.min(s.points.length - 1, k + 1)];
            const dx = b[0] - a[0];
            const dz = b[1] - a[1];
            const l = Math.hypot(dx, dz) || 1;
            off.push([s.points[k][0] - (dz / l) * side * (s.width / 2), s.points[k][1] + (dx / l) * side * (s.width / 2)]);
          }
          push(dashed, color, follow(off, false));
        }
      }
    }
    // wypełnienie obrysów obiektów (cienkie obrysy, np. płotu, są wtedy widoczne mimo modelu)
    const fill: number[] = [];
    for (const s of this.shapes) {
      if (s.shape !== 'polygon' || s.type === COLLISION_ZONE || s.points.length < 3) continue;
      const tris = THREE.ShapeUtils.triangulateShape(s.points.map(([x, z]) => new THREE.Vector2(x, z)), []);
      for (const tri of tris)
        for (const k of tri) {
          const [x, z] = s.points[k];
          fill.push(x, heightAt(map, x, z) + lift, z);
        }
    }
    if (fill.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(fill, 3));
      const mesh = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: OVERLAY_COLORS.object, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthTest: false, depthWrite: false }));
      mesh.renderOrder = 7;
      this.overlayGroup.add(mesh);
    }
    for (const [maps, dash] of [[solid, false], [dashed, true]] as const)
      for (const [color, pos] of maps) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        const mat = dash ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, depthTest: false, transparent: true }) : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
        const seg = new THREE.LineSegments(g, mat);
        if (dash) seg.computeLineDistances();
        seg.renderOrder = 7;
        this.overlayGroup.add(seg);
      }
    // powierzchnie chodliwe – zielona siatka
    const walk = collectWalkable(this.ctx.doc.schema, map, (ref) => this.ctx.models.walkableTriangles(ref));
    const pos: number[] = [];
    for (const w of walk) for (let k = 0; k + 8 < w.triangles.length; k += 9) for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) pos.push(w.triangles[k + a], w.triangles[k + a + 1] + 0.03, w.triangles[k + a + 2], w.triangles[k + b], w.triangles[k + b + 1] + 0.03, w.triangles[k + b + 2]);
    if (pos.length) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: OVERLAY_COLORS.walkable, transparent: true, opacity: 0.8 }));
      seg.renderOrder = 6;
      this.overlayGroup.add(seg);
    }
  }

  /** Przejścia: łuk ze strzałką od przejścia do celu. */
  private buildTeleportArrows(): void {
    const map = this.ctx.doc.map;
    const color = OVERLAY_COLORS.teleport;
    for (const tr of this.triggers) {
      if (tr.kind !== 'teleport' || !tr.target) continue;
      const from = this.ctx.doc.getObject(tr.objectId);
      const to = this.ctx.doc.getObject(tr.target);
      if (!from || !to) continue;
      const a = new THREE.Vector3(...objectCenter(from));
      const b = new THREE.Vector3(...objectCenter(to));
      a.y = heightAt(map, a.x, a.z) + 0.3;
      b.y = heightAt(map, b.x, b.z) + 0.3;
      const len = a.distanceTo(b);
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.y += Math.max(1.5, len * 0.25);
      // łuk odsunięty w bok (w prawo od kierunku), żeby dwa przejścia w obie strony się nie nakładały
      const side = new THREE.Vector3(-(b.z - a.z), 0, b.x - a.x).normalize().multiplyScalar(len * 0.12);
      mid.add(side);
      const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      const pts = curve.getPoints(48);
      const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      line.renderOrder = 8;
      const tip = pts[pts.length - 1];
      const dir = tip.clone().sub(pts[pts.length - 4]).normalize();
      const size = Math.max(0.4, Math.min(2, len * 0.05));
      const cone = new THREE.Mesh(new THREE.ConeGeometry(size * 0.4, size, 12), new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      cone.position.copy(tip).addScaledVector(dir, -size / 2);
      cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      cone.renderOrder = 8;
      this.overlayGroup.add(line, cone);
    }
  }

  /** Nazwy obiektów nad nimi (najbliższe kamerze, w kadrze). */
  private updateLabels(): void {
    const { doc, viewport } = this.ctx;
    const cam = viewport.camera;
    const rect = viewport.renderer.domElement.getBoundingClientRect();
    const vrect = this.view.getBoundingClientRect();
    const items: Array<{ d: number; x: number; y: number; text: string }> = [];
    const v = new THREE.Vector3();
    for (const o of doc.map.objects) {
      if (!doc.isVisible(o)) continue;
      const ty = getType(doc.schema, o.type);
      const p = o.points.length ? o.points[0] : o.position;
      const top = o.points.length ? 0.4 : (ty?.defaultSize[1] ?? 1) * o.scale[1] + 0.3;
      v.set(p[0], p[1] + top, p[2]);
      const d = v.distanceTo(cam.position);
      v.project(cam);
      if (v.z > 1 || Math.abs(v.x) > 1.05 || Math.abs(v.y) > 1.05) continue;
      const typeName = ty ? locText(ty.name, getLang(), ty.id) : o.type;
      items.push({ d, x: rect.left - vrect.left + ((v.x + 1) / 2) * rect.width, y: rect.top - vrect.top + ((1 - v.y) / 2) * rect.height, text: `${o.name} · ${typeName}` });
    }
    items.sort((a, b) => a.d - b.d);
    const shown = items.slice(0, MAX_LABELS);
    while (this.labels.children.length < shown.length) this.labels.append(h('span', { class: 'play-label' }));
    [...this.labels.children].forEach((el, k) => {
      const it = shown[k];
      const e = el as HTMLElement;
      if (!it) {
        e.style.display = 'none';
        return;
      }
      e.style.display = '';
      e.style.transform = `translate(${it.x}px, ${it.y}px) translate(-50%, -100%)`;
      if (e.textContent !== it.text) e.textContent = it.text;
    });
  }

  // ---------- panel ----------

  private stats = h('div', { class: 'play-stats' });

  private renderHud(): void {
    clear(this.hud);
    const o = this.overlays;
    const check = (key: keyof Overlays, label: string) =>
      h('label', { class: 'check' }, h('input', {
        type: 'checkbox',
        checked: o[key],
        onchange: (e: Event) => {
          o[key] = (e.target as HTMLInputElement).checked;
          if (!this.overlaysOn) this.overlaysOn = true;
          this.applyOverlays();
          this.renderHud();
        },
      }), label);
    const sw = (c: string, label: string) => h('span', { class: 'legend' }, h('span', { class: 'swatch', style: `background:${c}` }), label);
    this.hud.append(
      h('div', { class: 'play-title' }, t('play.title')),
      h('div', { class: 'muted small' }, t('play.controls')),
      this.stats,
      h('div', { class: 'play-overlays' },
        h('div', { class: 'small' }, h('b', {}, t('play.overlays')), ' ', h('kbd', {}, 'C'), ' ', h('span', { class: this.overlaysOn ? 'good' : 'muted' }, this.overlaysOn ? t('play.on') : t('play.off'))),
        check('collision', t('play.ovCollision')),
        o.collision && this.overlaysOn
          ? h('div', { class: 'legend-row' }, sw(OVERLAY_COLORS.zone, t('play.lgZone')), sw(OVERLAY_COLORS.line, t('play.lgLine')), sw(OVERLAY_COLORS.object, t('play.lgObject')), sw(OVERLAY_COLORS.mask, t('play.lgMask')), sw(OVERLAY_COLORS.walkable, t('play.lgWalkable')))
          : null,
        check('guides', t('play.ovGuides')),
        o.guides && this.overlaysOn && this.triggers.some((x) => x.kind === 'teleport') ? h('div', { class: 'legend-row' }, sw(OVERLAY_COLORS.teleport, t('play.lgTeleport'))) : null,
        check('names', t('play.ovNames')),
      ),
    );
    this.updateStats();
  }

  private updateStats(): void {
    if (!this.active) return;
    const map = this.ctx.doc.map;
    const [x, y, z] = this.state.pos;
    const g = this.last?.ground;
    const slope = slopeDegAt(map, x, z);
    const slopeOn = map.settings.slope.enabled;
    const row = (label: string, value: string, cls = '') => h('div', { class: 'stat' }, h('span', { class: 'muted' }, label), h('span', { class: cls }, value));
    const why = this.last?.blockedBy;
    clear(this.stats);
    this.stats.append(
      row(t('play.pos'), `${x.toFixed(2)}, ${z.toFixed(2)}`),
      row(t('play.height'), `${y.toFixed(2)}${g?.onSurface ? ` (${t('play.onSurface')})` : ''}`),
      row(t('play.terrain'), heightAt(map, x, z).toFixed(2)),
      row(t('play.slope'), `${slope.toFixed(1)}°${slopeOn ? ` / ${map.settings.slope.maxDeg}°` : ` (${t('play.slopeOff')})`}`, slopeOn && slope > map.settings.slope.maxDeg ? 'bad' : ''),
      row(t('play.fps'), this.fps.value ? this.fps.value.toFixed(0) : '…', this.fps.value && this.fps.value < 30 ? 'bad' : ''),
      row(t('play.blocked'), why ? this.blockedText(why) : '—', why ? 'warn' : ''),
      row(t('play.zones'), this.zonesText() || '—'),
    );
    if (this.notice) this.stats.append(h('div', { class: 'notice warn' }, this.notice.text));
  }

  /** Strefy, w których stoi postać: tekst komunikatu albo nazwa obiektu i typ. */
  private zonesText(): string {
    const { doc } = this.ctx;
    const [x, , z] = this.state.pos;
    return zonesAt(doc.schema, doc.map, x, z)
      .map((o) => {
        const tr = this.triggers.find((t) => t.objectId === o.id && t.kind === 'message');
        const ty = getType(doc.schema, o.type);
        return tr ? `„${tr.text}”` : `${o.name} (${ty ? locText(ty.name, getLang(), ty.id) : o.type})`;
      })
      .join(', ');
  }

  private blockedText(why: string): string {
    if (why === 'step') return t('play.byStep');
    if (why === 'slope/layer') return t('play.byMask');
    if (why === 'edge') return t('play.byEdge');
    const ty = getType(this.ctx.doc.schema, why);
    return ty ? locText(ty.name, getLang(), why) : why;
  }

  /** Bieżąca liczba klatek na sekundę (do raportu i testów). */
  get fpsValue(): number {
    return this.fps.value;
  }

  get position(): Vec3 {
    return [...this.state.pos];
  }

  private disposeGroup(g: THREE.Object3D): void {
    for (const c of [...g.children]) {
      g.remove(c);
      c.traverse((x) => {
        const m = x as THREE.Mesh;
        if (m.isMesh || (x as THREE.Line).isLine) {
          // geometrie modeli z biblioteki są współdzielone z innymi kopiami – nie zwalniamy ich
          if (!x.userData.shared && g === this.overlayGroup) m.geometry?.dispose();
          if (g === this.overlayGroup) (m.material as THREE.Material)?.dispose?.();
        }
      });
    }
  }
}
