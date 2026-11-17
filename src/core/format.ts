// Format pliku mapy (JSON). Opis dla twórców gier: docs/formaty.md.
import { decodeF32, decodeU8, encodeF32, encodeU8 } from './binary';
import type { MapData, MapGroup, MapObject, ModelSettings, Vec3 } from './map';
import type { PropValue } from './schema';
import type { CollisionShape } from './collision';
import type { WalkableSurface } from './walkable';

export const FORMAT_ID = 'edytor-map';
/**
 * Historia: 1 – pierwsza wersja (0.1.0); 2 – grupy z podgrupami (`parent`), `derived.collision` (0.2.0);
 * 3 – własny model obiektu (`objects[].model`), dekoracje `@decoration`, `derived.models` (0.3.0);
 * 4 – ustawienia modeli `models` (skala bazowa; `objects[].scale` to mnożnik obiektu) (0.4.0).
 */
export const FORMAT_VERSION = 4;

/** Dane wyliczane przy eksporcie dla gry; przy wczytywaniu są pomijane (edytor liczy je od nowa). */
export interface MapDerived {
  /** Maska nieprzechodniości (255 = nie można przejść), ta sama siatka co teren. */
  blocked?: Uint8Array;
  walkable?: WalkableSurface[];
  /** Kształty kolizji (wielokąty i linie z grubością) w układzie mapy. */
  collision?: CollisionShape[];
  /** Modele potrzebne mapie (odwołania, np. "modele/beczka.glb"). */
  models?: string[];
}

export class MapFormatError extends Error {}

export interface MapFileJson {
  format: typeof FORMAT_ID;
  formatVersion: number;
  editorVersion?: string;
  schema: { id: string; version: string };
  settings: MapData['settings'];
  terrain: {
    resolution: [number, number];
    encoding: 'base64';
    heights: string;
    layers: Record<string, string>;
  };
  groups: MapGroup[];
  objects: Array<Omit<MapObject, 'points'> & { points?: Vec3[] }>;
  models: Record<string, ModelSettings>;
  derived?: {
    blocked?: string;
    walkable?: WalkableSurface[];
    collision?: CollisionShape[];
    models?: string[];
  };
}

export function serializeMap(map: MapData, derived?: MapDerived, editorVersion?: string): MapFileJson {
  const t = map.terrain;
  const layers: Record<string, string> = {};
  for (const [id, a] of Object.entries(t.layers)) layers[id] = encodeU8(a);
  const file: MapFileJson = {
    format: FORMAT_ID,
    formatVersion: FORMAT_VERSION,
    ...(editorVersion ? { editorVersion } : {}),
    schema: { ...map.schema },
    settings: structuredClone(map.settings),
    terrain: { resolution: [t.nx, t.nz], encoding: 'base64', heights: encodeF32(t.heights), layers },
    groups: map.groups.map((g) => ({ ...g })),
    objects: map.objects.map((o) => {
      const { points, ...rest } = o;
      const out: MapFileJson['objects'][number] = {
        ...rest,
        position: [...o.position],
        rotation: [...o.rotation],
        scale: [...o.scale],
        props: { ...o.props },
      };
      if (points.length) out.points = points.map((p) => [...p] as Vec3);
      if (!o.model) delete out.model;
      return out;
    }),
    models: Object.fromEntries(Object.entries(map.models).map(([k, v]) => [k, { ...v }])),
  };
  if (derived && (derived.blocked || derived.walkable || derived.collision || derived.models)) {
    file.derived = {};
    if (derived.blocked) file.derived.blocked = encodeU8(derived.blocked);
    if (derived.walkable) file.derived.walkable = derived.walkable;
    if (derived.collision) file.derived.collision = derived.collision;
    if (derived.models) file.derived.models = derived.models;
  }
  return file;
}

export function mapToJson(map: MapData, derived?: MapDerived, editorVersion?: string): string {
  return JSON.stringify(serializeMap(map, derived, editorVersion), null, 1);
}

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isVec3 = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** Migracje starszych wersji formatu: MIGRATIONS[n] zamienia wersję n na n + 1. */
const MIGRATIONS: Record<number, (f: Obj) => Obj> = {
  // 1 → 2: grupy dostają pole `parent` (podgrupy); nowa, opcjonalna sekcja derived.collision
  1: (f) => ({ ...f, formatVersion: 2, groups: (Array.isArray(f.groups) ? f.groups : []).map((g) => (isObj(g) ? { ...g, parent: null } : g)) }),
  // 2 → 3: nowe pola są opcjonalne (`objects[].model`, `derived.models`), typ `@decoration` – bez zmian w danych
  2: (f) => ({ ...f, formatVersion: 3 }),
  // 3 → 4: nowa sekcja `models` (skala bazowa modeli = 1, więc mapa wygląda tak samo; `scale` obiektu = mnożnik)
  3: (f) => ({ ...f, formatVersion: 4, models: {} }),
};

export function parseMap(text: string): MapData {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new MapFormatError(`To nie jest poprawny plik JSON: ${(e as Error).message}`);
  }
  return deserializeMap(raw);
}

