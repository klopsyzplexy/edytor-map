// Narzędzia myszy: zaznaczanie (z przeciąganiem po terenie i edycją wierzchołków), rzeźba, malowanie, wstawianie.
import * as THREE from 'three';
import type { Ctx } from '../context';
import { cloneObject, heightAt, type MapObject, type Vec3 } from '../core/map';
import { getType, locText } from '../core/schema';
import { applyHeightBrush, applyStamp, paintLayer } from '../core/terrain';
import { getLang, t } from '../i18n';

export interface Tool {
  down?(e: PointerEvent): void;
  move?(e: PointerEvent): void;
  up?(e: PointerEvent): void;
  dblclick?(e: MouseEvent): void;
  key?(e: KeyboardEvent): boolean;
  tick?(dt: number): void;
  activate?(): void;
  deactivate?(): void;
  /** Odświeża kursor pędzla po zmianie rozmiaru, kształtu lub obrotu. */
  refreshCursor?(): void;
  hint(): string;
}

const DRAG_PX = 4;

// ---------------- Zaznaczanie ----------------

type SelectDrag =
  | { kind: 'pending'; x: number; y: number; id: string | null; vertex?: number; additive: boolean }
  | { kind: 'move'; start: MapObject[]; from: Vec3 }
  | { kind: 'vertex'; id: string; index: number; start: MapObject }
  | { kind: 'box'; x: number; y: number; additive: boolean };

export class SelectTool implements Tool {
  private drag: SelectDrag | null = null;
  private box: HTMLDivElement;

  constructor(private ctx: Ctx) {
    this.box = document.createElement('div');
    this.box.className = 'select-box';
    document.body.appendChild(this.box);
  }

  hint(): string {
    const v = this.ctx.objects.selectedVertex;
    if (v !== null) return t('hint.vertex');
    return t('hint.select');
  }

  activate(): void {
    this.ctx.gizmo.enabled = true;
    this.ctx.gizmo.refresh();
  }

  deactivate(): void {
    this.ctx.gizmo.enabled = false;
    this.ctx.gizmo.refresh();
    this.box.style.display = 'none';
    this.drag = null;
  }

  private pickAt(e: { clientX: number; clientY: number }): { id: string | null; vertex?: number } {
    const { objects, viewport } = this.ctx;
    const hh = viewport.pick(e, objects.handles.children);
    if (hh.length) return { id: hh[0].object.userData.objectId as string, vertex: hh[0].object.userData.vertex as number };
    const hits = viewport.pick(e, objects.pickables());
    return { id: hits.length ? (hits[0].object.userData.objectId as string) : null };
  }

  down(e: PointerEvent): void {
    if (e.button !== 0 || this.ctx.gizmo.active) return;
    const p = this.pickAt(e);
    const additive = e.shiftKey || e.ctrlKey || e.metaKey;
    const { doc, objects } = this.ctx;
    if (p.vertex !== undefined && p.id) {
      if (e.altKey) {
        this.deleteVertex(p.id, p.vertex);
        return;
      }
      objects.selectedVertex = p.vertex;
      objects.updateSelection();
      this.ctx.refreshHint();
    } else if (p.id) {
      if (additive) doc.select([p.id], 'toggle');
      else if (!doc.selection.includes(p.id)) doc.select([p.id]);
      objects.selectedVertex = null;
    }
    this.drag = { kind: 'pending', x: e.clientX, y: e.clientY, id: p.id, vertex: p.vertex, additive };
  }

