// Tryb „zagraj tę mapę”: ruch postaci po terenie i powierzchniach chodliwych z kolizjami.
// Czyste funkcje, bez DOM i Three.js (testy w tests/play.test.ts). Postać to koło o promieniu `radius`
// na ziemi i wysokości `height`. Edytor nie zna logiki gry: to tylko podgląd tego, co gra dostaje
// w danych pochodnych mapy (kolizje, maska, powierzchnie chodliwe).
import { pointInPolygon, type CollisionShape } from './collision';
import { cellSize, heightAt, type MapData, type Vec3 } from './map';
import type { PlayerDef, Schema } from './schema';
import { computeLayerMask, computeSlopeMask } from './terrain';
import type { WalkableSurface } from './walkable';

/** Rozmiar oczka siatki przestrzennej (jednostki mapy). */
const BUCKET = 4;
/** Przyspieszenie spadania (jednostki/s²), gdy postać schodzi z wysokości większej niż stopień. */
const GRAVITY = 30;
/** Powierzchnia wyżej niż teren o tyle uchodzi za „stoję na moście” (maska terenu wtedy nie działa). */
const ON_SURFACE_EPS = 0.05;

interface Segment {
  ax: number;
  az: number;
  bx: number;
  bz: number;
  /** Połowa grubości (linie kolizji); 0 dla krawędzi wielokątów. */
  half: number;
  /** Wielokąt, do którego należy krawędź (-1 dla linii). */
  poly: number;
  /** Rodzaj kształtu – do opisu w panelu (np. „@collision-zone”, „sciana”). */
  type: string;
}

interface Tri {
  /** x, y, z × 3 */
  v: Float64Array;
}

/** Siatka przestrzenna: elementy przypisane do oczek, które zajmuje ich prostokąt. */
class Buckets<T> {
  private cells = new Map<number, T[]>();
  add(item: T, x0: number, z0: number, x1: number, z1: number): void {
    for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
      for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++) {
        const k = i * 100003 + j;
        let c = this.cells.get(k);
        if (!c) this.cells.set(k, (c = []));
        c.push(item);
      }
  }
  /** Elementy z oczek, które dotyka prostokąt (bez powtórzeń). */
  query(x0: number, z0: number, x1: number, z1: number): T[] {
    const out = new Set<T>();
    for (let j = Math.floor(z0 / BUCKET); j <= Math.floor(z1 / BUCKET); j++)
      for (let i = Math.floor(x0 / BUCKET); i <= Math.floor(x1 / BUCKET); i++) for (const it of this.cells.get(i * 100003 + j) ?? []) out.add(it);
    return [...out];
  }
}

export interface PlayWorld {
  map: MapData;
  player: PlayerDef;
  /** Maska terenu: strome zbocza (gdy włączone w mapie) i warstwy nieprzechodnie. 255 = nie przejdzie. */
  terrainMask: Uint8Array;
  polygons: Array<Array<[number, number]>>;
  segments: Buckets<Segment>;
  tris: Buckets<Tri>;
}

export interface PlayInput {
  collision: CollisionShape[];
  walkable: WalkableSurface[];
}

/** Przygotowuje świat do trybu gry: kolizje, maskę terenu i powierzchnie chodliwe w siatce przestrzennej. */
export function buildPlayWorld(schema: Schema, map: MapData, input: PlayInput): PlayWorld {
  let mask = map.settings.slope.enabled ? computeSlopeMask(map) : new Uint8Array(map.terrain.nx * map.terrain.nz);
  mask = computeLayerMask(map, schema.terrainLayers.filter((l) => !l.passable).map((l) => l.id), mask);
  const segments = new Buckets<Segment>();
  const polygons: PlayWorld['polygons'] = [];
  const addSeg = (s: Segment) => segments.add(s, Math.min(s.ax, s.bx) - s.half, Math.min(s.az, s.bz) - s.half, Math.max(s.ax, s.bx) + s.half, Math.max(s.az, s.bz) + s.half);
  for (const c of input.collision) {
    const pts = c.points;
    if (c.shape === 'polygon') {
      if (pts.length < 3) continue;
      const poly = polygons.length;
      polygons.push(pts);
      for (let k = 0; k < pts.length; k++) {
        const [ax, az] = pts[k];
        const [bx, bz] = pts[(k + 1) % pts.length];
        addSeg({ ax, az, bx, bz, half: 0, poly, type: c.type });
      }
    } else
      for (let k = 0; k + 1 < pts.length; k++) addSeg({ ax: pts[k][0], az: pts[k][1], bx: pts[k + 1][0], bz: pts[k + 1][1], half: c.width / 2, poly: -1, type: c.type });
  }
  const tris = new Buckets<Tri>();
  for (const w of input.walkable)
    for (let k = 0; k + 8 < w.triangles.length; k += 9) {
      const v = Float64Array.from(w.triangles.slice(k, k + 9));
      // pionowe trójkąty nie mają wysokości „pod” postacią
      const area = (v[3] - v[0]) * (v[8] - v[2]) - (v[6] - v[0]) * (v[5] - v[2]);
      if (Math.abs(area) < 1e-9) continue;
      tris.add({ v }, Math.min(v[0], v[3], v[6]), Math.min(v[2], v[5], v[8]), Math.max(v[0], v[3], v[6]), Math.max(v[2], v[5], v[8]));
    }
  return { map, player: schema.player, terrainMask: mask, polygons, segments, tris };
}

