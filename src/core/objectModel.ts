// Model i flagi konkretnego obiektu: model typu ze schematu albo własny model obiektu (dekoracje,
// obiekty po „Zmień typ”); flagi dekoracji ustawiane przy obiekcie. Czyste funkcje, bez Three.js.
import { DECORATION } from './builtinTypes';
import { modelBaseScale, type MapData, type MapObject, type Vec3 } from './map';
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

/**
 * Model, którym obiekt jest pokazany, albo null (prosta bryła z `look.shape`). Gdy podano mapę, ułożenie
 * zawiera też skalę bazową modelu z `map.models` (mnoży punkty modelu przed ułożeniem z typu).
 */
export function objectModel(
  schema: Schema,
  o: MapObject,
  t: ObjectTypeDef | undefined = getType(schema, o.type),
  map?: Pick<MapData, 'models'>,
): ObjectModel | null {
  if (o.model) return { ref: o.model, transform: withBaseScale(IDENTITY_TRANSFORM, modelBaseScale(map, o.model)) };
  if (t?.look.model) return { ref: t.look.model, transform: withBaseScale(t.look.modelTransform, modelBaseScale(map, t.look.model)) };
  return null;
}

/** Ułożenie modelu ze skalą bazową (jednolitą): offset + R · (scale · base · p). */
export function withBaseScale(m: ModelTransform, base: number): ModelTransform {
  if (base === 1) return m;
  return { offset: m.offset, rotation: m.rotation, scale: [m.scale[0] * base, m.scale[1] * base, m.scale[2] * base] };
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

/**
 * „Zmień typ”: obiekt staje się obiektem innego typu (np. dekoracja → typ ze schematu i odwrotnie)
 * z zachowaniem modelu, pozycji, obrotu i skali. Właściwości dostają wartości domyślne nowego typu,
 * a te o tym samym id i rodzaju zostają. Tylko dla punktów i brył (ścieżka nie stanie się punktem).
 */
export function changeObjectType(schema: Schema, o: MapObject, typeId: string): void {
  const from = getType(schema, o.type);
  const to = getType(schema, typeId);
  if (!to) throw new Error(`Nieznany typ obiektu: ${typeId}`);
  if (o.points.length || to.kind === 'path' || to.kind === 'zone') throw new Error('Zmiana typu działa tylko dla punktów i brył.');
  const old = objectModel(schema, o, from);
  const props: MapObject['props'] = {};
  for (const p of to.properties) {
    const prev = from?.properties.find((x) => x.id === p.id && x.type === p.type);
    props[p.id] = prev && o.props[p.id] !== undefined ? o.props[p.id] : p.default;
  }
  o.type = typeId;
  o.props = props;
  if (!old || sameModel(old.ref, to.look.model)) {
    // ten sam model co w nowym typie (albo żadnego) – wystarczy model typu
    delete o.model;
    return;
  }
  o.model = old.ref;
  // model typu miał tylko skalę – przenosimy ją na obiekt, żeby model się nie zmienił
  const tr = old.transform;
  if (old.transform !== IDENTITY_TRANSFORM && tr.rotation.every((x) => x === 0) && tr.offset.every((x) => x === 0))
    o.scale = [o.scale[0] * tr.scale[0], o.scale[1] * tr.scale[1], o.scale[2] * tr.scale[2]];
}

/** Typy, na które można zmienić obiekt: dekoracja i typy ze schematu będące punktem albo bryłą. */
export function changeableTypes(schema: Schema): ObjectTypeDef[] {
  return [getType(schema, DECORATION)!, ...schema.objectTypes.filter((t) => t.kind === 'point' || t.kind === 'solid')];
}
