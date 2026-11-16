// Operacje na terenie: pędzle wysokości, malowanie warstw, strome zbocza, promień w teren.
import { cellSize, heightAt, type MapData, type Vec3 } from './map';

export type HeightTool = 'raise' | 'lower' | 'smooth' | 'flatten' | 'noise';
export type BrushShape = 'circle' | 'square' | 'diamond';
export const BRUSH_SHAPES: BrushShape[] = ['circle', 'square', 'diamond'];

export interface Brush {
  /** Promień w jednostkach mapy (dla kwadratu – połowa boku, dla rombu – połowa przekątnej). */
  radius: number;
  /** Kształt pędzla (domyślnie koło). */
  shape?: BrushShape;
  /** Obrót kształtu w stopniach (kwadrat, romb, stempel). */
  angle?: number;
  /** Siła 0–1. */
  strength: number;
  /** Miękkość krawędzi 0–1 (0 = twarda krawędź, 1 = łagodnie od środka). */
  softness: number;
  /** Wysokość docelowa pędzla „wyrównaj”. */
  target: number;
}

/** Prostokąt zmienionych wierzchołków (włącznie). */
export interface Rect {
  i0: number;
  j0: number;
  i1: number;
  j1: number;
}

export function unionRect(a: Rect | null, b: Rect | null): Rect | null {
  if (!a) return b;
  if (!b) return a;
  return { i0: Math.min(a.i0, b.i0), j0: Math.min(a.j0, b.j0), i1: Math.max(a.i1, b.i1), j1: Math.max(a.j1, b.j1) };
}

export function brushWeight(d: number, r: number, softness: number): number {
  if (d >= r) return 0;
  const inner = r * (1 - softness);
  if (d <= inner) return 1;
  const t = (d - inner) / (r - inner);
  return 1 - t * t * (3 - 2 * t);
}

/**
 * Przesunięcie od środka pędzla w układzie obróconego pędzla. Obrót o `angle` stopni
 * (patrząc z góry, od osi +X w stronę +Z). Ta sama konwencja jest w shaderze kursora.
 */
export function brushLocal(dx: number, dz: number, angleDeg = 0): [number, number] {
  if (!angleDeg) return [dx, dz];
  const a = (angleDeg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [dx * c + dz * s, -dx * s + dz * c];
}

/** „Odległość” od środka w normie kształtu: koło – euklidesowa, kwadrat – maksimum, romb – suma. */
export function shapeDistance(dx: number, dz: number, shape: BrushShape = 'circle', angleDeg = 0): number {
  if (shape === 'circle') return Math.hypot(dx, dz);
  const [x, z] = brushLocal(dx, dz, angleDeg);
  return shape === 'square' ? Math.max(Math.abs(x), Math.abs(z)) : Math.abs(x) + Math.abs(z);
}

/** Zasięg pędzla w osiach mapy (obrócony kwadrat wystaje poza promień). */
function reach(b: Brush): number {
  return b.shape === 'square' && b.angle ? b.radius * Math.SQRT2 : b.radius;
}

/** Wierzchołki w zasięgu pędzla wraz z wagą. */
function forEachInBrush(map: MapData, cx: number, cz: number, b: Brush, fn: (idx: number, w: number, i: number, j: number) => void): Rect | null {
  const { nx, nz } = map.terrain;
  const [sx, sz] = cellSize(map);
  const r = reach(b);
  const i0 = Math.max(0, Math.floor((cx - r) / sx));
  const i1 = Math.min(nx - 1, Math.ceil((cx + r) / sx));
  const j0 = Math.max(0, Math.floor((cz - r) / sz));
  const j1 = Math.min(nz - 1, Math.ceil((cz + r) / sz));
  if (i0 > i1 || j0 > j1) return null;
  let any = false;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const w = brushWeight(shapeDistance(i * sx - cx, j * sz - cz, b.shape, b.angle), b.radius, b.softness);
      if (w > 0) {
        any = true;
        fn(j * nx + i, w, i, j);
      }
    }
  return any ? { i0, j0, i1, j1 } : null;
}

