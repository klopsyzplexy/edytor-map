// Obrys kolizji modelu: przekrój geometrii w paśmie wysokości (od podstawy modelu do wysokości postaci),
// rzutowany na płaszczyznę terenu i zamieniony na uproszczone wielokąty (mogą być wklęsłe; osobne części
// modelu dają osobne wielokąty). Obrys leży w układzie pliku modelu (x, z) i przekształca się razem z obiektem.
// Czyste funkcje, bez DOM i Three.js.
import type { MapObject, Vec3 } from './map';
import { modelToWorld } from './objectModel';
import type { ModelTransform } from './schema';

/** Punkt na płaszczyźnie terenu (x, z). */
export type Pt = [number, number];
/** Obrys: lista wielokątów (każdy zamknięty, bez powtórzenia pierwszego punktu na końcu). */
export type Outline = Pt[][];

/** Ustawienia obrysu kolizji modelu (w mapie: `models[ref].collision`, w bibliotece – domyślne). */
export interface ModelCollision {
  /** Poziom szczegółu 0–1 (0 – najprostszy obrys, 1 – najdokładniejszy); brak = DEFAULT_DETAIL. */
  detail?: number;
  /** Obrys poprawiony ręcznie (`edited`) albo narysowany (`drawn`) w układzie modelu; zastępuje wyliczony. */
  polygons?: Outline;
  source?: 'edited' | 'drawn';
}

export const DEFAULT_DETAIL = 0.5;
/** Liczba oczek siatki pomocniczej wzdłuż dłuższego boku obrysu. */
const GRID = 128;

// ---------- przekrój ----------

/** Obcina wielokąt 3D do półprzestrzeni y ≥ lim (sign = 1) albo y ≤ lim (sign = −1). */
function clipY(poly: Vec3[], lim: number, sign: 1 | -1): Vec3[] {
  const out: Vec3[] = [];
  for (let k = 0; k < poly.length; k++) {
    const a = poly[k];
    const b = poly[(k + 1) % poly.length];
    const da = (a[1] - lim) * sign;
    const db = (b[1] - lim) * sign;
    if (da >= 0) out.push(a);
    if ((da >= 0) !== (db >= 0)) {
      const t = da / (da - db);
      out.push([a[0] + (b[0] - a[0]) * t, lim, a[2] + (b[2] - a[2]) * t]);
    }
  }
  return out;
}

/**
 * Części trójkątów (płaska lista x, y, z × 3 na trójkąt) leżące w paśmie y0 ≤ y ≤ y1,
 * rzutowane na płaszczyznę (x, z). Trójkąty pionowe dają odcinki (wielokąty o zerowym polu).
 */
export function sliceBand(tris: ArrayLike<number>, y0: number, y1: number): Pt[][] {
  const out: Pt[][] = [];
  for (let k = 0; k + 8 < tris.length; k += 9) {
    const ys = [tris[k + 1], tris[k + 4], tris[k + 7]];
    if (Math.max(...ys) < y0 || Math.min(...ys) > y1) continue;
    let poly: Vec3[] = [
      [tris[k], tris[k + 1], tris[k + 2]],
      [tris[k + 3], tris[k + 4], tris[k + 5]],
      [tris[k + 6], tris[k + 7], tris[k + 8]],
    ];
    poly = clipY(poly, y0, 1);
    if (poly.length) poly = clipY(poly, y1, -1);
    if (poly.length) out.push(poly.map((p) => [p[0], p[2]]));
  }
  return out;
}

/** Najniższy i najwyższy punkt geometrii (y). */
export function heightRange(tris: ArrayLike<number>): [number, number] {
  let lo = Infinity;
  let hi = -Infinity;
  for (let k = 1; k < tris.length; k += 3) {
    lo = Math.min(lo, tris[k]);
    hi = Math.max(hi, tris[k]);
  }
  return [lo, hi];
}

// ---------- siatka pomocnicza ----------

interface Grid {
  w: number;
  h: number;
  x0: number;
  z0: number;
  cell: number;
  cells: Uint8Array;
}