  move(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    const { doc } = this.ctx;
    if (d.kind === 'pending') {
      if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < DRAG_PX) return;
      const from = this.ctx.terrainHit({ clientX: d.x, clientY: d.y });
      if (d.id && d.vertex !== undefined) {
        const o = doc.getObject(d.id);
        if (o) this.drag = { kind: 'vertex', id: d.id, index: d.vertex, start: cloneObject(o) };
      } else if (d.id && from) {
        const sel = doc.selectedObjects().filter((o) => doc.isPickable(o));
        this.drag = { kind: 'move', start: sel.map(cloneObject), from };
      } else if (!d.id) {
        this.drag = { kind: 'box', x: d.x, y: d.y, additive: d.additive };
      } else {
        this.drag = null;
        return;
      }
    }
    const cur = this.drag!;
    if (cur.kind === 'box') {
      const x0 = Math.min(cur.x, e.clientX);
      const y0 = Math.min(cur.y, e.clientY);
      Object.assign(this.box.style, { display: 'block', left: `${x0}px`, top: `${y0}px`, width: `${Math.abs(e.clientX - cur.x)}px`, height: `${Math.abs(e.clientY - cur.y)}px` });
      return;
    }
    const hit = this.ctx.terrainHit(e);
    if (!hit) return;
    if (cur.kind === 'move') {
      // przesuwanie po terenie: obiekty przyklejają się do powierzchni
      const map = doc.map;
      const anchor = cur.start[0];
      const anchorPos = anchor.points.length ? anchor.points[0] : anchor.position;
      const target = this.ctx.snap([anchorPos[0] + hit[0] - cur.from[0], 0, anchorPos[2] + hit[2] - cur.from[2]]);
      const dx = target[0] - anchorPos[0];
      const dz = target[2] - anchorPos[2];
      for (const st of cur.start) {
        const o = doc.getObject(st.id);
        if (!o) continue;
        if (st.points.length) o.points = st.points.map((p) => [p[0] + dx, heightAt(map, p[0] + dx, p[2] + dz), p[2] + dz]);
        else o.position = [st.position[0] + dx, heightAt(map, st.position[0] + dx, st.position[2] + dz), st.position[2] + dz];
      }
      this.ctx.objects.sync();
    } else if (cur.kind === 'vertex') {
      const o = doc.getObject(cur.id);
      if (!o) return;
      const p = this.ctx.snap(hit);
      o.points = cur.start.points.map((q, k) => (k === cur.index ? [p[0], heightAt(doc.map, p[0], p[2]), p[2]] : q));
      this.ctx.objects.sync();
    }
  }

  up(e: PointerEvent): void {
    const d = this.drag;
    this.drag = null;
    if (!d) return;
    const { doc } = this.ctx;
    if (d.kind === 'pending') {
      if (!d.id && !d.additive) doc.select([]);
      return;
    }
    if (d.kind === 'box') {
      this.box.style.display = 'none';
      const x0 = Math.min(d.x, e.clientX);
      const x1 = Math.max(d.x, e.clientX);
      const y0 = Math.min(d.y, e.clientY);
      const y1 = Math.max(d.y, e.clientY);
      const ids = doc.map.objects.filter((o) => {
        if (!doc.isPickable(o)) return false;
        const pts = o.points.length ? o.points : [o.position];
        return pts.some((p) => {
          const s = this.ctx.viewport.project(p);
          return s.visible && s.x >= x0 && s.x <= x1 && s.y >= y0 && s.y <= y1;
        });
      }).map((o) => o.id);
      doc.select(ids, d.additive ? 'add' : 'set');
      return;
    }
    const starts = d.kind === 'move' ? d.start : [d.start];
    const finals = starts.map((s) => cloneObject(doc.getObject(s.id) ?? s));
    for (const s of starts) {
      const o = doc.getObject(s.id);
      if (o) Object.assign(o, cloneObject(s));
    }
    doc.updateObjects(finals.map((f) => f.id), (o) => {
      const f = finals.find((x) => x.id === o.id)!;
      o.position = f.position;
      o.points = f.points;
    }, d.kind === 'move' ? 'move' : 'vertex');
  }

  dblclick(e: MouseEvent): void {
    // dwuklik przy krawędzi zaznaczonej ścieżki/strefy dodaje wierzchołek
    const { doc } = this.ctx;
    const sel = doc.selectedObjects();
    if (sel.length !== 1 || !sel[0].points.length) return;
    const o = sel[0];
    const t0 = getType(doc.schema, o.type);
    const hit = this.ctx.terrainHit(e);
    if (!hit || !t0) return;
    const n = o.points.length;
    const segs = t0.kind === 'zone' ? n : n - 1;
    let best = -1;
    let bestD = Infinity;
    for (let k = 0; k < segs; k++) {
      const a = o.points[k];
      const b = o.points[(k + 1) % n];
      const d = distToSegment(hit[0], hit[2], a[0], a[2], b[0], b[2]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best < 0) return;
    const p = this.ctx.snap(hit);
    doc.updateObjects([o.id], (x) => x.points.splice(best + 1, 0, [p[0], heightAt(doc.map, p[0], p[2]), p[2]]), 'vertex');
    this.ctx.objects.selectedVertex = best + 1;
    this.ctx.objects.updateSelection();
  }

  deleteVertex(id: string, index: number): boolean {
    const { doc } = this.ctx;
    const o = doc.getObject(id);
    const ty = o && getType(doc.schema, o.type);
    if (!o || !ty) return false;
    const min = ty.kind === 'zone' ? 3 : 2;
    if (o.points.length <= min) {
      this.ctx.toast(t('toast.minPoints', { n: min }), 'error');
      return true;
    }
    doc.updateObjects([id], (x) => x.points.splice(index, 1), 'vertex');
    this.ctx.objects.selectedVertex = null;
    this.ctx.objects.updateSelection();
    this.ctx.refreshHint();
    return true;
  }

  key(e: KeyboardEvent): boolean {
    const v = this.ctx.objects.selectedVertex;
    const sel = this.ctx.doc.selection;
    if ((e.key === 'Delete' || e.key === 'Backspace') && v !== null && sel.length === 1) return this.deleteVertex(sel[0], v);
    return false;
  }
}

