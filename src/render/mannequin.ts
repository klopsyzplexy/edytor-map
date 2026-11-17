// Manekin postaci (klawisz M): półprzezroczysta postać w skali gracza przy kursorze i obok zaznaczonego
// obiektu – do oceny proporcji budynków, drzew i modeli. Tylko podgląd, mapa się nie zmienia.
import * as THREE from 'three';
import type { EditorDoc } from '../core/doc';
import { modelBaseScale, type Vec3 } from '../core/map';
import { withBaseScale } from '../core/objectModel';
import type { ModelLibrary } from './models';
import type { ObjectsView } from './objectsView';

const D2R = Math.PI / 180;
const COLOR = 0x4fd1ff;

export class Mannequin {
  readonly group = new THREE.Group();
  private atCursor = new THREE.Group();
  private atSelection = new THREE.Group();
  private sig = '';
  private material = new THREE.MeshStandardMaterial({ color: COLOR, transparent: true, opacity: 0.45, depthWrite: false, roughness: 0.8 });
  enabled = false;
  /** Punkt terenu pod kursorem (null = kursor poza terenem). */
  cursor: Vec3 | null = null;

  constructor(
    private doc: () => EditorDoc,
    private models: ModelLibrary,
    private objects: () => ObjectsView,
  ) {
    this.group.add(this.atCursor, this.atSelection);
    this.group.visible = false;
  }

  toggle(): boolean {
    this.enabled = !this.enabled;
    this.group.visible = this.enabled;
    return this.enabled;
  }

  /** Co klatkę: przebudowa sylwetki po zmianie postaci w schemacie i ustawienie obu kopii. */
  tick(): void {
    if (!this.enabled) return;
    const doc = this.doc();
    const pl = doc.schema.player;
    const base = pl.model ? modelBaseScale(doc.map, pl.model) : 1;
    const state = pl.model ? this.models.state(pl.model) : 'none';
    const sig = JSON.stringify([pl.model, pl.modelTransform, pl.height, pl.radius, base, state]);
    if (sig !== this.sig) {
      this.sig = sig;
      this.rebuild();
    }
    this.atCursor.visible = !!this.cursor;
    if (this.cursor) this.atCursor.position.set(...this.cursor);

    // obok zaznaczenia: z prawej strony (+X) pudełka zaznaczonych obiektów, na ziemi
    const sel = doc.selectedObjects().filter((o) => o.points.length === 0);
    this.atSelection.visible = false;
    if (sel.length) {
      const box = new THREE.Box3();
      for (const o of sel) {
        const obj = this.objects().object3D(o.id);
        if (obj) box.expandByObject(obj, true);
      }
      if (!box.isEmpty()) {
        const x = box.max.x + pl.radius * 1.5;
        const z = (box.min.z + box.max.z) / 2;
        this.atSelection.position.set(x, box.min.y, z);
        this.atSelection.visible = true;
      }
    }
  }

  private rebuild(): void {
    for (const g of [this.atCursor, this.atSelection]) {
      for (const c of [...g.children]) {
        g.remove(c);
        c.traverse((x) => (x as THREE.Mesh).geometry?.dispose());
      }
      g.add(this.figure());
    }
  }

  /** Model postaci (półprzezroczysty) albo prosta sylwetka: tułów, głowa, nogi – o wysokości postaci. */
  private figure(): THREE.Object3D {
    const doc = this.doc();
    const pl = doc.schema.player;
    const inst = pl.model ? this.models.instance(pl.model) : null;
    if (pl.model && inst) {
      const tr = withBaseScale(pl.modelTransform, modelBaseScale(doc.map, pl.model));
      const holder = new THREE.Group();
      holder.position.set(...tr.offset);
      holder.rotation.set(tr.rotation[0] * D2R, tr.rotation[1] * D2R, tr.rotation[2] * D2R, 'XYZ');
      holder.scale.set(...tr.scale);
      inst.traverse((c) => {
        const m = c as THREE.Mesh;
        if (m.isMesh) {
          m.material = this.material;
          m.renderOrder = 5;
        }
      });
      holder.add(inst);
      return holder;
    }
    const h = pl.height;
    const r = Math.min(pl.radius, h / 4);
    const g = new THREE.Group();
    const head = h * 0.13;
    const legs = h * 0.45;
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(r * 0.85, Math.max(0.01, h - legs - head * 2 - r * 1.7), 6, 12), this.material);
    body.position.y = legs + (h - legs - head * 2) / 2;
    const skull = new THREE.Mesh(new THREE.SphereGeometry(head, 16, 12), this.material);
    skull.position.y = h - head;
    g.add(body, skull);
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.32, r * 0.28, legs, 8), this.material);
      leg.position.set(side * r * 0.4, legs / 2, 0);
      g.add(leg);
    }
    g.traverse((c) => ((c as THREE.Mesh).renderOrder = 5));
    return g;
  }
}