// Szum wartości z ziarnem (powtarzalny), wynik 0–1.
function hash(i: number, j: number): number {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function valueNoise(x: number, z: number): number {
  const i = Math.floor(x);
  const j = Math.floor(z);
  const tx = x - i;
  const tz = z - j;
  const sx = tx * tx * (3 - 2 * tx);
  const sz = tz * tz * (3 - 2 * tz);
  const a = hash(i, j) * (1 - sx) + hash(i + 1, j) * sx;
  const b = hash(i, j + 1) * (1 - sx) + hash(i + 1, j + 1) * sx;
  return a * (1 - sz) + b * sz;
}

/** Jeden krok pędzla wysokości (dt w sekundach). Zwraca zmieniony prostokąt. */
export function applyHeightBrush(map: MapData, tool: HeightTool, cx: number, cz: number, b: Brush, dt: number): Rect | null {
  const h = map.terrain.heights;
  const { nx, nz } = map.terrain;
  const [sx, sz] = cellSize(map);
  const rate = b.strength * Math.max(b.radius, 1) * 1.5 * dt;
  if (tool === 'smooth') {
    const src = h.slice();
    return forEachInBrush(map, cx, cz, b, (idx, w, i, j) => {
      let sum = 0;
      let n = 0;
      for (let dj = -1; dj <= 1; dj++)
        for (let di = -1; di <= 1; di++) {
          const ii = i + di;
          const jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= nz) continue;
          sum += src[jj * nx + ii];
          n++;
        }
      const k = Math.min(1, b.strength * w * dt * 12);
      h[idx] = src[idx] + (sum / n - src[idx]) * k;
    });
  }
  return forEachInBrush(map, cx, cz, b, (idx, w, i, j) => {
    switch (tool) {
      case 'raise':
        h[idx] += rate * w;
        break;
      case 'lower':
        h[idx] -= rate * w;
        break;
      case 'flatten':
        h[idx] += (b.target - h[idx]) * Math.min(1, b.strength * w * dt * 8);
        break;
      case 'noise': {
        const scale = Math.max(b.radius / 3, sx, sz);
        const n = valueNoise((i * sx) / scale, (j * sz) / scale) * 2 - 1;
        h[idx] += n * rate * 0.8 * w;
        break;
      }
    }
  });
}

/** Stempel wysokości: szary obraz (0–1), wiersz 0 to góra obrazu (mniejsze z). */
export interface HeightStamp {
  w: number;
  h: number;
  data: Float32Array;
}

/** Wartość stempla w punkcie (u, v) ∈ [0, 1]² – interpolacja dwuliniowa. */
export function sampleStamp(st: HeightStamp, u: number, v: number): number {
  const fx = Math.min(Math.max(u * (st.w - 1), 0), st.w - 1);
  const fy = Math.min(Math.max(v * (st.h - 1), 0), st.h - 1);
  const x = Math.min(Math.floor(fx), st.w - 2);
  const y = Math.min(Math.floor(fy), st.h - 2);
  const tx = fx - x;
  const ty = fy - y;
  const d = st.data;
  const a = d[y * st.w + x] * (1 - tx) + d[y * st.w + x + 1] * tx;
  const b = d[(y + 1) * st.w + x] * (1 - tx) + d[(y + 1) * st.w + x + 1] * tx;
  return a * (1 - ty) + b * ty;
}

/**
 * Odbija stempel w terenie: kwadrat o boku 2·promień, obrócony o `brush.angle`. Wysokość zmienia się o
 * `wartość · height`; przy `midZero` szary 50% oznacza „bez zmian” (ciemniejsze obniża, jaśniejsze podnosi).
 */
export function applyStamp(map: MapData, st: HeightStamp, cx: number, cz: number, b: Brush, height: number, midZero = false): Rect | null {
  const h = map.terrain.heights;
  const { nx, nz } = map.terrain;
  const [sx, sz] = cellSize(map);
  const r = b.radius * Math.SQRT2;
  const i0 = Math.max(0, Math.floor((cx - r) / sx));
  const i1 = Math.min(nx - 1, Math.ceil((cx + r) / sx));
  const j0 = Math.max(0, Math.floor((cz - r) / sz));
  const j1 = Math.min(nz - 1, Math.ceil((cz + r) / sz));
  if (i0 > i1 || j0 > j1 || st.w < 2 || st.h < 2) return null;
  let any = false;
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      const [x, z] = brushLocal(i * sx - cx, j * sz - cz, b.angle);
      const u = x / (2 * b.radius) + 0.5;
      const v = z / (2 * b.radius) + 0.5;
      if (u < 0 || u > 1 || v < 0 || v > 1) continue;
      let val = sampleStamp(st, u, v);
      if (midZero) val = val * 2 - 1;
      if (val === 0) continue;
      h[j * nx + i] += val * height;
      any = true;
    }
  return any ? { i0, j0, i1, j1 } : null;
}

