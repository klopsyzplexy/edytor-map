// Schemat gry: jedyne źródło wiedzy o konkretnej grze. Czyste funkcje, bez DOM i Three.js.

/** Tekst w schemacie: zwykły napis albo wersje językowe, np. { "pl": "Most", "en": "Bridge" }. */
export type LocText = string | Record<string, string>;

export type ObjectKind = 'point' | 'solid' | 'path' | 'zone';
export type PropType = 'number' | 'text' | 'enum' | 'bool' | 'color' | 'ref';
export type Shape = 'box' | 'cylinder' | 'sphere' | 'cone';
export type PropValue = number | string | boolean | null;

export interface EnumOption {
  value: string;
  name: LocText;
}

export interface PropDef {
  id: string;
  name: LocText;
  type: PropType;
  default: PropValue;
  required: boolean;
  min?: number;
  max?: number;
  /** Krok liczby; `1` oznacza liczbę całkowitą. */
  step?: number;
  options?: EnumOption[];
  /** Dla `ref`: dozwolone typy obiektów (puste = dowolny). */
  refTypes?: string[];
  hint?: LocText;
}

export interface ObjectLook {
  shape: Shape;
  color: string;
  /** Adres modelu .glb (URL albo nazwa pliku wczytanego razem ze schematem). */
  model?: string;
}

export interface ObjectFlags {
  /** Blokuje ruch. */
  collision: boolean;
  /** Widoczny w grze (false = tylko w edytorze, np. niewidzialna ściana). */
  visibleInGame: boolean;
  /** Gracz może po nim chodzić (np. most). */
  walkable: boolean;
}

export interface ObjectTypeDef {
  id: string;
  name: LocText;
  category: LocText;
  kind: ObjectKind;
  look: ObjectLook;
  /** Rozmiar w jednostkach mapy [szerokość X, wysokość Y, głębokość Z]. */
  defaultSize: [number, number, number];
  flags: ObjectFlags;
  properties: PropDef[];
  hint?: LocText;
}

export interface TerrainLayerDef {
  id: string;
  name: LocText;
  color: string;
  /** Adres tekstury (opcjonalnie); powtarzana co `textureScale` jednostek. */
  texture?: string;
  textureScale: number;
  water: boolean;
}

export interface CameraDef {
  /** Kąt nachylenia od poziomu w stopniach (90 = z góry). */
  pitchDeg: number;
  /** Obrót wokół osi pionowej w stopniach (0 = patrzy w stronę +Z… tj. „na północ” mapy). */
  yawDeg: number;
  distance: number;
  fovDeg: number;
}

export type RuleLevel = 'error' | 'warning';

export type RuleDef =
  | { type: 'count'; objectType: string; min?: number; max?: number; level: RuleLevel; message?: LocText }
  | { type: 'minDistance'; objectType: string; otherType?: string; distance: number; level: RuleLevel; message?: LocText };

export interface MapDefaults {
  size: [number, number];
  resolution: number;
  height: number;
  waterLevel: number;
  slopeMaxDeg: number;
}

export interface Schema {
  schemaVersion: number;
  id: string;
  name: LocText;
  /** Wersja schematu nadana przez grę (dowolny napis, np. "1.2"). */
  version: string;
  /** Nazwa jednostki (np. "m"), tylko do wyświetlania. */
  units: string;
  camera: CameraDef;
  terrainLayers: TerrainLayerDef[];
  objectTypes: ObjectTypeDef[];
  rules: RuleDef[];
  mapDefaults: MapDefaults;
}

export const SCHEMA_VERSION = 1;
export const MAX_TERRAIN_LAYERS = 8;

export class SchemaError extends Error {
  constructor(public readonly problems: string[]) {
    super('Niepoprawny schemat:\n' + problems.join('\n'));
  }
}

export function locText(t: LocText | undefined, lang: string, fallback = ''): string {
  if (t === undefined || t === null) return fallback;
  if (typeof t === 'string') return t;
  return t[lang] ?? t.en ?? t.pl ?? Object.values(t)[0] ?? fallback;
}

