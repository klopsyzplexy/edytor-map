// Nakładka kolizji na terenie: kształty kolizji kolorami według rodzaju (z wypełnionymi obrysami obiektów)
// i powierzchnie chodliwe. Wspólna dla trybu gry (klawisz C) i edytora (przycisk „Kolizje”).
import * as THREE from 'three';
import { COLLISION_LINE, COLLISION_ZONE, type CollisionShape } from '../core/collision';
import { heightAt, type MapData } from '../core/map';
import type { WalkableSurface } from '../core/walkable';

/** Kolory nakładki kolizji (legenda w panelu). */
export const OVERLAY_COLORS = { zone: '#ff4d4d', line: '#ff8a3d', object: '#e040fb', mask: '#f21f1a', walkable: '#3ddc84', teleport: '#38e1ff' };

/** Dodaje do `group` linie i wypełnienia kształtów kolizji oraz siatkę powierzchni chodliwych. */
export function buildCollisionOverlay(group: THREE.Group, map: MapData, shapes: CollisionShape[], walk: WalkableSurface[]): void {
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
  for (const s of shapes) {
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
  for (const s of shapes) {
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
    group.add(mesh);
  }
  for (const [maps, dash] of [[solid, false], [dashed, true]] as const)
    for (const [color, pos] of maps) {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      const mat = dash ? new THREE.LineDashedMaterial({ color, dashSize: 0.4, gapSize: 0.3, depthTest: false, transparent: true }) : new THREE.LineBasicMaterial({ color, depthTest: false, transparent: true });
      const seg = new THREE.LineSegments(g, mat);
      if (dash) seg.computeLineDistances();
      seg.renderOrder = 7;
      group.add(seg);
    }
  // powierzchnie chodliwe – zielona siatka
  const pos: number[] = [];
  for (const w of walk) for (let k = 0; k + 8 < w.triangles.length; k += 9) for (const [a, b] of [[0, 3], [3, 6], [6, 0]]) pos.push(w.triangles[k + a], w.triangles[k + a + 1] + 0.03, w.triangles[k + a + 2], w.triangles[k + b], w.triangles[k + b + 1] + 0.03, w.triangles[k + b + 2]);
  if (pos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    const seg = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: OVERLAY_COLORS.walkable, transparent: true, opacity: 0.8 }));
    seg.renderOrder = 6;
    group.add(seg);
  }}

/** Usuwa zawartość nakładki i zwalnia jej geometrie i materiały. */
export function clearOverlay(group: THREE.Group): void {
  for (const c of [...group.children]) {
    group.remove(c);
    c.traverse((x) => {
      const m = x as THREE.Mesh;
      m.geometry?.dispose();
      (m.material as THREE.Material | undefined)?.dispose?.();
    });
  }
}