function pip(x: number, z: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Zaznacza w siatce oczka przykryte kawałkami przekroju: wnętrza i krawędzie (ściany pionowe to same krawędzie). */
function rasterize(pieces: Pt[][], margin = 0): Grid | null {
  let x0 = Infinity;
  let z0 = Infinity;
  let x1 = -Infinity;
  let z1 = -Infinity;
  for (const p of pieces)
    for (const [x, z] of p) {
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      z0 = Math.min(z0, z);
      z1 = Math.max(z1, z);
    }
  if (!Number.isFinite(x0)) return null;
  const cell = Math.max(x1 - x0, z1 - z0, 1e-4) / GRID;
  // margines (pogrubienie + dwa oczka): kontur zawsze ma puste oczka dookoła
  const m = margin + 2;
  x0 -= cell * m;
  z0 -= cell * m;
  const w = Math.ceil((x1 - x0) / cell) + m + 1;
  const h = Math.ceil((z1 - z0) / cell) + m + 1;
  const cells = new Uint8Array(w * h);
  const mark = (x: number, z: number) => {
    const i = Math.floor((x - x0) / cell);
    const j = Math.floor((z - z0) / cell);
    if (i >= 0 && j >= 0 && i < w && j < h) cells[j * w + i] = 1;
  };
  for (const p of pieces) {
    // krawędzie: próbki co pół oczka
    for (let k = 0; k < p.length; k++) {
      const [ax, az] = p[k];
      const [bx, bz] = p[(k + 1) % p.length];
      const n = Math.max(1, Math.ceil((Math.hypot(bx - ax, bz - az) / cell) * 2));
      for (let s = 0; s <= n; s++) mark(ax + ((bx - ax) * s) / n, az + ((bz - az) * s) / n);
    }
    if (p.length < 3) continue;
    // wnętrze: środki oczek w prostokącie kawałka
    let px0 = Infinity;
    let px1 = -Infinity;
    let pz0 = Infinity;
    let pz1 = -Infinity;
    for (const [x, z] of p) {
      px0 = Math.min(px0, x);
      px1 = Math.max(px1, x);
      pz0 = Math.min(pz0, z);
      pz1 = Math.max(pz1, z);
    }
    const i0 = Math.max(0, Math.floor((px0 - x0) / cell));
    const i1 = Math.min(w - 1, Math.floor((px1 - x0) / cell));
    const j0 = Math.max(0, Math.floor((pz0 - z0) / cell));
    const j1 = Math.min(h - 1, Math.floor((pz1 - z0) / cell));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) if (!cells[j * w + i] && pip(x0 + (i + 0.5) * cell, z0 + (j + 0.5) * cell, p)) cells[j * w + i] = 1;
  }
  return { w, h, x0, z0, cell, cells };
}

/** Wypełnia dziury: puste oczka nieosiągalne z brzegu siatki (wnętrze skały to też przeszkoda). */
function fillHoles(g: Grid): void {
  const { w, h, cells } = g;
  const outside = new Uint8Array(w * h);
  const stack: number[] = [];
  const push = (k: number) => {
    if (!cells[k] && !outside[k]) {
      outside[k] = 1;
      stack.push(k);
    }
  };
  for (let i = 0; i < w; i++) push(i), push((h - 1) * w + i);
  for (let j = 0; j < h; j++) push(j * w), push(j * w + w - 1);
  while (stack.length) {
    const k = stack.pop()!;
    const i = k % w;
    const j = (k - i) / w;
    if (i > 0) push(k - 1);
    if (i < w - 1) push(k + 1);
    if (j > 0) push(k - w);
    if (j < h - 1) push(k + w);
  }
  for (let k = 0; k < cells.length; k++) if (!outside[k]) cells[k] = 1;
}

/**
 * Kontury zajętych oczek: pętle po narożnikach oczek (zajęte po lewej stronie). Oczka stykające się tylko
 * narożnikiem dają osobne pętle.
 */
