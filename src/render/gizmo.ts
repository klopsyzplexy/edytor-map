// Uchwyty przesuwania, obrotu i skali. Działają też na wielu obiektach naraz (wspólny punkt obrotu).
import * as THREE from 'three';
import { TransformControls } from 'three/addons/controls/TransformControls.js';
import type { EditorDoc } from '../core/doc';
import { cloneObject, objectCenter, type MapObject, type Vec3 } from '../core/map';
import type { ObjectsView } from './objectsView';
import type { Viewport } from './viewport';

const D2R = Math.PI / 180;
const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

function objectMatrix(o: MapObject): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0] * D2R, o.rotation[1] * D2R, o.rotation[2] * D2R, 'XYZ'));
  return new THREE.Matrix4().compose(new THREE.Vector3(...o.position), q, new THREE.Vector3(...o.scale));
}

export class Gizmo {
  readonly controls: TransformControls;
  private pivot = new THREE.Object3D();
  private start: { pivot: THREE.Matrix4; objects: MapObject[] } | null = null;
  enabled = true;
  mode: 'translate' | 'rotate' | 'scale' = 'translate';

  constructor(
    viewport: Viewport,
    private doc: () => EditorDoc,
    private view: () => ObjectsView,
  ) {
    this.controls = new TransformControls(viewport.camera, viewport.renderer.domElement);
    this.controls.setSize(0.9);
    viewport.scene.add(this.pivot);
    viewport.scene.add(this.controls.getHelper());
    this.controls.addEventListener('dragging-changed', (e) => {
      const dragging = (e as unknown as { value: boolean }).value;
      viewport.controls.enabled = !dragging;
      if (dragging) this.begin();
      else this.commit();
    });
    this.controls.addEventListener('objectChange', () => this.apply());
  }

  /** Czy kursor jest nad uchwytem albo trwa przeciąganie (wtedy narzędzia ignorują kliknięcie). */
  get active(): boolean {
    return this.controls.dragging || (this.controls.axis !== null && this.controls.object !== undefined);
  }

  setSnap(on: boolean, step: number): void {
    this.controls.setTranslationSnap(on ? step : null);
    this.controls.setRotationSnap(on ? 15 * D2R : null);
    this.controls.setScaleSnap(on ? 0.1 : null);
  }

  setMode(mode: 'translate' | 'rotate' | 'scale'): void {
    this.mode = mode;
    this.controls.setMode(mode);
    this.refresh();
  }

  /** Dopasowuje uchwyty do bieżącego zaznaczenia. */
  refresh(): void {
    if (this.controls.dragging) return;
    const doc = this.doc();
    const sel = doc.selectedObjects().filter((o) => doc.isPickable(o));
    if (!this.enabled || sel.length === 0) {
      this.controls.detach();
      return;
    }
    const single = sel.length === 1 && sel[0].points.length === 0 ? sel[0] : null;
    if (single) {
      this.pivot.position.set(...single.position);
      this.pivot.rotation.set(single.rotation[0] * D2R, single.rotation[1] * D2R, single.rotation[2] * D2R, 'XYZ');
      this.pivot.scale.set(...single.scale);
      this.controls.setSpace(this.mode === 'translate' ? 'world' : 'local');
    } else {
      const c: Vec3 = [0, 0, 0];
      for (const o of sel) {
        const p = objectCenter(o);
        for (let k = 0; k < 3; k++) c[k] += p[k] / sel.length;
      }
      this.pivot.position.set(...c);
      this.pivot.rotation.set(0, 0, 0);
      this.pivot.scale.set(1, 1, 1);
      this.controls.setSpace('world');
    }
    this.pivot.updateMatrixWorld(true);
    this.controls.attach(this.pivot);
  }

  private begin(): void {
    this.pivot.updateMatrix();
    const doc = this.doc();
    this.start = { pivot: this.pivot.matrix.clone(), objects: doc.selectedObjects().filter((o) => doc.isPickable(o)).map(cloneObject) };
  }

  private apply(): void {
    if (!this.start) return;
    this.pivot.updateMatrix();
    const delta = this.pivot.matrix.clone().multiply(this.start.pivot.clone().invert());
    const doc = this.doc();
    const pos = new THREE.Vector3();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const e = new THREE.Euler();
    for (const st of this.start.objects) {
      const o = doc.getObject(st.id);
      if (!o) continue;
      if (st.points.length) {
        o.points = st.points.map((p) => {
          const v = new THREE.Vector3(...p).applyMatrix4(delta);
          return [r4(v.x), r4(v.y), r4(v.z)];
        });
      } else {
        delta.clone().multiply(objectMatrix(st)).decompose(pos, q, s);
        e.setFromQuaternion(q, 'XYZ');
        o.position = [r4(pos.x), r4(pos.y), r4(pos.z)];
        o.rotation = [r4(e.x / D2R), r4(e.y / D2R), r4(e.z / D2R)];
        o.scale = [r4(s.x), r4(s.y), r4(s.z)];
      }
    }
    this.view().sync();
  }

  private commit(): void {
    const st = this.start;
    this.start = null;
    if (!st) return;
    const doc = this.doc();
    const finals = new Map(st.objects.map((o) => [o.id, cloneObject(doc.getObject(o.id) ?? o)]));
    // przywróć stan sprzed przeciągania, a zmianę zapisz jako jeden krok historii
    for (const o of st.objects) {
      const cur = doc.getObject(o.id);
      if (cur) Object.assign(cur, cloneObject(o));
    }
    const changed = st.objects.some((o) => JSON.stringify(o) !== JSON.stringify(finals.get(o.id)));
    if (changed)
      doc.updateObjects([...finals.keys()], (o) => {
        const f = finals.get(o.id)!;
        o.position = f.position;
        o.rotation = f.rotation;
        o.scale = f.scale;
        o.points = f.points;
      }, this.mode);
    this.refresh();
  }
}