function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + s * dx), pz - (az + s * dz));
}

// ---------------- Pędzle terenu ----------------

abstract class BrushTool implements Tool {
  protected painting = false;
  protected hit: Vec3 | null = null;
  protected invert = false;
  constructor(protected ctx: Ctx) {}
  abstract hint(): string;
  protected abstract color(): number;
  protected abstract step(hit: Vec3, dt: number): void;
  protected abstract kind: 'heights' | 'layers';

  activate(): void {
    this.ctx.viewport.controls.enableZoom = true;
  }

  deactivate(): void {
    this.ctx.terrain.setBrush(0, 0, 1, false);
    if (this.painting) this.ctx.doc.endStroke(this.kind);
    this.painting = false;
  }

  protected cursor(e: { clientX: number; clientY: number }): void {
    this.hit = this.ctx.terrainHit(e);
    const b = this.ctx.state.brush;
    this.ctx.terrain.setBrushShape(b.shape ?? 'circle', b.angle ?? 0, b.softness);
    this.ctx.terrain.setBrush(this.hit?.[0] ?? 0, this.hit?.[2] ?? 0, b.radius, !!this.hit, this.color());
  }

  /** Odświeża kursor po zmianie pędzla z klawiatury (rozmiar, obrót). */
  refreshCursor(): void {
    const b = this.ctx.state.brush;
    this.ctx.terrain.setBrushShape(b.shape ?? 'circle', b.angle ?? 0, b.softness);
    if (this.hit) this.ctx.terrain.setBrush(this.hit[0], this.hit[2], b.radius, true, this.color());
  }

  down(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.cursor(e);
    if (this.special(e)) return;
    this.invert = e.shiftKey;
    this.painting = true;
    this.ctx.doc.beginStroke();
    if (this.hit) this.step(this.hit, 1 / 60);
  }

  /** Klik specjalny (np. Ctrl + klik pobiera wysokość). Zwraca true, gdy obsłużony. */
  protected special(_e: PointerEvent): boolean {
    return false;
  }

  move(e: PointerEvent): void {
    this.cursor(e);
  }

  up(): void {
    if (!this.painting) return;
    this.painting = false;
    this.ctx.doc.endStroke(this.kind);
  }

  tick(dt: number): void {
    if (this.painting && this.hit) this.step(this.hit, dt);
  }
}

export class SculptTool extends BrushTool {
  protected kind = 'heights' as const;
  hint(): string {
    return t(`hint.sculpt.${this.ctx.state.heightTool}`);
  }
  protected color(): number {
    return this.ctx.state.heightTool === 'lower' ? 0x60a0ff : 0xffffff;
  }
  protected special(e: PointerEvent): boolean {
    if (!(e.ctrlKey || e.metaKey) || !this.hit) return false;
    this.ctx.state.brush.target = Math.round(this.hit[1] * 100) / 100;
    this.ctx.state.heightTool = 'flatten';
    this.ctx.stateChanged();
    this.ctx.toast(t('toast.pickedHeight', { h: this.ctx.state.brush.target }));
    return true;
  }
  protected step(hit: Vec3, dt: number): void {
    let tool = this.ctx.state.heightTool;
    if (this.invert && tool === 'raise') tool = 'lower';
    else if (this.invert && tool === 'lower') tool = 'raise';
    const r = applyHeightBrush(this.ctx.doc.map, tool, hit[0], hit[2], this.ctx.state.brush, dt);
    this.ctx.doc.strokeChanged(r, 'heights');
  }
}