function traceContours(g: Grid): Pt[][] {
  const { w, h, cells } = g;
  const filled = (i: number, j: number) => i >= 0 && j >= 0 && i < w && j < h && cells[j * w + i] === 1;
  const W = w + 1;
  // krawędzie wychodzące z narożnika: [narożnik końcowy, kierunek]
  const out = new Map<number, Array<{ to: number; dx: number; dz: number; used: boolean }>>();
  const add = (ai: number, aj: number, bi: number, bj: number) => {
    const a = aj * W + ai;
    if (!out.has(a)) out.set(a, []);
    out.get(a)!.push({ to: bj * W + bi, dx: bi - ai, dz: bj - aj, used: false });
  };
  for (let j = 0; j < h; j++)
    for (let i = 0; i < w; i++) {
      if (!filled(i, j)) continue;
      if (!filled(i, j - 1)) add(i, j, i + 1, j);
      if (!filled(i + 1, j)) add(i + 1, j, i + 1, j + 1);
      if (!filled(i, j + 1)) add(i + 1, j + 1, i, j + 1);
      if (!filled(i - 1, j)) add(i, j + 1, i, j);
    }
  const loops: Pt[][] = [];
  for (const [start, list] of out)
    for (const first of list) {
      if (first.used) continue;
      const loop: Pt[] = [];
      let at = start;
      let e = first;
      for (let guard = 0; guard < 4 * w * h + 8; guard++) {
        e.used = true;
        const prev = loop[loop.length - 1];
        const ci = at % W;
        const cj = (at - ci) / W;
        // tylko narożniki, w których zmienia się kierunek
        if (!prev || loop.length < 2 || !collinear(loop[loop.length - 2], prev, [ci, cj])) loop.push([ci, cj]);
        else loop[loop.length - 1] = [ci, cj];
        at = e.to;
        if (at === start) break;
        const cand = out.get(at)!.filter((c) => !c.used);
        if (!cand.length) break;
        // w narożniku z dwiema drogami skręcamy w lewo (oczka stykające się narożnikiem – osobne pętle)
        const turn = (c: { dx: number; dz: number }) => e.dx * c.dz - e.dz * c.dx;
        e = cand.length === 1 ? cand[0] : cand.reduce((a, b) => (turn(b) > turn(a) ? b : a));
      }
      if (loop.length >= 3 && collinear(loop[loop.length - 2], loop[loop.length - 1], loop[0])) loop.pop();
      if (loop.length >= 3) loops.push(loop.map(([i, j]) => [g.x0 + i * g.cell, g.z0 + j * g.cell]));
    }
  return loops;
}

function collinear(a: Pt, b: Pt, c: Pt): boolean {
  return Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) < 1e-9;
}

// ---------- upraszczanie ----------

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz || 1;
  const s = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dz) / l2));
  return Math.hypot(p[0] - (a[0] + s * dx), p[1] - (a[1] + s * dz));
}

function dpOpen(pts: Pt[], tol: number): Pt[] {
  if (pts.length <= 2) return pts.slice();
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let k = a + 1; k < b; k++) {
      const d = segDist(pts[k], pts[a], pts[b]);
      if (d > bestD) {
        bestD = d;
        best = k;
      }
    }
    if (best >= 0) {
      keep[best] = 1;
      stack.push([a, best], [best, b]);
    }
  }
  return pts.filter((_, k) => keep[k]);
}

/** Upraszcza zamknięty wielokąt (Douglas–Peucker od dwóch najdalszych od siebie punktów). */
export function simplifyClosed(poly: Pt[], tol: number): Pt[] {
  if (poly.length <= 3) return poly.map((p) => [...p] as Pt);
  let far = 0;
  let farD = -1;
  for (let k = 1; k < poly.length; k++) {
    const d = Math.hypot(poly[k][0] - poly[0][0], poly[k][1] - poly[0][1]);
    if (d > farD) {
      farD = d;
      far = k;
    }
  }
  const a = dpOpen(poly.slice(0, far + 1), tol);
  const b = dpOpen([...poly.slice(far), poly[0]], tol);
  const out = [...a, ...b.slice(1, -1)];
  return out.length >= 3 ? out.map((p) => [...p] as Pt) : poly.map((p) => [...p] as Pt);
}

/** Pole wielokąta ze znakiem (dodatnie – przeciwnie do ruchu wskazówek w układzie x w prawo, z w górę). */
export function polygonArea(poly: Pt[]): number {
  let s = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) s += (poly[j][0] - poly[i][0]) * (poly[j][1] + poly[i][1]);
  return s / 2;
}

/** Tolerancja upraszczania dla poziomu szczegółu (0 – mocno uproszczony, 1 – prawie każde oczko siatki). */
export function detailTolerance(cell: number, detail: number): number {
  const d = Math.min(1, Math.max(0, detail));
  return cell * (0.75 + 7 * Math.pow(1 - d, 1.5));
}

/**
 * Pogrubia zajęte oczka o `r` oczek (na przemian sąsiedztwo 4 i 8 – kształt zbliżony do koła). Dzięki temu
 * uproszczony obrys nie wcina się w model: upraszczanie zabiera najwyżej tyle, ile dodało pogrubienie.
 */