export function deserializeMap(raw: unknown): MapData {
  if (!isObj(raw) || raw.format !== FORMAT_ID) throw new MapFormatError('To nie jest plik mapy edytora (brak "format": "edytor-map").');
  let f = raw;
  let v = typeof f.formatVersion === 'number' ? f.formatVersion : 0;
  if (v > FORMAT_VERSION) throw new MapFormatError(`Plik ma nowszą wersję formatu (${v}) niż ten edytor (${FORMAT_VERSION}). Zaktualizuj edytor.`);
  while (v < FORMAT_VERSION) {
    const m = MIGRATIONS[v];
    if (!m) throw new MapFormatError(`Nieobsługiwana wersja formatu: ${v}.`);
    f = m(f);
    v++;
  }

  const schema = isObj(f.schema) ? { id: String(f.schema.id ?? ''), version: String(f.schema.version ?? '') } : { id: '', version: '' };
  if (!isObj(f.settings)) throw new MapFormatError('Brak sekcji "settings".');
  const s = f.settings;
  const size = s.size;
  if (!Array.isArray(size) || size.length !== 2 || !size.every((x) => typeof x === 'number' && x > 0)) throw new MapFormatError('settings.size musi mieć dwie liczby dodatnie.');
  const slope = isObj(s.slope) ? s.slope : {};

  if (!isObj(f.terrain)) throw new MapFormatError('Brak sekcji "terrain".');
  const tr = f.terrain;
  const res = tr.resolution;
  if (!Array.isArray(res) || res.length !== 2 || !res.every((x) => Number.isInteger(x) && x >= 2)) throw new MapFormatError('terrain.resolution musi mieć dwie liczby całkowite ≥ 2.');
  const [nx, nz] = res as [number, number];
  if (typeof tr.heights !== 'string') throw new MapFormatError('Brak terrain.heights.');
  const heights = decodeF32(tr.heights);
  if (heights.length !== nx * nz) throw new MapFormatError(`terrain.heights ma ${heights.length} wartości, a powinno ${nx * nz}.`);
  const layers: Record<string, Uint8Array> = {};
  for (const [id, b64] of Object.entries(isObj(tr.layers) ? tr.layers : {})) {
    if (typeof b64 !== 'string') throw new MapFormatError(`Warstwa "${id}" ma złe dane.`);
    const a = decodeU8(b64);
    if (a.length !== nx * nz) throw new MapFormatError(`Warstwa "${id}" ma ${a.length} wartości, a powinno ${nx * nz}.`);
    layers[id] = a;
  }

  const groups: MapGroup[] = (Array.isArray(f.groups) ? f.groups : []).filter(isObj).map((g) => ({
    id: String(g.id),
    name: String(g.name ?? g.id),
    parent: typeof g.parent === 'string' ? g.parent : null,
    hidden: g.hidden === true,
    locked: g.locked === true,
  }));
  // nieistniejący rodzic albo pętla w drzewie grup → grupa wraca na najwyższy poziom
  const gids = new Set(groups.map((g) => g.id));
  for (const g of groups) {
    if (g.parent && !gids.has(g.parent)) g.parent = null;
    const seen = new Set([g.id]);
    for (let p = g.parent; p; p = groups.find((x) => x.id === p)?.parent ?? null) {
      if (seen.has(p)) {
        g.parent = null;
        break;
      }
      seen.add(p);
    }
  }

  const objects: MapObject[] = (Array.isArray(f.objects) ? f.objects : []).map((o, i) => {
    if (!isObj(o) || typeof o.id !== 'string' || typeof o.type !== 'string') throw new MapFormatError(`objects[${i}]: brak "id" lub "type".`);
    const props: Record<string, PropValue> = {};
    for (const [k, val] of Object.entries(isObj(o.props) ? o.props : {}))
      if (val === null || ['number', 'string', 'boolean'].includes(typeof val)) props[k] = val as PropValue;
    return {
      id: o.id,
      type: o.type,
      name: typeof o.name === 'string' ? o.name : o.id,
      group: typeof o.group === 'string' ? o.group : null,
      hidden: o.hidden === true,
      locked: o.locked === true,
      position: isVec3(o.position) ? [...o.position] : [0, 0, 0],
      rotation: isVec3(o.rotation) ? [...o.rotation] : [0, 0, 0],
      scale: isVec3(o.scale) ? [...o.scale] : [1, 1, 1],
      points: Array.isArray(o.points) ? o.points.filter(isVec3).map((p) => [...p] as Vec3) : [],
      props,
      ...(typeof o.model === 'string' && o.model ? { model: o.model } : {}),
    };
  });

  const models: Record<string, ModelSettings> = {};
  for (const [ref, m] of Object.entries(isObj(f.models) ? f.models : {})) {
    const bs = isObj(m) ? m.baseScale : undefined;
    if (typeof bs !== 'number' || !(bs > 0) || !Number.isFinite(bs)) throw new MapFormatError(`models["${ref}"].baseScale musi być liczbą dodatnią.`);
    models[ref] = { baseScale: bs };
  }

  return {
    schema,
    models,
    settings: {
      name: typeof s.name === 'string' ? s.name : '',
      size: [size[0], size[1]],
      resolution: [nx, nz],
      waterLevel: typeof s.waterLevel === 'number' ? s.waterLevel : 0,
      slope: { enabled: slope.enabled === true, maxDeg: typeof slope.maxDeg === 'number' ? slope.maxDeg : 40 },
    },
    terrain: { nx, nz, heights, layers },
    groups,
    objects,
  };
}