export class PaintTool extends BrushTool {
  protected kind = 'layers' as const;
  hint(): string {
    const l = this.ctx.doc.schema.terrainLayers.find((x) => x.id === this.ctx.state.paintLayer);
    return t('hint.paint', { layer: locText(l?.name, getLang(), this.ctx.state.paintLayer) });
  }
  protected color(): number {
    const l = this.ctx.doc.schema.terrainLayers.find((x) => x.id === this.ctx.state.paintLayer);
    return new THREE.Color(l?.color ?? '#ffffff').getHex();
  }
  protected step(hit: Vec3, dt: number): void {
    const layer = this.invert ? this.ctx.doc.schema.terrainLayers[0].id : this.ctx.state.paintLayer;
    const r = paintLayer(this.ctx.doc.map, layer, hit[0], hit[2], this.ctx.state.brush, dt);
    this.ctx.doc.strokeChanged(r, 'layers');
  }
}

// ---------------- Stempel ----------------

/** Klik odbija stempel; przeciąganie odbija kolejne co promień (np. wąwóz wzdłuż drogi). Shift odwraca. */
export class StampTool implements Tool {
  private hit: Vec3 | null = null;
  private last: Vec3 | null = null;
  private invert = false;

  constructor(private ctx: Ctx) {}

  private entry() {
    return this.ctx.stamps.get(this.ctx.state.stamp.id);
  }

  hint(): string {
    const e = this.entry();
    return t('hint.stamp', { name: e ? (e.builtin ? t(e.name) : e.name) : '—' });
  }

  refreshCursor(): void {
    const b = this.ctx.state.brush;
    const e = this.entry();
    this.ctx.terrain.setStamp(e?.stamp ?? null, this.ctx.state.stamp.midZero);
    this.ctx.terrain.setBrushShape('stamp', b.angle ?? 0, b.softness);
    if (this.hit) this.ctx.terrain.setBrush(this.hit[0], this.hit[2], b.radius, true, 0xffd000);
  }

  deactivate(): void {
    this.ctx.terrain.setBrush(0, 0, 1, false);
    this.ctx.terrain.setBrushShape(this.ctx.state.brush.shape ?? 'circle', this.ctx.state.brush.angle ?? 0, this.ctx.state.brush.softness);
    if (this.last) this.ctx.doc.endStroke('heights');
    this.last = null;
  }

  private stampAt(p: Vec3): void {
    const e = this.entry();
    if (!e?.stamp) return;
    const s = this.ctx.state;
    const r = applyStamp(this.ctx.doc.map, e.stamp, p[0], p[2], s.brush, s.stamp.height * (this.invert ? -1 : 1), s.stamp.midZero);
    this.ctx.doc.strokeChanged(r, 'heights');
    this.last = p;
  }

  down(e: PointerEvent): void {
    if (e.button !== 0) return;
    this.move(e);
    if (!this.hit) return;
    if (!this.entry()?.stamp) {
      this.ctx.toast(t('toast.noStamp'), 'error');
      return;
    }
    this.invert = e.shiftKey;
    this.ctx.doc.beginStroke();
    this.stampAt(this.hit);
  }

  move(e: PointerEvent): void {
    this.hit = this.ctx.terrainHit(e);
    const b = this.ctx.state.brush;
    this.refreshCursor();
    this.ctx.terrain.setBrush(this.hit?.[0] ?? 0, this.hit?.[2] ?? 0, b.radius, !!this.hit, 0xffd000);
    if (this.last && this.hit && Math.hypot(this.hit[0] - this.last[0], this.hit[2] - this.last[2]) >= b.radius) this.stampAt(this.hit);
  }

  up(): void {
    if (!this.last) return;
    this.last = null;
    this.ctx.doc.endStroke('heights');
  }
}

// ---------------- Wstawianie obiektów i rysowanie ścieżek/stref ----------------

export class PlaceTool implements Tool {
  private draft: Vec3[] = [];
  private preview: THREE.Line;
  private ghost: THREE.Mesh;
  private last: Vec3 | null = null;

