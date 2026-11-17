// Obiekty mapy w scenie: bryły i modele, ścieżki, strefy, podświetlenie zaznaczenia, uchwyty wierzchołków.
import * as THREE from 'three';
import type { EditorDoc } from '../core/doc';
import type { MapObject } from '../core/map';
import { objectModel } from '../core/objectModel';
import { getType, type ObjectTypeDef } from '../core/schema';
import type { ModelLibrary } from './models';

const D2R = Math.PI / 180;
const SELECT_COLOR = 0xffd000;

const unitGeometries: Record<string, THREE.BufferGeometry> = {
  box: new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0),
  cylinder: new THREE.CylinderGeometry(0.5, 0.5, 1, 24).translate(0, 0.5, 0),
  sphere: new THREE.SphereGeometry(0.5, 20, 14).translate(0, 0.5, 0),
  cone: new THREE.ConeGeometry(0.5, 1, 20).translate(0, 0.5, 0),
};
const handleGeom = new THREE.SphereGeometry(1, 12, 8);

export interface PickInfo {
  objectId: string;
  vertex?: number;
}

export class ObjectsView {
  readonly group = new THREE.Group();
  readonly handles = new THREE.Group();
  private items = new Map<string, { obj: THREE.Object3D; sig: string }>();
  private selectionBoxes = new THREE.Group();
  private gameView = false;
  private handleTarget: string | null = null;
  selectedVertex: number | null = null;

  constructor(
    private doc: EditorDoc,
    private models: ModelLibrary,
  ) {
    this.group.add(this.selectionBoxes);
    this.group.add(this.handles);
  }

  setGameView(on: boolean): void {
    this.gameView = on;
    this.sync(true);
  }

  /** Mesh obiektu w scenie (do uchwytów przekształceń). */
  object3D(id: string): THREE.Object3D | undefined {
    return this.items.get(id)?.obj;
  }

  sync(force = false): void {
    const seen = new Set<string>();
    for (const o of this.doc.map.objects) {
      seen.add(o.id);
      const t = getType(this.doc.schema, o.type);
      const visible = this.doc.isVisible(o) && !(this.gameView && t && !t.flags.visibleInGame);
      const m = objectModel(this.doc.schema, o, t);
      const sig = JSON.stringify([o.type, o.position, o.rotation, o.scale, o.points, visible, m, m ? this.models.state(m.ref) : 0]);
      const cur = this.items.get(o.id);
      if (cur && cur.sig === sig && !force) continue;
      if (cur) this.removeItem(o.id);
      const obj = this.build(o, t);
      obj.visible = visible;
      obj.traverse((c) => (c.userData.objectId = o.id));
      this.group.add(obj);
      this.items.set(o.id, { obj, sig });
    }
    for (const id of [...this.items.keys()]) if (!seen.has(id)) this.removeItem(id);
    this.updateSelection();
  }

