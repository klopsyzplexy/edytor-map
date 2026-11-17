// Zmiana rozmiaru mapy (Mapa → Zmień rozmiar…). Czyste funkcje, bez DOM i Three.js.
//
// - „rozszerz” (expand): stary teren zostaje bez zmian w miejscu wyznaczonym przez kotwicę, dookoła powstaje
//   płaski teren z wybraną warstwą; obiekty zostają na miejscu względem kotwicy (przesuwają się razem z terenem);
// - „rozciągnij” (stretch): teren i położenia obiektów są skalowane proporcjonalnie; rozmiary obiektów bez zmian.
// Gęstość siatki terenu (rozmiar oczka) zostaje taka jak przed zmianą, chyba że podano inną liczbę punktów.
import { cellSize, heightAt, type MapData, type MapObject, type Terrain, type Vec3 } from './map';
import type { Schema } from './schema';

export type ResizeMode = 'expand' | 'stretch';
/** Kotwica: środek albo róg. „n” to mniejsze z (góra mapy w widoku gry), „w” – mniejsze x. */
export type ResizeAnchor = 'center' | 'nw' | 'ne' | 'sw' | 'se';

export interface ResizeOptions {
  width: number;
  depth: number;
  mode: ResizeMode;
  anchor: ResizeAnchor;
  /** Warstwa nowego terenu (tryb „rozszerz”). */
  fillLayer: string;
  /** Wysokość nowego terenu (tryb „rozszerz”). */
  fillHeight: number;
  /** Liczba punktów siatki na dłuższym boku; bez niej – ta sama gęstość co teraz. */
  resolution?: number;
}

/** Próg ostrzeżenia o wydajności: liczba punktów siatki terenu (4 × duża mapa testowa 513 × 513). */
export const RESIZE_WARN_POINTS = 1025 * 1025;

/** Liczba punktów siatki [nx, nz] po zmianie rozmiaru. */
export function resizedResolution(map: MapData, width: number, depth: number, resolution?: number): [number, number] {
  if (resolution && resolution >= 2) {
    const long = Math.max(width, depth);
    return [Math.max(2, Math.round(((resolution - 1) * width) / long) + 1), Math.max(2, Math.round(((resolution - 1) * depth) / long) + 1)];
  }
  const [cx, cz] = cellSize(map);
  return [Math.max(2, Math.round(width / cx) + 1), Math.max(2, Math.round(depth / cz) + 1)];
}

/** Przesunięcie starej zawartości w trybie „rozszerz” (wyrównane do oczka siatki, żeby teren skopiował się bez zmian). */
export function expandOffset(map: MapData, width: number, depth: number, anchor: ResizeAnchor, cell: [number, number]): [number, number] {
  const [w, d] = map.settings.size;
  const dx = width - w;
  const dz = depth - d;
  const fx = anchor === 'center' ? dx / 2 : anchor === 'ne' || anchor === 'se' ? dx : 0;
  const fz = anchor === 'center' ? dz / 2 : anchor === 'sw' || anchor === 'se' ? dz : 0;
  return [Math.round(fx / cell[0]) * cell[0], Math.round(fz / cell[1]) * cell[1]];
}

export interface ResizeResult {
  size: [number, number];
  terrain: Terrain;
  objects: MapObject[];
}

/** Nowy teren i obiekty po zmianie rozmiaru (mapa wejściowa się nie zmienia). */
export function resizeMap(schema: Schema, map: MapData, o: ResizeOptions): ResizeResult {
  const [w, d] = map.settings.size;
  const [nx, nz] = resizedResolution(map, o.width, o.depth, o.resolution);
  const cell: [number, number] = [o.width / (nx - 1), o.depth / (nz - 1)];
  const old = map.terrain;
  const heights = new Float32Array(nx * nz);
  const layerIds = Object.keys(old.layers);
  const layers: Record<string, Uint8Array> = {};
  for (const id of layerIds) layers[id] = new Uint8Array(nx * nz);
  const fill = layerIds.includes(o.fillLayer) ? o.fillLayer : (schema.terrainLayers[0]?.id ?? layerIds[0]);
  if (fill && !layers[fill]) layers[fill] = new Uint8Array(nx * nz);

  const [ox, oz] = o.mode === 'expand' ? expandOffset(map, o.width, o.depth, o.anchor, cell) : [0, 0];
  const sx = o.mode === 'stretch' ? w / o.width : 1;
  const sz = o.mode === 'stretch' ? d / o.depth : 1;
  // punkt nowej mapy → punkt starej mapy
  const toOld = (x: number, z: number): [number, number] => (o.mode === 'stretch' ? [x * sx, z * sz] : [x - ox, z - oz]);
  const eps = 1e-6;
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      const [x, z] = toOld(i * cell[0], j * cell[1]);
      if (x < -eps || z < -eps || x > w + eps || z > d + eps) {
        heights[k] = o.fillHeight;
        if (fill) layers[fill][k] = 255;
        continue;
      }
      heights[k] = heightAt(map, x, z);
      for (const id of layerIds) layers[id][k] = sampleU8(old, old.layers[id], map, x, z);
    }

  const move = (p: Vec3): Vec3 => (o.mode === 'stretch' ? [p[0] / sx, p[1], p[2] / sz] : [p[0] + ox, p[1], p[2] + oz]);
  const objects = map.objects.map((ob) => ({ ...ob, position: move(ob.position), points: ob.points.map(move) }));
  return { size: [o.width, o.depth], terrain: { nx, nz, heights, layers }, objects };
}

/** Waga warstwy w punkcie (interpolacja dwuliniowa, zaokrąglona). */
function sampleU8(t: Terrain, a: Uint8Array, map: MapData, x: number, z: number): number {
  const [cx, cz] = cellSize(map);
  const fx = Math.min(Math.max(x / cx, 0), t.nx - 1);
  const fz = Math.min(Math.max(z / cz, 0), t.nz - 1);
  const i = Math.min(Math.floor(fx), t.nx - 2);
  const j = Math.min(Math.floor(fz), t.nz - 2);
  const tx = fx - i;
  const tz = fz - j;
  const v =
    (a[j * t.nx + i] * (1 - tx) + a[j * t.nx + i + 1] * tx) * (1 - tz) + (a[(j + 1) * t.nx + i] * (1 - tx) + a[(j + 1) * t.nx + i + 1] * tx) * tz;
  return Math.round(v);
}