/** Wysokość trójkąta w punkcie (x, z) albo null, gdy punkt leży poza nim (rzut na ziemię). */
function triHeight(t: Tri, x: number, z: number): number | null {
  const v = t.v;
  const d = (v[5] - v[8]) * (v[0] - v[6]) + (v[6] - v[3]) * (v[2] - v[8]);
  const a = ((v[5] - v[8]) * (x - v[6]) + (v[6] - v[3]) * (z - v[8])) / d;
  const b = ((v[8] - v[2]) * (x - v[6]) + (v[0] - v[6]) * (z - v[8])) / d;
  const c = 1 - a - b;
  const e = -1e-6;
  if (a < e || b < e || c < e) return null;
  return a * v[1] + b * v[4] + c * v[7];
}

export interface Ground {
  /** Wysokość podłoża pod postacią. */
  y: number;
  /** Podłoże to powierzchnia chodliwa (most), a nie teren. */
  onSurface: boolean;
  /** Powierzchnia między stopniem a głową – przeszkoda (np. krawędź wysokiego pomostu). */
  obstacle: boolean;
}

/**
 * Podłoże w punkcie dla postaci, której stopy są na wysokości `feet`: najwyższe z terenu i powierzchni
 * chodliwych, na które da się wejść (nie wyżej niż stopień). Powierzchnie nad głową są pomijane
 * (przejście pod mostem), a te między stopniem a głową blokują.
 */
export function groundAt(w: PlayWorld, x: number, z: number, feet: number): Ground {
  const terrain = heightAt(w.map, x, z);
  let y = terrain;
  let onSurface = false;
  let obstacle = false;
  const reach = feet + w.player.stepHeight;
  for (const t of w.tris.query(x, z, x, z)) {
    const hy = triHeight(t, x, z);
    if (hy === null) continue;
    if (hy <= reach + 1e-6) {
      if (hy > y) {
        y = hy;
        onSurface = hy > terrain + ON_SURFACE_EPS;
      }
    } else if (hy < feet + w.player.height) obstacle = true;
  }
  return { y, onSurface, obstacle };
}

/** Czy koło postaci w (x, z) zahacza o zablokowane oczko maski terenu (oczko = kwadrat wokół punktu siatki). */
export function maskBlocked(w: PlayWorld, x: number, z: number, r: number): boolean {
  const { nx, nz } = w.map.terrain;
  const [sx, sz] = cellSize(w.map);
  const i0 = Math.max(0, Math.round((x - r) / sx));
  const i1 = Math.min(nx - 1, Math.round((x + r) / sx));
  const j0 = Math.max(0, Math.round((z - r) / sz));
  const j1 = Math.min(nz - 1, Math.round((z + r) / sz));
  for (let j = j0; j <= j1; j++)
    for (let i = i0; i <= i1; i++) {
      if (!w.terrainMask[j * nx + i]) continue;
      // najbliższy punkt kwadratu oczka
      const cx = Math.max(i * sx - sx / 2, Math.min(x, i * sx + sx / 2));
      const cz = Math.max(j * sz - sz / 2, Math.min(z, j * sz + sz / 2));
      if (Math.hypot(x - cx, z - cz) < r - 1e-6) return true;
    }
  return false;
}

/** Wielokąty kolizji, w których leży punkt (postać w środku może z nich wyjść). */
function polygonsAt(w: PlayWorld, x: number, z: number): Set<number> {
  const out = new Set<number>();
  for (const s of w.segments.query(x, z, x, z)) if (s.poly >= 0 && !out.has(s.poly) && pointInPolygon(x, z, w.polygons[s.poly])) out.add(s.poly);
  // wielokąt większy niż oczko siatki może nie mieć krawędzi w pobliżu
  if (!out.size) w.polygons.forEach((p, k) => pointInPolygon(x, z, p) && out.add(k));
  return out;
}