function dilate(g: Grid, r: number): void {
  const { w, h } = g;
  for (let it = 0; it < r; it++) {
    const src = g.cells.slice();
    const diag = it % 2 === 1;
    for (let j = 0; j < h; j++)
      for (let i = 0; i < w; i++) {
        if (src[j * w + i]) continue;
        let hit = false;
        for (let dj = -1; dj <= 1 && !hit; dj++)
          for (let di = -1; di <= 1 && !hit; di++) {
            if ((di === 0 && dj === 0) || (!diag && di !== 0 && dj !== 0)) continue;
            const x = i + di;
            const y = j + dj;
            hit = x >= 0 && y >= 0 && x < w && y < h && src[y * w + x] === 1;
          }
        if (hit) g.cells[j * w + i] = 1;
      }
  }
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4;

/**
 * Obrys kolizji z trójkątów modelu (płaska lista x, y, z w układzie pliku modelu): przekrój w paśmie
 * y0–y1, rzut na (x, z), wypełnienie dziur, kontury i uproszczenie według `detail`. Pusta lista – w paśmie
 * nie ma geometrii (np. sama korona nad głową postaci).
 */
export function computeOutline(tris: ArrayLike<number>, y0: number, y1: number, detail = DEFAULT_DETAIL): Outline {
  // pogrubienie o połowę tolerancji (w oczkach)
  const grow = Math.round(detailTolerance(1, detail) / 2);
  const g = rasterize(sliceBand(tris, y0, y1), grow);
  if (!g) return [];
  dilate(g, grow);
  fillHoles(g);
  const tolerance = detailTolerance(g.cell, detail);
  const out: Outline = [];
  for (const loop of traceContours(g)) {
    // drobinki mniejsze niż oczko-dwa to szum rasteryzacji
    if (Math.abs(polygonArea(loop)) < g.cell * g.cell * 2.5) continue;
    out.push(simplifyClosed(loop, tolerance).map(([x, z]) => [r4(x), r4(z)]));
  }
  return out;
}

/**
 * Pasmo przekroju w układzie modelu: od najniższego punktu geometrii do wysokości postaci
 * (`playerHeight` w jednostkach mapy podzielona przez skalę bazową modelu).
 */
export function collisionBand(tris: ArrayLike<number>, playerHeight: number, baseScale = 1): [number, number] | null {
  const [lo] = heightRange(tris);
  if (!Number.isFinite(lo)) return null;
  return [lo, lo + playerHeight / (baseScale > 0 ? baseScale : 1)];
}

/** Obrys z modelu w układzie mapy: położenie, obrót i skala obiektu oraz ułożenie i skala bazowa modelu. */
export function outlineToWorld(outline: Outline, m: ModelTransform, o: MapObject, y = 0): Outline {
  return outline.map((poly) =>
    poly.map(([x, z]) => {
      const p = modelToWorld([x, y, z], m, o);
      return [r4(p[0]), r4(p[2])] as Pt;
    }),
  );
}

/** Poprawne ustawienia obrysu z pliku (null, gdy nic sensownego). */
export function parseModelCollision(v: unknown): ModelCollision | null {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return null;
  const r = v as Record<string, unknown>;
  const out: ModelCollision = {};
  if (typeof r.detail === 'number' && Number.isFinite(r.detail)) out.detail = Math.min(1, Math.max(0, r.detail));
  if (Array.isArray(r.polygons)) {
    const polys = r.polygons
      .filter(Array.isArray)
      .map((p) => (p as unknown[]).filter((q): q is Pt => Array.isArray(q) && q.length === 2 && q.every((x) => typeof x === 'number' && Number.isFinite(x))).map((q) => [q[0], q[1]] as Pt))
      .filter((p) => p.length >= 3);
    if (polys.length) {
      out.polygons = polys;
      out.source = r.source === 'drawn' ? 'drawn' : 'edited';
    }
  }
  return out.detail !== undefined || out.polygons ? out : null;
}

export function cloneModelCollision(c: ModelCollision): ModelCollision {
  return { ...c, ...(c.polygons ? { polygons: c.polygons.map((p) => p.map((q) => [...q] as Pt)) } : {}) };
}

// ---------- ręczna poprawka obrysu (okno „Obrys kolizji”) ----------

export interface VertexRef {
  poly: number;
  idx: number;
}

/** Najbliższy wierzchołek obrysu w odległości ≤ maxD (null – brak). */
export function nearestVertex(o: Outline, p: Pt, maxD: number): VertexRef | null {
  let best: VertexRef | null = null;
  let bd = maxD;
  o.forEach((poly, pi) =>
    poly.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d <= bd) {
        bd = d;
        best = { poly: pi, idx: i };
      }
    }),
  );
  return best;
}

/** Najbliższa krawędź obrysu w odległości ≤ maxD: krawędź od wierzchołka `idx` do następnego. */
export function nearestEdge(o: Outline, p: Pt, maxD: number): VertexRef | null {
  let best: VertexRef | null = null;
  let bd = maxD;
  o.forEach((poly, pi) =>
    poly.forEach((a, i) => {
      const d = segDist(p, a, poly[(i + 1) % poly.length]);
      if (d <= bd) {
        bd = d;
        best = { poly: pi, idx: i };
      }
    }),
  );
  return best;
}

