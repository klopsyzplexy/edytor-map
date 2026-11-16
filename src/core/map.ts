// Model mapy w pamięci. Czyste dane, bez DOM i Three.js.
//
// Układ współrzędnych (jak w Three.js i w Gainerze): ziemia to płaszczyzna X–Z, wysokość to oś Y.
// Mapa zajmuje prostokąt x ∈ [0, width], z ∈ [0, depth]. Współrzędna gry (x, y) = edytor (x, z).
// Teren to siatka nx × nz wierzchołków; wierzchołek (i, j) leży w (i·width/(nx−1), j·depth/(nz−1)),
// a jego indeks w tablicach to j·nx + i.

import { defaultProps, getType, type PropValue, type Schema } from './schema';

export type Vec3 = [number, number, number];

export interface MapGroup {
  id: string;
  name: string;
  /** Grupa nadrzędna (podgrupy) albo null. */
  parent: string | null;
  hidden: boolean;
  locked: boolean;
}

export interface MapObject {
  id: string;
  type: string;
  name: string;
  group: string | null;
  hidden: boolean;
  locked: boolean;
  /** Punkt i bryła: położenie podstawy obiektu. */
  position: Vec3;
  /** Obrót w stopniach (kąty Eulera, kolejność XYZ). */
  rotation: Vec3;
  /** Skala względem `defaultSize` typu. */
  scale: Vec3;
  /** Ścieżka i strefa: wierzchołki w układzie mapy (strefa jest zamknięta). */
  points: Vec3[];
  props: Record<string, PropValue>;
}

export interface MapSettings {
  name: string;
  size: [number, number];
  resolution: [number, number];
  waterLevel: number;
  slope: { enabled: boolean; maxDeg: number };
}

export interface Terrain {
  nx: number;
  nz: number;
  heights: Float32Array;
  /** Waga każdej warstwy w wierzchołku, 0–255. Klucz = id warstwy ze schematu. */
  layers: Record<string, Uint8Array>;
}

export interface MapData {
  schema: { id: string; version: string };
  settings: MapSettings;
  terrain: Terrain;
  groups: MapGroup[];
  objects: MapObject[];
}

export interface NewMapOptions {
  name: string;
  size: [number, number];
  /** Liczba wierzchołków wzdłuż dłuższego boku. */
  resolution: number;
  height: number;
}

export function createMap(schema: Schema, o: NewMapOptions): MapData {
  const [w, d] = o.size;
  const long = Math.max(w, d);
  const nx = Math.max(2, Math.round(((o.resolution - 1) * w) / long) + 1);
  const nz = Math.max(2, Math.round(((o.resolution - 1) * d) / long) + 1);
  const heights = new Float32Array(nx * nz).fill(o.height);
  const layers: Record<string, Uint8Array> = {};
  schema.terrainLayers.forEach((l, i) => (layers[l.id] = new Uint8Array(nx * nz).fill(i === 0 ? 255 : 0)));
  return {
    schema: { id: schema.id, version: schema.version },
    settings: {
      name: o.name,
      size: [w, d],
      resolution: [nx, nz],
      waterLevel: schema.mapDefaults.waterLevel,
      slope: { enabled: false, maxDeg: schema.mapDefaults.slopeMaxDeg },
    },
    terrain: { nx, nz, heights, layers },
    groups: [],
    objects: [],
  };
}

/** Uzupełnia warstwy brakujące w mapie (np. po dodaniu warstwy do schematu). */
export function syncLayersWithSchema(map: MapData, schema: Schema): void {
  const n = map.terrain.nx * map.terrain.nz;
  schema.terrainLayers.forEach((l, i) => {
    if (!map.terrain.layers[l.id]) map.terrain.layers[l.id] = new Uint8Array(n).fill(i === 0 && Object.keys(map.terrain.layers).length === 0 ? 255 : 0);
  });
}

export function cellSize(map: MapData): [number, number] {
  const { size } = map.settings;
  return [size[0] / (map.terrain.nx - 1), size[1] / (map.terrain.nz - 1)];
}

/** Wysokość terenu w dowolnym punkcie (interpolacja dwuliniowa, poza mapą – brzeg). */
export function heightAt(map: MapData, x: number, z: number): number {
  const { nx, nz, heights } = map.terrain;
  const [cx, cz] = cellSize(map);
  const fx = Math.min(Math.max(x / cx, 0), nx - 1);
  const fz = Math.min(Math.max(z / cz, 0), nz - 1);
  const i = Math.min(Math.floor(fx), nx - 2);
  const j = Math.min(Math.floor(fz), nz - 2);
  const tx = fx - i;
  const tz = fz - j;
  const h00 = heights[j * nx + i];
  const h10 = heights[j * nx + i + 1];
  const h01 = heights[(j + 1) * nx + i];
  const h11 = heights[(j + 1) * nx + i + 1];
  return (h00 * (1 - tx) + h10 * tx) * (1 - tz) + (h01 * (1 - tx) + h11 * tx) * tz;
}

export function insideMap(map: MapData, x: number, z: number): boolean {
  return x >= 0 && z >= 0 && x <= map.settings.size[0] && z <= map.settings.size[1];
}

let idCounter = 0;
export function newId(prefix = 'o'): string {
  idCounter = (idCounter + 1) % 1e6;
  return `${prefix}${Date.now().toString(36)}${idCounter.toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
}

export function createObject(schema: Schema, map: MapData, typeId: string, at: Vec3, points?: Vec3[]): MapObject {
  const t = getType(schema, typeId);
  if (!t) throw new Error(`Nieznany typ obiektu: ${typeId}`);
  const sameType = map.objects.filter((o) => o.type === typeId).length;
  return {
    id: newId(),
    type: typeId,
    name: `${typeId.replace(/^@/, '')}-${sameType + 1}`,
    group: null,
    hidden: false,
    locked: false,
    position: [...at],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    points: points ? points.map((p) => [...p] as Vec3) : [],
    props: defaultProps(t),
  };
}

export function cloneObject(o: MapObject): MapObject {
  return {
    ...o,
    position: [...o.position],
    rotation: [...o.rotation],
    scale: [...o.scale],
    points: o.points.map((p) => [...p] as Vec3),
    props: { ...o.props },
  };
}

/** Środek obiektu (dla ścieżek i stref – średnia wierzchołków). */
export function objectCenter(o: MapObject): Vec3 {
  if (o.points.length === 0) return [...o.position];
  const c: Vec3 = [0, 0, 0];
  for (const p of o.points) for (let k = 0; k < 3; k++) c[k] += p[k] / o.points.length;
  return c;
}
