// Drobna matematyka 3D bez Three.js (do eksportu i walidacji). Obrót: kąty Eulera w stopniach,
// kolejność XYZ – tak samo jak THREE.Euler('XYZ'), czyli macierz R = Rx · Ry · Rz.
import type { Vec3 } from './map';

const D2R = Math.PI / 180;

export function rotateXYZ(v: Vec3, rotDeg: Vec3): Vec3 {
  const [ax, ay, az] = rotDeg.map((a) => a * D2R);
  let [x, y, z] = v;
  // najpierw Rz, potem Ry, na końcu Rx (R = Rx·Ry·Rz działa na wektor od prawej)
  let c = Math.cos(az);
  let s = Math.sin(az);
  [x, y] = [x * c - y * s, x * s + y * c];
  c = Math.cos(ay);
  s = Math.sin(ay);
  [x, z] = [x * c + z * s, -x * s + z * c];
  c = Math.cos(ax);
  s = Math.sin(ax);
  [y, z] = [y * c - z * s, y * s + z * c];
  return [x, y, z];
}

/** Punkt lokalny obiektu → układ mapy: skala, obrót, przesunięcie. */
export function localToWorld(p: Vec3, position: Vec3, rotDeg: Vec3, scale: Vec3): Vec3 {
  const r = rotateXYZ([p[0] * scale[0], p[1] * scale[1], p[2] * scale[2]], rotDeg);
  return [r[0] + position[0], r[1] + position[1], r[2] + position[2]];
}

export function round(v: number, digits = 4): number {
  const k = 10 ** digits;
  return Math.round(v * k) / k;
}

/** Czy punkt (x, z) leży w wielokącie (rzut na ziemię). */
export function pointInPolygon(x: number, z: number, poly: Vec3[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, , zi] = poly[i];
    const [xj, , zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}