/** Nowy wierzchołek `pt` na krawędzi za wierzchołkiem `at.idx`. */
export function insertVertex(o: Outline, at: VertexRef, pt: Pt): Outline {
  return o.map((poly, pi) => (pi === at.poly ? [...poly.slice(0, at.idx + 1), [pt[0], pt[1]] as Pt, ...poly.slice(at.idx + 1)] : poly));
}

/** Usuwa wierzchołek; wielokąt z mniej niż trzema wierzchołkami znika. */
export function removeVertex(o: Outline, at: VertexRef): Outline {
  return o.map((poly, pi) => (pi === at.poly ? poly.filter((_, i) => i !== at.idx) : poly)).filter((p) => p.length >= 3);
}

/** Liczba części i wierzchołków obrysu (do opisu w oknie). */
export function outlineStats(o: Outline): { parts: number; vertices: number } {
  return { parts: o.length, vertices: o.reduce((s, p) => s + p.length, 0) };
}

// ---------- siatki kolizji w modelu i pamięć obrysów ----------

/**
 * Czy siatka (albo jej węzeł) jest siatką kolizji modelu, a nie wyglądem: nazwa z „collision”, „collider”,
 * „kolizja” albo przedrostki UCX_/UBX_/UCP_/USP_ (zwyczaj z Unreal Engine) i col_.
 */
export function isCollisionMeshName(name: string | undefined): boolean {
  return !!name && /collision|collider|kolizj|^u(cx|bx|cp|sp)_|^col_/i.test(name);
}

/** Pasmo w kluczu pamięci zaokrąglone do 1% (losowe mnożniki skali nie liczą obrysu dla każdej kopii osobno). */
function bandKey(band: number): number {
  return Math.exp(Math.round(Math.log(Math.max(band, 1e-6)) * 100) / 100);
}

/**
 * Obrysy kolizji modeli liczone raz i pamiętane. `tris` daje trójkąty kolizji modelu (siatki kolizji, a bez
 * nich – cały model) w układzie pliku modelu; null – model jeszcze niewczytany.
 */
export class OutlineCache {
  private cache = new Map<string, Outline>();
  constructor(private tris: (ref: string) => Float32Array | null) {}

  /** Zapomina obrysy modelu (po podmianie pliku); bez argumentu – wszystkie. */
  forget(match?: (ref: string) => boolean): void {
    for (const k of [...this.cache.keys()]) if (!match || match(k.split('|')[1])) this.cache.delete(k);
  }

  /** Model stojący (oś Y modelu pionowo): obrys w układzie modelu, pasmo `band` (jednostki modelu) nad podstawą. */
  upright(ref: string, detail: number, band: number): Outline | null {
    const b = bandKey(band);
    const key = `u|${ref}|${detail.toFixed(3)}|${b.toFixed(5)}`;
    const hit = this.cache.get(key);
    if (hit) return hit;
    const tris = this.tris(ref);
    if (!tris) return null;
    const range = collisionBand(tris, b);
    const o = range ? computeOutline(tris, range[0], range[1], detail) : [];
    this.cache.set(key, o);
    return o;
  }

  /**
   * Model obrócony dowolnie (np. pochylony): trójkąty przekształcone `f` (do układu mapy bez przesunięcia
   * obiektu, oś Y pionowo), przekrój w paśmie `height` nad najniższym punktem. Wynik w układzie mapy względem
   * punktu obiektu. `key` opisuje przekształcenie (ten sam klucz – ten sam obrys).
   */
  transformed(ref: string, detail: number, key: string, f: (p: Vec3) => Vec3, height: number): Outline | null {
    const k = `t|${ref}|${detail.toFixed(3)}|${height.toFixed(4)}|${key}`;
    const hit = this.cache.get(k);
    if (hit) return hit;
    const tris = this.tris(ref);
    if (!tris) return null;
    const out = new Float32Array(tris.length);
    for (let i = 0; i + 2 < tris.length; i += 3) {
      const p = f([tris[i], tris[i + 1], tris[i + 2]]);
      out[i] = p[0];
      out[i + 1] = p[1];
      out[i + 2] = p[2];
    }
    const range = collisionBand(out, height);
    const o = range ? computeOutline(out, range[0], range[1], detail) : [];
    this.cache.set(k, o);
    return o;
  }
}