/** Wypycha koło z kształtów kolizji (kilka przebiegów); dzięki temu postać ślizga się wzdłuż ścian. */
function pushOut(w: PlayWorld, x: number, z: number, r: number, ignore: Set<number>): [number, number, string | null] {
  let hitType: string | null = null;
  for (let it = 0; it < 4; it++) {
    let moved = false;
    for (const s of w.segments.query(x - r, z - r, x + r, z + r)) {
      if (s.poly >= 0 && ignore.has(s.poly)) continue;
      const min = r + s.half;
      const dx = s.bx - s.ax;
      const dz = s.bz - s.az;
      const l2 = dx * dx + dz * dz || 1;
      const t = Math.max(0, Math.min(1, ((x - s.ax) * dx + (z - s.az) * dz) / l2));
      const px = s.ax + t * dx;
      const pz = s.az + t * dz;
      let nx = x - px;
      let nz = z - pz;
      const d = Math.hypot(nx, nz);
      if (d >= min - 1e-9) continue;
      if (d < 1e-9) {
        // środek dokładnie na odcinku – wypchnij prostopadle
        nx = -dz;
        nz = dx;
      }
      const len = Math.hypot(nx, nz) || 1;
      x = px + (nx / len) * min;
      z = pz + (nz / len) * min;
      hitType = s.type;
      moved = true;
    }
    if (!moved) break;
  }
  // nie wolno skończyć w środku wielokąta (np. po wypchnięciu przez sąsiednią krawędź)
  for (const s of w.segments.query(x, z, x, z)) if (s.poly >= 0 && !ignore.has(s.poly) && pointInPolygon(x, z, w.polygons[s.poly])) return [NaN, NaN, s.type];
  return [x, z, hitType];
}

export interface PlayerState {
  /** Stopy postaci (x, y, z). */
  pos: Vec3;
  /** Prędkość pionowa (spadanie). */
  vy: number;
  /** Kierunek patrzenia: kąt wokół osi Y w radianach (0 = +Z). */
  heading: number;
}

export interface StepResult {
  /** Postać przesunęła się w tej klatce. */
  moved: boolean;
  /** Ruch został ograniczony przez przeszkodę (ślizg albo zatrzymanie). */
  blocked: boolean;
  /** Co zablokowało: typ kształtu kolizji, „slope/layer” (maska terenu), „step” (za wysoki stopień), „edge” (brzeg mapy). */
  blockedBy: string | null;
  ground: Ground;
}

/** Postać stojąca w punkcie: stopy na podłożu (terenie albo moście pod `feetHint` + stopień). */
export function spawnAt(w: PlayWorld, x: number, z: number, feetHint = Infinity): PlayerState {
  const [W, D] = w.map.settings.size;
  const r = w.player.radius;
  x = Math.min(Math.max(x, r), W - r);
  z = Math.min(Math.max(z, r), D - r);
  const g = groundAt(w, x, z, Number.isFinite(feetHint) ? feetHint : heightAt(w.map, x, z) + 1e6);
  return { pos: [x, g.y, z], vy: 0, heading: 0 };
}

/**
 * Jeden krok ruchu: `dir` to kierunek na ziemi (x, z) o długości 0–1 (1 = pełna szybkość).
 * Ruch dzielimy na kroki pośrednie krótsze niż pół promienia, żeby nie przeskoczyć cienkiej ściany.
 * Pod górę szybkość się nie zmienia (liczymy ją po ziemi).
 */
