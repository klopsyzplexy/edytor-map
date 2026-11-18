// Kolizje dla gry: rysowane w edytorze (lasso – wielokąt, linia – łamana z grubością) i obiekty z flagą kolizji.
// Eksport: kształty wektorowe (`derived.collision`) i maska nieprzechodniości na siatce terenu (`derived.blocked`).
// Czyste funkcje, bez DOM i Three.js.
import { cellSize, modelBaseScale, modelKey, type MapData, type MapObject, type Vec3 } from './map';
import { computeLayerMask, computeSlopeMask } from './terrain';
import { localToWorld, rotateXYZ, round } from './math';
import { modelToObject, modelToWorld, objectFlags, objectModel, type Box3 } from './objectModel';
import { DEFAULT_DETAIL, outlineToWorld, type OutlineCache, type Outline, type Pt } from './modelCollision';
import { getType, type ObjectTypeDef, type Schema } from './schema';

/** Pudełko modelu w jego własnym układzie (null – model jeszcze niewczytany). */
export type ModelBoundsProvider = (ref: string) => Box3 | null;

/**
 * Obrysy kolizji modeli (pamięć w core/modelCollision.ts – `OutlineCache`): `upright` – model stojący, obrys
 * w układzie modelu; `transformed` – siatka 3D przekształcona jak obiekt (np. pochylony), obrys w układzie mapy.
 */
export type ModelOutlineProvider = Pick<OutlineCache, 'upright' | 'transformed'>;

/** Skąd jest kształt kolizji obiektu (pole `source` w `derived.collision`). */
export type CollisionSource = 'model' | 'edited' | 'drawn' | 'shape' | 'bounds';

export { BUILTIN_TYPES, COLLISION_LINE, COLLISION_ZONE, DECORATION } from './builtinTypes';

/** Kształt kolizji w układzie mapy (x, z). */
export type CollisionShape =
  | { objectId: string; type: string; shape: 'polygon'; points: Array<[number, number]>; source?: CollisionSource }
  | { objectId: string; type: string; shape: 'line'; points: Array<[number, number]>; width: number };

// ---------- geometria płaska ----------

export function distToSegment(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const s = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
  return Math.hypot(px - (ax + s * dx), pz - (az + s * dz));
}

export function pointInPolygon(x: number, z: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Upraszcza łamaną (Douglas–Peucker): usuwa punkty bliżej niż `tol` od linii sąsiadów. */
export function simplify(points: Vec3[], tol: number, closed = false): Vec3[] {
  if (points.length <= 3) return points.map((p) => [...p] as Vec3);
  const keep = new Uint8Array(points.length);
  keep[0] = keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    let best = -1;
    let bestD = tol;
    for (let k = a + 1; k < b; k++) {
      const d = distToSegment(points[k][0], points[k][2], points[a][0], points[a][2], points[b][0], points[b][2]);
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
  const out = points.filter((_, k) => keep[k]).map((p) => [...p] as Vec3);
  // w zamkniętym kształcie ostatni punkt pokrywający się z pierwszym jest zbędny
  if (closed && out.length > 3 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][2] - out[out.length - 1][2]) < tol) out.pop();
  return out;
}

/** Wygładzanie (Chaikin): każdy krok zamienia narożnik na dwa punkty w 1/4 i 3/4 boków. */
export function smoothPoints(points: Vec3[], closed: boolean, iterations = 1): Vec3[] {
  let pts = points.map((p) => [...p] as Vec3);
  for (let it = 0; it < iterations && pts.length >= 3; it++) {
    const out: Vec3[] = [];
    const n = pts.length;
    const segs = closed ? n : n - 1;
    if (!closed) out.push(pts[0]);
    for (let k = 0; k < segs; k++) {
      const a = pts[k];
      const b = pts[(k + 1) % n];
      const q: Vec3 = [a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25, a[2] * 0.75 + b[2] * 0.25];
      const r: Vec3 = [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75, a[2] * 0.25 + b[2] * 0.75];
      if (closed || k > 0) out.push(q);
      if (closed || k < segs - 1) out.push(r);
    }
    if (!closed) out.push(pts[n - 1]);
    pts = out;
  }
  return pts;
}