const KINDS: ObjectKind[] = ['point', 'solid', 'path', 'zone'];
const PROP_TYPES: PropType[] = ['number', 'text', 'enum', 'bool', 'color', 'ref'];
const SHAPES: Shape[] = ['box', 'cylinder', 'sphere', 'cone'];
const ID_RE = /^[A-Za-z0-9_.-]+$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isLoc = (v: unknown): v is LocText =>
  typeof v === 'string' || (isObj(v) && Object.values(v).every((x) => typeof x === 'string'));
const num = (v: unknown, d: number): number => (typeof v === 'number' && Number.isFinite(v) ? v : d);

/**
 * Sprawdza i uzupełnia surowy JSON schematu. Rzuca `SchemaError` z listą wszystkich problemów.
 */
export function parseSchema(raw: unknown): Schema {
  const p: string[] = [];
  if (!isObj(raw)) throw new SchemaError(['Schemat musi być obiektem JSON.']);

  const schemaVersion = num(raw.schemaVersion, SCHEMA_VERSION);
  if (schemaVersion > SCHEMA_VERSION) p.push(`schemaVersion ${schemaVersion} jest nowszy niż obsługiwany (${SCHEMA_VERSION}).`);
  const id = typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : '';
  if (!id) p.push('Brak poprawnego pola "id" (litery, cyfry, _ . -).');
  if (!isLoc(raw.name)) p.push('Brak pola "name".');

  // Kamera
  const cam = isObj(raw.camera) ? raw.camera : {};
  const camera: CameraDef = {
    pitchDeg: num(cam.pitchDeg, 50),
    yawDeg: num(cam.yawDeg, 0),
    distance: num(cam.distance, 30),
    fovDeg: num(cam.fovDeg, 50),
  };
  if (camera.pitchDeg <= 0 || camera.pitchDeg > 90) p.push('camera.pitchDeg musi być w zakresie (0, 90].');
  if (camera.distance <= 0) p.push('camera.distance musi być większe od 0.');

  // Warstwy terenu
  const terrainLayers: TerrainLayerDef[] = [];
  if (!Array.isArray(raw.terrainLayers) || raw.terrainLayers.length === 0) {
    p.push('"terrainLayers" musi zawierać co najmniej jedną warstwę (pierwsza jest podłożem).');
  } else {
    if (raw.terrainLayers.length > MAX_TERRAIN_LAYERS) p.push(`Najwyżej ${MAX_TERRAIN_LAYERS} warstw terenu.`);
    const seen = new Set<string>();
    raw.terrainLayers.forEach((l, i) => {
      const where = `terrainLayers[${i}]`;
      if (!isObj(l)) return p.push(`${where} musi być obiektem.`);
      const lid = typeof l.id === 'string' && ID_RE.test(l.id) ? l.id : '';
      if (!lid) p.push(`${where}: brak poprawnego "id".`);
      else if (seen.has(lid)) p.push(`${where}: powtórzone id "${lid}".`);
      seen.add(lid);
      const color = typeof l.color === 'string' && COLOR_RE.test(l.color) ? l.color : '#808080';
      if (l.color !== undefined && color !== l.color) p.push(`${where}: kolor musi mieć postać #rrggbb.`);
      terrainLayers.push({
        id: lid,
        name: isLoc(l.name) ? l.name : lid,
        color,
        texture: typeof l.texture === 'string' ? l.texture : undefined,
        textureScale: num(l.textureScale, 4),
        water: l.water === true,
      });
    });
  }

  // Typy obiektów
  const objectTypes: ObjectTypeDef[] = [];
  const typeIds = new Set<string>();
  if (!Array.isArray(raw.objectTypes)) p.push('"objectTypes" musi być listą.');
  else
    raw.objectTypes.forEach((t, i) => {
      const where = `objectTypes[${i}]`;
      if (!isObj(t)) return p.push(`${where} musi być obiektem.`);
      const tid = typeof t.id === 'string' && ID_RE.test(t.id) ? t.id : '';
      if (!tid) p.push(`${where}: brak poprawnego "id".`);
      else if (typeIds.has(tid)) p.push(`${where}: powtórzone id "${tid}".`);
      typeIds.add(tid);
      const w = `objectTypes "${tid || i}"`;
      const kind = KINDS.includes(t.kind as ObjectKind) ? (t.kind as ObjectKind) : 'point';
      if (!KINDS.includes(t.kind as ObjectKind)) p.push(`${w}: "kind" musi być jednym z: ${KINDS.join(', ')}.`);
      const look = isObj(t.look) ? t.look : {};
      const shape = SHAPES.includes(look.shape as Shape) ? (look.shape as Shape) : 'box';
      if (look.shape !== undefined && !SHAPES.includes(look.shape as Shape)) p.push(`${w}: look.shape musi być jednym z: ${SHAPES.join(', ')}.`);
      const color = typeof look.color === 'string' && COLOR_RE.test(look.color) ? look.color : '#cccccc';
      const ds = Array.isArray(t.defaultSize) && t.defaultSize.length === 3 && t.defaultSize.every((x) => typeof x === 'number' && x > 0)
        ? (t.defaultSize as [number, number, number])
        : ([1, 1, 1] as [number, number, number]);
      if (t.defaultSize !== undefined && ds !== t.defaultSize) p.push(`${w}: defaultSize musi być listą trzech liczb dodatnich.`);
      const f = isObj(t.flags) ? t.flags : {};
      const props: PropDef[] = [];
      const propIds = new Set<string>();
      if (t.properties !== undefined && !Array.isArray(t.properties)) p.push(`${w}: "properties" musi być listą.`);
      (Array.isArray(t.properties) ? t.properties : []).forEach((pr, j) => {
        const pw = `${w}.properties[${j}]`;
        if (!isObj(pr)) return p.push(`${pw} musi być obiektem.`);
        const pid = typeof pr.id === 'string' && ID_RE.test(pr.id) ? pr.id : '';
        if (!pid) p.push(`${pw}: brak poprawnego "id".`);
        else if (propIds.has(pid)) p.push(`${pw}: powtórzone id "${pid}".`);
        propIds.add(pid);
        const type = PROP_TYPES.includes(pr.type as PropType) ? (pr.type as PropType) : 'text';
        if (!PROP_TYPES.includes(pr.type as PropType)) p.push(`${pw}: "type" musi być jednym z: ${PROP_TYPES.join(', ')}.`);
        let options: EnumOption[] | undefined;
        if (type === 'enum') {
          if (!Array.isArray(pr.options) || pr.options.length === 0) p.push(`${pw}: wybór z listy wymaga "options".`);
          options = (Array.isArray(pr.options) ? pr.options : []).map((o) =>
            typeof o === 'string' ? { value: o, name: o } : isObj(o) && typeof o.value === 'string' ? { value: o.value, name: isLoc(o.name) ? o.name : o.value } : { value: String(o), name: String(o) },
          );
        }
        const def: PropDef = {
          id: pid,
          name: isLoc(pr.name) ? pr.name : pid,
          type,
          default: defaultFor(type, pr.default, options),
          required: pr.required === true,
          min: typeof pr.min === 'number' ? pr.min : undefined,
          max: typeof pr.max === 'number' ? pr.max : undefined,
          step: typeof pr.step === 'number' ? pr.step : undefined,
          options,
          refTypes: Array.isArray(pr.refTypes) ? pr.refTypes.filter((x): x is string => typeof x === 'string') : undefined,
          hint: isLoc(pr.hint) ? pr.hint : undefined,
        };
        if (def.min !== undefined && def.max !== undefined && def.min > def.max) p.push(`${pw}: min większe niż max.`);
        props.push(def);
      });
      objectTypes.push({
        id: tid,
        name: isLoc(t.name) ? t.name : tid,
        category: isLoc(t.category) ? t.category : 'Inne',
        kind,
        look: { shape, color, model: typeof look.model === 'string' ? look.model : undefined },
        defaultSize: ds,
        flags: {
          collision: f.collision === true,
          visibleInGame: f.visibleInGame !== false,
          walkable: f.walkable === true,
        },
        properties: props,
        hint: isLoc(t.hint) ? t.hint : undefined,
      });
    });

  // Odwołania refTypes muszą wskazywać istniejące typy
  for (const t of objectTypes)
    for (const pr of t.properties)
      for (const r of pr.refTypes ?? []) if (!typeIds.has(r)) p.push(`objectTypes "${t.id}".${pr.id}: refTypes wskazuje nieznany typ "${r}".`);

  // Zasady
  const rules: RuleDef[] = [];
  if (raw.rules !== undefined && !Array.isArray(raw.rules)) p.push('"rules" musi być listą.');
  (Array.isArray(raw.rules) ? raw.rules : []).forEach((r, i) => {
    const where = `rules[${i}]`;
    if (!isObj(r)) return p.push(`${where} musi być obiektem.`);
    const level: RuleLevel = r.level === 'warning' ? 'warning' : 'error';
    const objectType = typeof r.objectType === 'string' ? r.objectType : '';
    if (!typeIds.has(objectType)) p.push(`${where}: nieznany objectType "${objectType}".`);
    const message = isLoc(r.message) ? r.message : undefined;
    if (r.type === 'count') {
      const min = typeof r.min === 'number' ? r.min : undefined;
      const max = typeof r.max === 'number' ? r.max : undefined;
      if (min === undefined && max === undefined) p.push(`${where}: zasada "count" wymaga "min" lub "max".`);
      rules.push({ type: 'count', objectType, min, max, level, message });
    } else if (r.type === 'minDistance') {
      const otherType = typeof r.otherType === 'string' ? r.otherType : undefined;
      if (otherType !== undefined && !typeIds.has(otherType)) p.push(`${where}: nieznany otherType "${otherType}".`);
      if (typeof r.distance !== 'number' || r.distance <= 0) p.push(`${where}: "distance" musi być liczbą dodatnią.`);
      rules.push({ type: 'minDistance', objectType, otherType, distance: num(r.distance, 1), level, message });
    } else p.push(`${where}: nieznany typ zasady "${String(r.type)}" (dostępne: count, minDistance).`);
  });

  const md = isObj(raw.mapDefaults) ? raw.mapDefaults : {};
  const mapDefaults: MapDefaults = {
    size: Array.isArray(md.size) && md.size.length === 2 && md.size.every((x) => typeof x === 'number' && x > 0) ? (md.size as [number, number]) : [64, 64],
    resolution: num(md.resolution, 129),
    height: num(md.height, 0),
    waterLevel: num(md.waterLevel, 0),
    slopeMaxDeg: num(md.slopeMaxDeg, 40),
  };

  if (p.length) throw new SchemaError(p);
  return {
    schemaVersion,
    id,
    name: raw.name as LocText,
    version: typeof raw.version === 'string' ? raw.version : String(raw.version ?? '1'),
    units: typeof raw.units === 'string' ? raw.units : 'm',
    camera,
    terrainLayers,
    objectTypes,
    rules,
    mapDefaults,
  };
}

function defaultFor(type: PropType, v: unknown, options?: EnumOption[]): PropValue {
  switch (type) {
    case 'number':
      return typeof v === 'number' ? v : 0;
    case 'text':
      return typeof v === 'string' ? v : '';
    case 'bool':
      return v === true;
    case 'color':
      return typeof v === 'string' && COLOR_RE.test(v) ? v : '#ffffff';
    case 'enum':
      return typeof v === 'string' && options?.some((o) => o.value === v) ? v : (options?.[0]?.value ?? '');
    case 'ref':
      return typeof v === 'string' ? v : null;
  }
}

export function getType(schema: Schema, id: string): ObjectTypeDef | undefined {
  return schema.objectTypes.find((t) => t.id === id);
}

/** Domyślne wartości właściwości nowego obiektu. */
export function defaultProps(t: ObjectTypeDef): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of t.properties) out[p.id] = p.default;
  return out;
}