  constructor(private ctx: Ctx) {
    this.preview = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.5, gapSize: 0.3, depthTest: false }));
    this.preview.renderOrder = 10;
    this.ghost = new THREE.Mesh(new THREE.SphereGeometry(0.25, 12, 8), new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.8 }));
    this.ghost.renderOrder = 10;
  }

  private type() {
    return this.ctx.state.placeType ? getType(this.ctx.doc.schema, this.ctx.state.placeType) : undefined;
  }

  private drawing(): boolean {
    const k = this.type()?.kind;
    return k === 'path' || k === 'zone';
  }

  hint(): string {
    const ty = this.type();
    if (!ty) return t('hint.placeNone');
    const name = locText(ty.name, getLang(), ty.id);
    if (ty.kind === 'path') return t('hint.drawPath', { name, n: this.draft.length });
    if (ty.kind === 'zone') return t('hint.drawZone', { name, n: this.draft.length });
    return t('hint.place', { name });
  }

  activate(): void {
    this.ctx.viewport.scene.add(this.preview, this.ghost);
    this.draft = [];
    this.updatePreview();
  }

  deactivate(): void {
    this.ctx.viewport.scene.remove(this.preview, this.ghost);
    this.draft = [];
  }

  down(e: PointerEvent): void {
    if (e.button !== 0) return;
    const hit = this.ctx.terrainHit(e);
    const ty = this.type();
    if (!hit || !ty) return;
    const p = this.ctx.snap(hit);
    p[1] = heightAt(this.ctx.doc.map, p[0], p[2]);
    if (this.drawing()) {
      // klik w pierwszy punkt strefy zamyka ją
      if (ty.kind === 'zone' && this.draft.length >= 3 && Math.hypot(p[0] - this.draft[0][0], p[2] - this.draft[0][2]) < this.ctx.state.brush.radius * 0.15 + 0.3) {
        this.finish();
        return;
      }
      this.draft.push(p);
      this.updatePreview();
      this.ctx.refreshHint();
    } else {
      this.ctx.doc.addObject(ty.id, p);
    }
  }

  move(e: PointerEvent): void {
    const hit = this.ctx.terrainHit(e);
    this.last = hit ? this.ctx.snap(hit) : null;
    if (this.last) this.last[1] = heightAt(this.ctx.doc.map, this.last[0], this.last[2]);
    this.updatePreview();
  }

  dblclick(): void {
    if (this.drawing()) this.finish();
  }

  private finish(): void {
    const ty = this.type();
    if (!ty) return;
    // dwuklik dodaje dwa razy ten sam punkt – usuń duplikaty na końcu
    const pts = this.draft.filter((p, k) => k === 0 || Math.hypot(p[0] - this.draft[k - 1][0], p[2] - this.draft[k - 1][2]) > 1e-6);
    const min = ty.kind === 'zone' ? 3 : 2;
    if (pts.length < min) {
      this.ctx.toast(t('toast.minPoints', { n: min }), 'error');
      return;
    }
    this.ctx.doc.addObject(ty.id, [0, 0, 0], pts);
    this.draft = [];
    this.updatePreview();
    this.ctx.setTool('select');
  }

  key(e: KeyboardEvent): boolean {
    if (!this.drawing()) return false;
    if (e.key === 'Enter') {
      this.finish();
      return true;
    }
    if (e.key === 'Backspace' && this.draft.length) {
      this.draft.pop();
      this.updatePreview();
      this.ctx.refreshHint();
      return true;
    }
    if (e.key === 'Escape' && this.draft.length) {
      this.draft = [];
      this.updatePreview();
      this.ctx.refreshHint();
      return true;
    }
    return false;
  }

  private updatePreview(): void {
    const ty = this.type();
    this.ghost.visible = !!this.last;
    if (this.last) {
      this.ghost.position.set(this.last[0], this.last[1] + 0.1, this.last[2]);
      (this.ghost.material as THREE.MeshBasicMaterial).color.set(ty?.look.color ?? '#ffffff');
    }
    const pts = [...this.draft];
    if (this.last && this.drawing()) pts.push(this.last);
    if (ty?.kind === 'zone' && pts.length >= 3) pts.push(pts[0]);
    this.preview.visible = pts.length >= 2;
    if (pts.length >= 2) {
      this.preview.geometry.dispose();
      this.preview.geometry = new THREE.BufferGeometry().setFromPoints(pts.map((p) => new THREE.Vector3(p[0], p[1] + 0.1, p[2])));
      this.preview.computeLineDistances();
      (this.preview.material as THREE.LineDashedMaterial).color.set(ty?.look.color ?? '#ffffff');
    }
  }
}