/** Otoczka wypukła punktów (x, z) – obrys bryły widziany z góry. */
export function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const cross = (o: [number, number], a: [number, number], b: [number, number]) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower: Array<[number, number]> = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Array<[number, number]> = [];
  for (const q of p.reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

const SEG = 16;

/**
 * Obrys bryły z flagą kolizji widziany z góry (po obrocie i skali). Dla modelu – pudełko modelu
 * (gdy `bounds` je zna), a bez niego pudełko `defaultSize`.
 */
export function solidFootprint(t: ObjectTypeDef, o: MapObject, bounds?: ModelBoundsProvider, schema?: Schema, map?: Pick<MapData, 'models'>): Array<[number, number]> {
  const model = schema ? objectModel(schema, o, t, map) : t.look.model ? { ref: t.look.model, transform: t.look.modelTransform } : null;
  const box = model && bounds ? bounds(model.ref) : null;
  if (model && box) {
    const pts: Array<[number, number]> = [];
    for (const x of [box.min[0], box.max[0]]) for (const y of [box.min[1], box.max[1]]) for (const z of [box.min[2], box.max[2]]) {
      const w = modelToWorld([x, y, z], model.transform, o);
      pts.push([round(w[0]), round(w[2])]);
    }
    return convexHull(pts);
  }
  const [w, h, d] = t.defaultSize;
  const local: Vec3[] = [];
  if (t.look.shape === 'box' || model) {
    for (const y of [0, h]) for (const x of [-w / 2, w / 2]) for (const z of [-d / 2, d / 2]) local.push([x, y, z]);
  } else {
    for (let k = 0; k < SEG; k++) {
      const a = (k / SEG) * Math.PI * 2;
      for (const y of [0, h / 2, h]) local.push([(Math.cos(a) * w) / 2, y, (Math.sin(a) * d) / 2]);
    }
  }
  return convexHull(local.map((p) => localToWorld(p, o.position, o.rotation, o.scale)).map((p) => [round(p[0]), round(p[2])]));
}

/**
 * Obrys kolizji modelu w mapie (układ modelu): poprawiony ręcznie lub narysowany (`models[ref].collision.polygons`)
 * albo wyliczony z geometrii z poziomem szczegółu z mapy, w paśmie do wysokości postaci (z uwzględnieniem skali bazowej).
 */
export function modelOutline(
  map: Pick<MapData, 'models'>,
  ref: string,
  playerHeight: number,
  outline?: ModelOutlineProvider,
): { outline: Outline; source: CollisionSource } | null {
  const k = modelKey(map, ref);
  const c = k ? map.models[k].collision : undefined;
  if (c?.polygons?.length) return { outline: c.polygons, source: c.source ?? 'edited' };
  const auto = outline?.upright(ref, c?.detail ?? DEFAULT_DETAIL, playerHeight / modelBaseScale(map, ref));
  return auto ? { outline: auto, source: 'model' } : null;
}

/**
 * Obrysy kolizji obiektu na ziemi (x, z). Dla modelu – z jego siatki 3D przekształconej jak obiekt (ułożenie
 * z typu, skala bazowa, mnożnik, obrót) i przeciętej na wysokości postaci; kilka wielokątów, gdy model ma kilka
 * części. Model stojący (obrót tylko wokół pionu) korzysta z obrysu liczonego raz w układzie modelu. Gdy obrysu
 * nie ma (model niewczytany) – pudełko modelu; dla prostej bryły – jej kształt.
 */
export function objectFootprints(
  schema: Schema,
  t: ObjectTypeDef,
  o: MapObject,
  map: MapData,
  bounds?: ModelBoundsProvider,
  outline?: ModelOutlineProvider,
): { polygons: Pt[][]; source: CollisionSource } {
  const model = objectModel(schema, o, t, map);
  if (!model) return { polygons: [solidFootprint(t, o, bounds, schema, map)], source: 'shape' };
  const k = modelKey(map, model.ref);
  const c = k ? map.models[k].collision : undefined;
  const h = schema.player.height;
  // część liniowa przekształcenia punktu modelu do mapy (bez położenia obiektu)
  const lin = (p: Vec3): Vec3 => rotateXYZ([p[0] * o.scale[0], p[1] * o.scale[1], p[2] * o.scale[2]], o.rotation);
  const f = (p: Vec3): Vec3 => lin(modelToObject(p, model.transform));
  const f0 = f([0, 0, 0]);
  const axis = (p: Vec3): Vec3 => {
    const q = f(p);
    return [q[0] - f0[0], q[1] - f0[1], q[2] - f0[2]];
  };
  const [ex, ey, ez] = [axis([1, 0, 0]), axis([0, 1, 0]), axis([0, 0, 1])];
  const eps = 1e-6 * Math.max(1, Math.hypot(...ey));
  // stojący: pion modelu zostaje pionem, a płaszczyzna (x, z) – płaszczyzną terenu
  const upright = Math.abs(ex[1]) < eps && Math.abs(ez[1]) < eps && Math.abs(ey[0]) < eps && Math.abs(ey[2]) < eps && ey[1] > 0;
  if (c?.polygons?.length || upright) {
    const m = c?.polygons?.length
      ? { outline: c.polygons, source: c.source ?? ('edited' as CollisionSource) }
      : (() => {
          const auto = outline?.upright(model.ref, c?.detail ?? DEFAULT_DETAIL, h / ey[1]);
          return auto ? { outline: auto, source: 'model' as CollisionSource } : null;
        })();
    if (m) return { polygons: outlineToWorld(m.outline, model.transform, o).filter((p) => p.length >= 3), source: m.source };
  } else if (outline) {
    const key = [...ex, ...ey, ...ez, ...f0].map((v) => v.toFixed(4)).join(',');
    const local = outline.transformed(model.ref, c?.detail ?? DEFAULT_DETAIL, key, f, h);
    if (local)
      return {
        polygons: local.map((p) => p.map(([x, z]) => [round(x + o.position[0]), round(z + o.position[2])] as Pt)).filter((p) => p.length >= 3),
        source: 'model',
      };
  }
  return { polygons: [solidFootprint(t, o, bounds, schema, map)], source: 'bounds' };
}

/** Wszystkie kształty kolizji mapy: rysowane w edytorze i bryły/punkty z `flags.collision` (także dekoracje z kolizją). */
export function collectCollision(schema: Schema, map: MapData, bounds?: ModelBoundsProvider, outline?: ModelOutlineProvider): CollisionShape[] {
  const out: CollisionShape[] = [];
  for (const o of map.objects) {
    const t = getType(schema, o.type);
    if (!t || !objectFlags(t, o).collision) continue;
    const xz = o.points.map((p) => [round(p[0]), round(p[2])] as [number, number]);
    if (t.kind === 'zone') {
      if (xz.length >= 3) out.push({ objectId: o.id, type: o.type, shape: 'polygon', points: xz });
    } else if (t.kind === 'path') {
      const width = typeof o.props.width === 'number' && o.props.width > 0 ? o.props.width : 1;
      if (xz.length >= 2) out.push({ objectId: o.id, type: o.type, shape: 'line', points: xz, width });
    } else {
      const fp = objectFootprints(schema, t, o, map, bounds, outline);
      for (const points of fp.polygons) out.push({ objectId: o.id, type: o.type, shape: 'polygon', points, source: fp.source });
    }
  }
  return out;
}

/** Zaznacza w masce (255) punkty siatki terenu, które leżą w kształtach kolizji. */
export function rasterizeCollision(map: MapData, shapes: CollisionShape[], mask: Uint8Array = new Uint8Array(map.terrain.nx * map.terrain.nz)): Uint8Array {
  const { nx, nz } = map.terrain;
  const [sx, sz] = cellSize(map);
  for (const s of shapes) {
    const pad = s.shape === 'line' ? s.width / 2 : 0;
    let x0 = Infinity;
    let x1 = -Infinity;
    let z0 = Infinity;
    let z1 = -Infinity;
    for (const [x, z] of s.points) {
      x0 = Math.min(x0, x - pad);
      x1 = Math.max(x1, x + pad);
      z0 = Math.min(z0, z - pad);
      z1 = Math.max(z1, z + pad);
    }
    const i0 = Math.max(0, Math.ceil(x0 / sx));
    const i1 = Math.min(nx - 1, Math.floor(x1 / sx));
    const j0 = Math.max(0, Math.ceil(z0 / sz));
    const j1 = Math.min(nz - 1, Math.floor(z1 / sz));
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const x = i * sx;
        const z = j * sz;
        let hit = false;
        if (s.shape === 'polygon') hit = pointInPolygon(x, z, s.points);
        else
          for (let k = 0; k + 1 < s.points.length && !hit; k++) {
            const [ax, az] = s.points[k];
            const [bx, bz] = s.points[k + 1];
            hit = distToSegment(x, z, ax, az, bx, bz) <= pad;
          }
        if (hit) mask[j * nx + i] = 255;
      }
  }
  return mask;
}

