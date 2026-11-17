// Powierzchnie chodliwe do eksportu: trójkąty w układzie mapy, po których gracz może chodzić.
// Gra liczy wysokość ruchu jako najwyższą z terenu i powierzchni chodliwych pod postacią.
import type { MapData, MapObject, Vec3 } from './map';
import { localToWorld, round } from './math';
import { modelToWorld, objectFlags, objectModel } from './objectModel';
import { getType, type Schema } from './schema';

export interface WalkableSurface {
  objectId: string;
  type: string;
  /** Płaska lista współrzędnych: [x, y, z] × 3 na każdy trójkąt. */
  triangles: number[];
}

/**
 * Dostarcza trójkąty powierzchni chodliwej modelu .glb (odwołanie jak w `look.model`) w układzie pliku modelu
 * (siatka o nazwie zawierającej „walkable”, a gdy jej nie ma – ściany skierowane do góry).
 */
export type ModelWalkableProvider = (ref: string) => Float32Array | null;

const CIRCLE_SEGMENTS = 16;

/** Górna ściana bryły w układzie lokalnym (podstawa bryły leży na y = 0). */
function primitiveTopTriangles(size: Vec3, shape: string): Vec3[] {
  const [w, h, d] = size;
  if (shape === 'cylinder') {
    const tris: Vec3[] = [];
    for (let k = 0; k < CIRCLE_SEGMENTS; k++) {
      const a0 = (k / CIRCLE_SEGMENTS) * Math.PI * 2;
      const a1 = ((k + 1) / CIRCLE_SEGMENTS) * Math.PI * 2;
      tris.push([0, h, 0], [(Math.cos(a1) * w) / 2, h, (Math.sin(a1) * d) / 2], [(Math.cos(a0) * w) / 2, h, (Math.sin(a0) * d) / 2]);
    }
    return tris;
  }
  const x = w / 2;
  const z = d / 2;
  return [
    [-x, h, -z], [-x, h, z], [x, h, z],
    [-x, h, -z], [x, h, z], [x, h, -z],
  ];
}

export function objectWalkable(schema: Schema, o: MapObject, models?: ModelWalkableProvider): WalkableSurface | null {
  const t = getType(schema, o.type);
  if (!t || !objectFlags(t, o).walkable || o.points.length > 0) return null;
  const triangles: number[] = [];
  const model = objectModel(schema, o, t);
  const fromModel = model && models ? models(model.ref) : null;
  if (model && fromModel) {
    for (let k = 0; k + 2 < fromModel.length; k += 3)
      for (const v of modelToWorld([fromModel[k], fromModel[k + 1], fromModel[k + 2]], model.transform, o)) triangles.push(round(v));
  } else {
    // bez modelu albo gdy model się jeszcze nie wczytał – górna ściana prostej bryły
    for (const p of primitiveTopTriangles(t.defaultSize, t.look.shape)) for (const v of localToWorld(p, o.position, o.rotation, o.scale)) triangles.push(round(v));
  }
  if (!triangles.length) return null;
  return { objectId: o.id, type: o.type, triangles };
}

export function collectWalkable(schema: Schema, map: MapData, models?: ModelWalkableProvider): WalkableSurface[] {
  const out: WalkableSurface[] = [];
  for (const o of map.objects) {
    const s = objectWalkable(schema, o, models);
    if (s) out.push(s);
  }
  return out;
}
