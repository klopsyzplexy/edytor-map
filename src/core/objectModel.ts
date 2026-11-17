// Model i flagi konkretnego obiektu: model typu ze schematu albo własny model obiektu (dekoracje,
// obiekty po „Zmień typ”); flagi dekoracji ustawiane przy obiekcie. Czyste funkcje, bez Three.js.
import { DECORATION } from './builtinTypes';
import type { MapObject, Vec3 } from './map';
import { localToWorld, rotateXYZ } from './math';
import { fileStem } from './modelFiles';
import { getType, IDENTITY_TRANSFORM, type ModelTransform, type ObjectFlags, type ObjectTypeDef, type Schema } from './schema';

/** Katalog modeli w eksporcie projektu (.zip) i w odwołaniach zapisywanych przez edytor. */
export const MODEL_DIR = 'modele/';

/** Odwołanie do modelu z biblioteki zapisywane w mapie i schemacie, np. "modele/beczka.glb". */
export function modelRef(name: string): string {
  return `${MODEL_DIR}${fileStem(name)}.glb`;
}

/** Czy dwa odwołania wskazują ten sam model (porównanie po nazwie pliku bez rozszerzenia). */
export function sameModel(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && fileStem(a) === fileStem(b);
}

/** Flagi obiektu: z typu, a dla dekoracji – z jej właściwości `collision` i `walkable`. */
export function objectFlags(t: ObjectTypeDef, o: MapObject): ObjectFlags {
  if (t.id !== DECORATION) return t.flags;
  return { ...t.flags, collision: o.props.collision === true, walkable: o.props.walkable === true };
}

export interface ObjectModel {
  ref: string;
  /** Ułożenie modelu względem punktu obiektu (przed obrotem i skalą obiektu). */
  transform: ModelTransform;
}

/** Model, którym obiekt jest pokazany, albo null (prosta bryła z `look.shape`). */
export function objectModel(schema: Schema, o: MapObject, t: ObjectTypeDef | undefined = getType(schema, o.type)): ObjectModel | null {
  if (o.model) return { ref: o.model, transform: IDENTITY_TRANSFORM };
  if (t?.look.model) return { ref: t.look.model, transform: t.look.modelTransform };
  return null;
}

/** Punkt w układzie pliku modelu → układ obiektu (skala, obrót, przesunięcie modelu). */
export function modelToObject(p: Vec3, m: ModelTransform): Vec3 {
  const r = rotateXYZ([p[0] * m.scale[0], p[1] * m.scale[1], p[2] * m.scale[2]], m.rotation);
  return [r[0] + m.offset[0], r[1] + m.offset[1], r[2] + m.offset[2]];
}

/** Punkt w układzie pliku modelu → układ mapy. */
export function modelToWorld(p: Vec3, m: ModelTransform, o: MapObject): Vec3 {
  return localToWorld(modelToObject(p, m), o.position, o.rotation, o.scale);
}

/** Pudełko modelu w jego własnym układzie (do obrysu kolizji). */
export interface Box3 {
  min: Vec3;
  max: Vec3;
}

/** Wszystkie modele potrzebne mapie: własne modele obiektów i modele ich typów (bez powtórzeń). */
export function usedModels(schema: Schema, objects: MapObject[]): string[] {
  const out = new Map<string, string>();
  for (const o of objects) {
    const m = objectModel(schema, o);
    if (m && !out.has(fileStem(m.ref))) out.set(fileStem(m.ref), m.ref);
  }
  return [...out.values()];
}