/**
 * Pełna maska nieprzechodniości (`derived.blocked`): strome zbocza (gdy włączone w mapie), warstwy
 * nieprzechodnie (`passable: false`) i wszystkie kształty kolizji. Zwraca undefined, gdy nic nie blokuje.
 */
export function computeBlockedMask(schema: Schema, map: MapData, shapes: CollisionShape[]): Uint8Array | undefined {
  const layerIds = schema.terrainLayers.filter((l) => !l.passable).map((l) => l.id);
  if (!map.settings.slope.enabled && !layerIds.length && !shapes.length) return undefined;
  let mask = map.settings.slope.enabled ? computeSlopeMask(map) : new Uint8Array(map.terrain.nx * map.terrain.nz);
  mask = computeLayerMask(map, layerIds, mask);
  return rasterizeCollision(map, shapes, mask);
}

/** Maska terenu dla podglądu kolizji: strome zbocza (gdy włączone w mapie) i warstwy nieprzechodnie. */
export function terrainMask(schema: Schema, map: MapData): Uint8Array {
  const mask = map.settings.slope.enabled ? computeSlopeMask(map) : new Uint8Array(map.terrain.nx * map.terrain.nz);
  return computeLayerMask(map, schema.terrainLayers.filter((l) => !l.passable).map((l) => l.id), mask);
}