/** Malowanie warstwy: zwiększa jej wagę i proporcjonalnie zmniejsza pozostałe. */
export function paintLayer(map: MapData, layerId: string, cx: number, cz: number, b: Brush, dt: number): Rect | null {
  const target = map.terrain.layers[layerId];
  if (!target) return null;
  const others = Object.entries(map.terrain.layers).filter(([id]) => id !== layerId).map(([, a]) => a);
  return forEachInBrush(map, cx, cz, b, (idx, w) => {
    const a = Math.min(1, b.strength * w * dt * 6);
    target[idx] = Math.min(255, Math.ceil(target[idx] + a * (255 - target[idx])));
    for (const o of others) o[idx] = Math.max(0, Math.floor(o[idx] * (1 - a)));
  });
}

/** Nachylenie terenu w wierzchołku, w stopniach. */
export function slopeAt(map: MapData, i: number, j: number): number {
  const { nx, nz, heights: h } = map.terrain;
  const [sx, sz] = cellSize(map);
  const il = Math.max(0, i - 1);
  const ir = Math.min(nx - 1, i + 1);
  const jl = Math.max(0, j - 1);
  const jr = Math.min(nz - 1, j + 1);
  const dx = (h[j * nx + ir] - h[j * nx + il]) / ((ir - il) * sx);
  const dz = (h[jr * nx + i] - h[jl * nx + i]) / ((jr - jl) * sz);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

/** Maska nieprzechodniości ze stromych zboczy: 255 = zbyt stromo, 0 = można przejść. */
export function computeSlopeMask(map: MapData, maxDeg = map.settings.slope.maxDeg): Uint8Array {
  const { nx, nz } = map.terrain;
  const out = new Uint8Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) out[j * nx + i] = slopeAt(map, i, j) > maxDeg ? 255 : 0;
  return out;
}

/** Promień w teren. Zwraca punkt trafienia albo null. */
export function raycastTerrain(map: MapData, origin: Vec3, dir: Vec3, maxDist = 0): Vec3 | null {
  const [w, d] = map.settings.size;
  const [sx, sz] = cellSize(map);
  const len = Math.hypot(dir[0], dir[1], dir[2]) || 1;
  const dx = dir[0] / len;
  const dy = dir[1] / len;
  const dz = dir[2] / len;
  // Przycięcie do pudełka mapy (w poziomie), żeby nie iść krokami przez pustkę.
  let tMin = 0;
  let tMax = maxDist || (w + d) * 4 + Math.abs(origin[1]) * 4;
  for (const [o, v, lo, hi] of [
    [origin[0], dx, 0, w],
    [origin[2], dz, 0, d],
  ] as const) {
    if (Math.abs(v) < 1e-12) {
      if (o < lo || o > hi) return null;
    } else {
      let t1 = (lo - o) / v;
      let t2 = (hi - o) / v;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tMin = Math.max(tMin, t1);
      tMax = Math.min(tMax, t2);
    }
  }
  if (tMin > tMax) return null;
  const step = Math.min(sx, sz) * 0.5;
  const above = (t: number) => origin[1] + dy * t - heightAt(map, origin[0] + dx * t, origin[2] + dz * t);
  let prevT = tMin;
  if (above(prevT) < 0) return [origin[0] + dx * prevT, heightAt(map, origin[0] + dx * prevT, origin[2] + dz * prevT), origin[2] + dz * prevT];
  for (let t = tMin + step; t <= tMax + step; t += step) {
    const tt = Math.min(t, tMax);
    if (above(tt) <= 0) {
      let a = prevT;
      let b = tt;
      for (let k = 0; k < 20; k++) {
        const m = (a + b) / 2;
        if (above(m) > 0) a = m;
        else b = m;
      }
      const x = origin[0] + dx * b;
      const z = origin[2] + dz * b;
      return [x, heightAt(map, x, z), z];
    }
    prevT = tt;
    if (tt >= tMax) break;
  }
  return null;
}

/** Kopia fragmentu tablicy (do historii cofnij/ponów). */
export function copyRect<T extends Float32Array | Uint8Array>(a: T, nx: number, r: Rect): T {
  const w = r.i1 - r.i0 + 1;
  const out = new (a.constructor as { new (n: number): T })(w * (r.j1 - r.j0 + 1));
  for (let j = r.j0; j <= r.j1; j++) out.set(a.subarray(j * nx + r.i0, j * nx + r.i1 + 1) as never, (j - r.j0) * w);
  return out;
}

export function pasteRect<T extends Float32Array | Uint8Array>(a: T, nx: number, r: Rect, src: T): void {
  const w = r.i1 - r.i0 + 1;
  for (let j = r.j0; j <= r.j1; j++) a.set(src.subarray((j - r.j0) * w, (j - r.j0 + 1) * w) as never, j * nx + r.i0);
}