  private removeItem(id: string): void {
    const it = this.items.get(id);
    if (!it) return;
    this.group.remove(it.obj);
    it.obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.geometry && !Object.values(unitGeometries).includes(m.geometry) && m.geometry !== handleGeom) m.geometry.dispose();
      const mat = m.material as THREE.Material | undefined;
      if (mat && !(c.userData.sharedMaterial)) mat.dispose?.();
    });
    this.items.delete(id);
  }

  private build(o: MapObject, t: ObjectTypeDef | undefined): THREE.Object3D {
    const color = new THREE.Color(t?.look.color ?? '#ff00ff');
    const ghost = !!t && !t.flags.visibleInGame;
    if (t && (t.kind === 'path' || t.kind === 'zone')) return this.buildPolyline(o, t, color);

    const g = new THREE.Group();
    g.position.set(...o.position);
    g.rotation.set(o.rotation[0] * D2R, o.rotation[1] * D2R, o.rotation[2] * D2R, 'XYZ');
    g.scale.set(...o.scale);
    const om = objectModel(this.doc.schema, o, t);
    const model = om ? this.models.instance(om.ref) : null;
    if (model && om) {
      // ułożenie modelu względem punktu obiektu (z typu; własny model obiektu stoi bez zmian)
      const tr = om.transform;
      const holder = new THREE.Group();
      holder.position.set(...tr.offset);
      holder.rotation.set(tr.rotation[0] * D2R, tr.rotation[1] * D2R, tr.rotation[2] * D2R, 'XYZ');
      holder.scale.set(...tr.scale);
      holder.add(model);
      g.add(holder);
      if (ghost)
        model.traverse((c) => {
          const m = c as THREE.Mesh;
          if (m.isMesh) {
            m.material = (m.material as THREE.Material).clone();
            (m.material as THREE.Material).transparent = true;
            (m.material as THREE.Material).opacity = 0.45;
          }
        });
    } else {
      const size = t?.defaultSize ?? [1, 1, 1];
      const mat = new THREE.MeshLambertMaterial({ color, transparent: ghost, opacity: ghost ? 0.4 : 1, depthWrite: !ghost });
      const mesh = new THREE.Mesh(unitGeometries[t?.look.shape ?? 'box'], mat);
      mesh.scale.set(...size);
      g.add(mesh);
      if (ghost || !t) {
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(unitGeometries[t?.look.shape ?? 'box'], 30), new THREE.LineBasicMaterial({ color }));
        edges.scale.set(...size);
        g.add(edges);
      }
    }
    return g;
  }

  private buildPolyline(o: MapObject, t: ObjectTypeDef, color: THREE.Color): THREE.Object3D {
    const g = new THREE.Group();
    const lift = 0.08;
    const pts = o.points.map((p) => new THREE.Vector3(p[0], p[1] + lift, p[2]));
    if (pts.length >= 2) {
      const geo = new THREE.BufferGeometry().setFromPoints(t.kind === 'zone' ? [...pts, pts[0]] : pts);
      const line = new THREE.Line(geo, new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true }));
      line.renderOrder = 3;
      g.add(line);
    }
    // linia kolizji: pas o zadanej grubości wzdłuż łamanej
    const width = t.properties.some((p) => p.id === 'width') && typeof o.props.width === 'number' ? o.props.width : 0;
    if (t.kind === 'path' && width > 0 && pts.length >= 2) {
      const pos: number[] = [];
      const idx: number[] = [];
      for (let k = 0; k + 1 < pts.length; k++) {
        const a = pts[k];
        const b = pts[k + 1];
        const dir = new THREE.Vector3(b.x - a.x, 0, b.z - a.z);
        if (dir.lengthSq() < 1e-9) continue;
        dir.normalize();
        const n = new THREE.Vector3(-dir.z, 0, dir.x).multiplyScalar(width / 2);
        // wydłużenie o pół grubości, żeby odcinki zachodziły na siebie na zakrętach
        const ext = dir.clone().multiplyScalar(k + 2 < pts.length ? width / 2 : 0);
        const base = pos.length / 3;
        for (const p of [a.clone().add(n), a.clone().sub(n), b.clone().add(ext).add(n), b.clone().add(ext).sub(n)]) pos.push(p.x, p.y, p.z);
        idx.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(pos), 3));
      geo.setIndex(idx);
      const band = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.35, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      band.renderOrder = 2;
      g.add(band);
    }
    if (t.kind === 'zone' && pts.length >= 3) {
      const contour = pts.map((p) => new THREE.Vector2(p.x, p.z));
      const tris = THREE.ShapeUtils.triangulateShape(contour, []);
      const pos = new Float32Array(pts.flatMap((p) => [p.x, p.y, p.z]));
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      geo.setIndex(tris.flat());
      const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.25, side: THREE.DoubleSide, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
      fill.renderOrder = 2;
      g.add(fill);
    }
    // małe znaczniki wierzchołków (pierwszy większy – początek ścieżki)
    pts.forEach((p, k) => {
      const m = new THREE.Mesh(handleGeom, new THREE.MeshBasicMaterial({ color, depthTest: false, transparent: true }));
      m.position.copy(p);
      m.scale.setScalar(k === 0 ? 0.28 : 0.16);
      m.renderOrder = 4;
      g.add(m);
    });
    return g;
  }

  /** Obrysy zaznaczonych obiektów i uchwyty wierzchołków zaznaczonej ścieżki/strefy. */
  updateSelection(): void {
    this.selectionBoxes.clear();
    for (const id of this.doc.selection) {
      const it = this.items.get(id);
      if (!it || !it.obj.visible) continue;
      const helper = new THREE.BoxHelper(it.obj, SELECT_COLOR);
      (helper.material as THREE.LineBasicMaterial).depthTest = false;
      helper.renderOrder = 5;
      this.selectionBoxes.add(helper);
    }
    const sel = this.doc.selectedObjects();
    const one = sel.length === 1 ? sel[0] : null;
    const t = one ? getType(this.doc.schema, one.type) : undefined;
    const target = one && t && (t.kind === 'path' || t.kind === 'zone') && this.doc.isPickable(one) ? one : null;
    if (target?.id !== this.handleTarget) this.selectedVertex = null;
    this.handleTarget = target?.id ?? null;
    this.handles.clear();
    if (!target) return;
    target.points.forEach((p, k) => {
      const m = new THREE.Mesh(handleGeom, new THREE.MeshBasicMaterial({ color: k === this.selectedVertex ? 0xff4040 : 0xffffff, depthTest: false }));
      m.position.set(p[0], p[1] + 0.08, p[2]);
      m.renderOrder = 6;
      m.userData = { objectId: target.id, vertex: k, handle: true };
      this.handles.add(m);
    });
  }

  /** Uchwyty mają stały rozmiar na ekranie. */
  tick(camera: THREE.Camera): void {
    for (const h of this.handles.children) h.scale.setScalar(camera.position.distanceTo(h.position) * 0.011);
    for (const b of this.selectionBoxes.children) (b as THREE.BoxHelper).update();
  }

  /** Obiekty, które można trafić kursorem. */
  pickables(): THREE.Object3D[] {
    return [...this.items.entries()].filter(([id, it]) => {
      const o = this.doc.getObject(id);
      return it.obj.visible && o && this.doc.isPickable(o);
    }).map(([, it]) => it.obj);
  }
}