export function stepPlayer(w: PlayWorld, s: PlayerState, dir: [number, number], dt: number): StepResult {
  const p = w.player;
  const r = p.radius;
  const [W, D] = w.map.settings.size;
  const len = Math.min(1, Math.hypot(dir[0], dir[1]));
  let [x, y, z] = s.pos;
  let blocked = false;
  let blockedBy: string | null = null;
  const start: [number, number] = [x, z];
  if (len > 1e-6) {
    s.heading = Math.atan2(dir[0], dir[1]);
    const dist = p.speed * len * dt;
    const n = Math.max(1, Math.ceil(dist / (r * 0.5)));
    const ux = (dir[0] / Math.hypot(dir[0], dir[1])) * (dist / n);
    const uz = (dir[1] / Math.hypot(dir[0], dir[1])) * (dist / n);
    for (let k = 0; k < n; k++) {
      const inside = polygonsAt(w, x, z);
      const startMasked = maskBlocked(w, x, z, r) && !groundAt(w, x, z, y).onSurface;
      /** Sprawdza ruch o (mx, mz); zwraca nowe położenie albo null. */
      const tryMove = (mx: number, mz: number): [number, number, string | null] | null => {
        let cx = Math.min(Math.max(x + mx, r), W - r);
        let cz = Math.min(Math.max(z + mz, r), D - r);
        let why: string | null = cx !== x + mx || cz !== z + mz ? 'edge' : null;
        const [px, pz, hit] = pushOut(w, cx, cz, r, inside);
        if (Number.isNaN(px)) return null;
        if (hit) why = hit;
        cx = px;
        cz = pz;
        const g = groundAt(w, cx, cz, y);
        if (g.obstacle || g.y > y + p.stepHeight + 1e-6) return ((blockedBy = 'step'), null);
        // maska terenu nie działa na moście; gdy postać już stoi w zablokowanym miejscu – może z niego wyjść
        if (!startMasked && !g.onSurface && maskBlocked(w, cx, cz, r)) return ((blockedBy = 'slope/layer'), null);
        return [cx, cz, why];
      };
      let res = tryMove(ux, uz);
      if (!res || res[2]) blocked = true;
      // ślizg wzdłuż przeszkody z maski lub stopnia: spróbuj samych składowych ruchu
      if (!res) {
        const a = Math.abs(ux) > 1e-9 ? tryMove(ux, 0) : null;
        const b = Math.abs(uz) > 1e-9 ? tryMove(0, uz) : null;
        res = a && b ? (Math.abs(ux) >= Math.abs(uz) ? a : b) : (a ?? b);
      }
      if (!res) break;
      if (res[2]) blockedBy = res[2];
      x = res[0];
      z = res[1];
      y = settle(w, x, z, y, s, dt / n);
    }
  } else y = settle(w, x, z, y, s, dt);
  s.pos = [x, y, z];
  const moved = Math.hypot(x - start[0], z - start[1]) > 1e-6;
  return { moved, blocked, blockedBy: blocked ? blockedBy : null, ground: groundAt(w, x, z, y) };
}

/** Wysokość stóp po kroku: wejście na stopień od razu, zejście o stopień od razu, wyżej – spadanie. */
function settle(w: PlayWorld, x: number, z: number, y: number, s: PlayerState, dt: number): number {
  const g = groundAt(w, x, z, y).y;
  if (g >= y - w.player.stepHeight) {
    s.vy = 0;
    return g;
  }
  s.vy -= GRAVITY * dt;
  const ny = y + s.vy * dt;
  if (ny <= g) {
    s.vy = 0;
    return g;
  }
  return ny;
}

/** Nachylenie terenu w punkcie, w stopniach (z różnic wysokości na odległość pół oczka). */
export function slopeDegAt(map: MapData, x: number, z: number): number {
  const [sx, sz] = cellSize(map);
  const e = Math.min(sx, sz) / 2;
  const dx = (heightAt(map, x + e, z) - heightAt(map, x - e, z)) / (2 * e);
  const dz = (heightAt(map, x, z + e) - heightAt(map, x, z - e)) / (2 * e);
  return (Math.atan(Math.hypot(dx, dz)) * 180) / Math.PI;
}

/** Punkt startu: pierwszy obiekt typu `player.startType` (null, gdy typ nieustawiony albo brak obiektu). */
export function findStart(schema: Schema, map: MapData): Vec3 | null {
  const t = schema.player.startType;
  if (!t) return null;
  const o = map.objects.find((x) => x.type === t);
  return o ? [...o.position] : null;
}

/**
 * Wybór animacji postaci: nazwy ze schematu, a bez nich – po typowych nazwach.
 * Gdy model ma tylko jedną animację, służy do chodzenia.
 */
export function pickAnimations(names: string[], wanted: { idle?: string; walk?: string }): { idle: string | null; walk: string | null } {
  const find = (want: string | undefined, re: RegExp) =>
    (want && names.find((n) => n === want)) ?? (want && names.find((n) => n.toLowerCase() === want.toLowerCase())) ?? names.find((n) => re.test(n)) ?? null;
  const walk = find(wanted.walk, /walk|run|idzie|chod|krok|move|jog/i) ?? (names.length === 1 ? names[0] : null);
  const idle = find(wanted.idle, /idle|stand|stoi|spocz|rest|breath|wait/i);
  return { idle: idle === walk ? null : idle, walk };
}
