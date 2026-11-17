// Schemat gry: jedyne źródło wiedzy o konkretnej grze. Czyste funkcje, bez DOM i Three.js.
import { BUILTIN_TYPES } from './builtinTypes';

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

/** Ułożenie modelu względem punktu obiektu: przesunięcie, obrót (stopnie, XYZ) i skala. */
export interface ModelTransform {
  offset: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
}

export const IDENTITY_TRANSFORM: ModelTransform = { offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] };

export interface ObjectLook {
  shape: Shape;
  color: string;
  /** Adres modelu .glb (URL albo nazwa pliku wczytanego razem ze schematem). */
  model?: string;
  /** Ułożenie modelu względem punktu obiektu (`modelOffset`, `modelRotation`, `modelScale` w schemacie). */
  modelTransform: ModelTransform;
}

export interface ObjectFlags {
  /** Blokuje ruch. */
  collision: boolean;
  /** Widoczny w grze (false = tylko w edytorze, np. niewidzialna ściana). */
  visibleInGame: boolean;
  /** Gracz może po nim chodzić (np. most). */
  walkable: boolean;
}

/**
 * Zachowanie typu w trybie gry (uniwersalne, ze schematu):
 * - `teleport` – przejście: wejście postaci w obiekt przenosi ją do obiektu wskazanego właściwością `target` (typu `ref`);
 * - `message` – strefa z komunikatem: wejście i wyjście pokazuje tekst z właściwości `text`.
 */
export type BehaviorDef = { type: 'teleport'; target: string } | { type: 'message'; text: string };

export interface ObjectTypeDef {
  id: string;
  name: LocText;
  category: LocText;
  kind: ObjectKind;
  look: ObjectLook;
  /** Rozmiar prostej bryły w jednostkach mapy [X, Y, Z] (= `defaultSize` ze schematu w metrach × przelicznik). */
  defaultSize: [number, number, number];
  /** Rozmiar prostej bryły w metrach, tak jak w schemacie. */
  defaultSizeM: [number, number, number];
  flags: ObjectFlags;
  properties: PropDef[];
  hint?: LocText;
  behavior?: BehaviorDef;
}

/** Jak mierzyć model przy normalizacji: wysokość albo szerokość podstawy (większy z boków X, Z). */
export type ScaleMeasure = 'height' | 'width';

/** Kategoria modeli z rozmiarem docelowym w metrach (normalizacja przy imporcie). */
export interface ScaleCategory {
  id: string;
  /** Nazwa ze schematu; bez niej interfejs bierze nazwę z tłumaczeń (`scaleCategory.<id>`). */
  name?: LocText;
  /** Rozmiar docelowy w metrach. */
  size: number;
  /** Dopuszczalny zakres w metrach (np. drzewo 6–10 m); model w zakresie nie jest skalowany. */
  min?: number;
  max?: number;
  measure: ScaleMeasure;
}

/** Skala świata: przelicznik jednostek mapy na metry i kategorie modeli. */
export interface WorldScale {
  /** Ile jednostek mapy to 1 metr. */
  unitsPerMeter: number;
  /** Skąd przelicznik: pole `scale.unitsPerMeter`, wysokość postaci (`player.height` = 1,8 m) albo domyślny 1. */
  source: 'schema' | 'player' | 'default';
  categories: ScaleCategory[];
}

/** Wzorcowa wysokość postaci w metrach. */
export const PLAYER_HEIGHT_M = 1.8;

/** Domyślne kategorie modeli (schemat może je zmienić po `id` albo dodać nowe). */
export const DEFAULT_SCALE_CATEGORIES: ScaleCategory[] = [
  { id: 'postac', size: 1.8, measure: 'height' },
  { id: 'drzewo', size: 8, min: 6, max: 10, measure: 'height' },
  { id: 'krzew', size: 1, measure: 'height' },
  { id: 'skala', size: 1.5, measure: 'height' },
  { id: 'plot', size: 1.2, measure: 'height' },
  { id: 'budynek', size: 10, measure: 'width' },
];

export interface TerrainLayerDef {
  id: string;
  name: LocText;
  color: string;
  /** Adres tekstury (opcjonalnie); powtarzana co `textureScale` jednostek. */
  texture?: string;
  textureScale: number;
  water: boolean;
  /** Czy postać może tędy przejść (np. głęboka woda: false). */
  passable: boolean;
}

export interface CameraDef {
  /** Kąt nachylenia od poziomu w stopniach (90 = z góry). */
  pitchDeg: number;
  /** Obrót wokół osi pionowej w stopniach (0 = kamera po stronie +Z patrzy w stronę −Z, góra ekranu to mniejsze z). */
  yawDeg: number;
  distance: number;
  fovDeg: number;
  /** Tryb gry: czas (s), w jakim kamera dogania postać; 0 = bez opóźnienia. */
  followSmoothing: number;
  /** Tryb gry: granice przybliżania kółkiem myszy (odległość kamery). */
  minDistance: number;
  maxDistance: number;
}

/** Postać gracza w trybie „zagraj tę mapę”. */
export interface PlayerDef {
  /** Model postaci (.glb itp.); bez modelu – kapsuła. */
  model?: string;
  modelTransform: ModelTransform;
  /** Nazwy animacji w modelu; bez nich edytor szuka po nazwach (idle/stoi, walk/idzie…). */
  animations: { idle?: string; walk?: string };
  /** Promień i wysokość postaci (kolizje). */
  radius: number;
  height: number;
  /** Szybkość ruchu w jednostkach mapy na sekundę. */
  speed: number;
  /** Najwyższy stopień, na który postać wchodzi (np. krawężnik). */
  stepHeight: number;
  /** Typ obiektu, w którym postać zaczyna (np. "start"). */
  startType?: string;
}

export type RuleLevel = 'error' | 'warning';

/**
 * Zasada liczebności: dokładnie N (`exactly`), co najmniej N (`min`), co najwyżej N (`max`) albo przedział (`min` i `max`).
 * `within` (id typu strefy) – liczba liczona osobno w każdej strefie tego typu (obiekty, których środek leży w strefie).
 */
export interface CountRule {
  type: 'count';
  objectType: string;
  min?: number;
  max?: number;
  exactly?: number;
  within?: string;
  level: RuleLevel;
  message?: LocText;
}

export type RuleDef =
  | CountRule
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
  /** Skala świata (przelicznik jednostek na metry, kategorie modeli). */
  scale: WorldScale;
  camera: CameraDef;
  player: PlayerDef;
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
    followSmoothing: 0.15,
    minDistance: 0,
    maxDistance: 0,
  };
  camera.followSmoothing = Math.max(0, num(cam.followSmoothing, 0.15));
  camera.minDistance = num(cam.minDistance, camera.distance * 0.4);
  camera.maxDistance = num(cam.maxDistance, camera.distance * 2.5);
  if (camera.minDistance <= 0 || camera.maxDistance < camera.minDistance) p.push('camera.minDistance i camera.maxDistance: 0 < min ≤ max.');
  if (camera.pitchDeg <= 0 || camera.pitchDeg > 90) p.push('camera.pitchDeg musi być w zakresie (0, 90].');
  if (camera.distance <= 0) p.push('camera.distance musi być większe od 0.');

  // Skala świata: przelicznik z pola scale.unitsPerMeter, a bez niego z wysokości postaci (1,8 m)
  const sc = isObj(raw.scale) ? raw.scale : {};
  if (raw.scale !== undefined && !isObj(raw.scale)) p.push('"scale" musi być obiektem.');
  const rawPlayer = isObj(raw.player) ? raw.player : {};
  let unitsPerMeter = 1;
  let scaleSource: WorldScale['source'] = 'default';
  if (sc.unitsPerMeter !== undefined) {
    if (typeof sc.unitsPerMeter === 'number' && sc.unitsPerMeter > 0) {
      unitsPerMeter = sc.unitsPerMeter;
      scaleSource = 'schema';
    } else p.push('scale.unitsPerMeter musi być liczbą dodatnią.');
  } else if (typeof rawPlayer.height === 'number' && rawPlayer.height > 0) {
    unitsPerMeter = rawPlayer.height / PLAYER_HEIGHT_M;
    scaleSource = 'player';
  }
  const categories = DEFAULT_SCALE_CATEGORIES.map((c) => ({ ...c }));
  if (sc.categories !== undefined && !Array.isArray(sc.categories)) p.push('scale.categories musi być listą.');
  (Array.isArray(sc.categories) ? sc.categories : []).forEach((c, i) => {
    const where = `scale.categories[${i}]`;
    if (!isObj(c)) return p.push(`${where} musi być obiektem.`);
    const cid = typeof c.id === 'string' && ID_RE.test(c.id) ? c.id : '';
    if (!cid) return p.push(`${where}: brak poprawnego "id".`);
    const prev = categories.find((x) => x.id === cid);
    const size = num(c.size, prev?.size ?? NaN);
    if (!(size > 0)) p.push(`${where}: "size" (metry) musi być liczbą dodatnią.`);
    const measure: ScaleMeasure = c.measure === 'width' || c.measure === 'height' ? c.measure : (prev?.measure ?? 'height');
    if (c.measure !== undefined && c.measure !== 'width' && c.measure !== 'height') p.push(`${where}: "measure" musi być "height" albo "width".`);
    const cat: ScaleCategory = {
      id: cid,
      name: isLoc(c.name) ? c.name : prev?.name,
      size,
      min: typeof c.min === 'number' ? c.min : c.size !== undefined ? undefined : prev?.min,
      max: typeof c.max === 'number' ? c.max : c.size !== undefined ? undefined : prev?.max,
      measure,
    };
    if (cat.min !== undefined && cat.max !== undefined && cat.min > cat.max) p.push(`${where}: min większe niż max.`);
    if (prev) Object.assign(prev, cat);
    else categories.push(cat);
  });
  const scale: WorldScale = { unitsPerMeter, source: scaleSource, categories };

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
        passable: l.passable !== false,
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
      let behavior: BehaviorDef | undefined;
      const b = t.behavior;
      if (b !== undefined) {
        if (!isObj(b)) p.push(`${w}: "behavior" musi być obiektem.`);
        else if (b.type === 'teleport') {
          const target = typeof b.target === 'string' ? b.target : '';
          const tp = props.find((x) => x.id === target);
          if (!tp || tp.type !== 'ref') p.push(`${w}: behavior "teleport" wymaga "target" – id właściwości typu "ref".`);
          behavior = { type: 'teleport', target };
        } else if (b.type === 'message') {
          const text = typeof b.text === 'string' ? b.text : '';
          if (!props.some((x) => x.id === text)) p.push(`${w}: behavior "message" wymaga "text" – id właściwości z tekstem.`);
          if (kind !== 'zone') p.push(`${w}: behavior "message" działa tylko dla stref (kind "zone").`);
          behavior = { type: 'message', text };
        } else p.push(`${w}: nieznane zachowanie "${String(b.type)}" (dostępne: teleport, message).`);
      }
      objectTypes.push({
        id: tid,
        name: isLoc(t.name) ? t.name : tid,
        category: isLoc(t.category) ? t.category : 'Inne',
        kind,
        look: { shape, color, model: typeof look.model === 'string' ? look.model : undefined, modelTransform: parseTransform(look, w, p) },
        defaultSize: [ds[0] * unitsPerMeter, ds[1] * unitsPerMeter, ds[2] * unitsPerMeter],
        defaultSizeM: [...ds],
        flags: {
          collision: f.collision === true,
          visibleInGame: f.visibleInGame !== false,
          walkable: f.walkable === true,
        },
        properties: props,
        hint: isLoc(t.hint) ? t.hint : undefined,
        behavior,
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
      const intOrUndef = (k: 'min' | 'max' | 'exactly') => {
        const v = r[k];
        if (v === undefined) return undefined;
        if (typeof v !== 'number' || !Number.isInteger(v) || v < 0) {
          p.push(`${where}: "${k}" musi być liczbą całkowitą ≥ 0.`);
          return undefined;
        }
        return v;
      };
      const min = intOrUndef('min');
      const max = intOrUndef('max');
      const exactly = intOrUndef('exactly');
      if (min === undefined && max === undefined && exactly === undefined) p.push(`${where}: zasada "count" wymaga "exactly", "min" lub "max".`);
      if (exactly !== undefined && (min !== undefined || max !== undefined)) p.push(`${where}: "exactly" nie łączy się z "min" i "max".`);
      if (min !== undefined && max !== undefined && min > max) p.push(`${where}: min większe niż max.`);
      const within = typeof r.within === 'string' ? r.within : undefined;
      if (r.within !== undefined && (!within || !typeIds.has(within))) p.push(`${where}: "within" wskazuje nieznany typ "${String(r.within)}".`);
      else if (within && objectTypes.find((t) => t.id === within)?.kind !== 'zone') p.push(`${where}: "within" musi wskazywać typ strefy (kind "zone").`);
      rules.push({ type: 'count', objectType, min, max, exactly, within, level, message });
    } else if (r.type === 'minDistance') {
      const otherType = typeof r.otherType === 'string' ? r.otherType : undefined;
      if (otherType !== undefined && !typeIds.has(otherType)) p.push(`${where}: nieznany otherType "${otherType}".`);
      if (typeof r.distance !== 'number' || r.distance <= 0) p.push(`${where}: "distance" musi być liczbą dodatnią.`);
      rules.push({ type: 'minDistance', objectType, otherType, distance: num(r.distance, 1), level, message });
    } else p.push(`${where}: nieznany typ zasady "${String(r.type)}" (dostępne: count, minDistance).`);
  });

  // Postać gracza (tryb „zagraj tę mapę”); wszystko opcjonalne
  const pl = isObj(raw.player) ? raw.player : {};
  if (raw.player !== undefined && !isObj(raw.player)) p.push('"player" musi być obiektem.');
  const anim = isObj(pl.animations) ? pl.animations : {};
  const player: PlayerDef = {
    model: typeof pl.model === 'string' && pl.model ? pl.model : undefined,
    modelTransform: parseTransform(pl, 'player', p),
    animations: { idle: typeof anim.idle === 'string' ? anim.idle : undefined, walk: typeof anim.walk === 'string' ? anim.walk : undefined },
    // domyślne rozmiary postaci w metrach, przeliczone na jednostki mapy
    radius: num(pl.radius, 0.4 * unitsPerMeter),
    height: num(pl.height, PLAYER_HEIGHT_M * unitsPerMeter),
    speed: num(pl.speed, 5 * unitsPerMeter),
    stepHeight: num(pl.stepHeight, 0.35 * unitsPerMeter),
    startType: typeof pl.startType === 'string' && pl.startType ? pl.startType : undefined,
  };
  for (const k of ['radius', 'height', 'speed'] as const) if (!(player[k] > 0)) p.push(`player.${k} musi być większe od 0.`);
  if (player.stepHeight < 0) p.push('player.stepHeight nie może być ujemne.');
  if (player.startType && !typeIds.has(player.startType)) p.push(`player.startType wskazuje nieznany typ "${player.startType}".`);

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
    scale,
    camera,
    player,
    terrainLayers,
    objectTypes,
    rules,
    mapDefaults,
  };
}

const isNum3 = (v: unknown): v is [number, number, number] => Array.isArray(v) && v.length === 3 && v.every((x) => typeof x === 'number' && Number.isFinite(x));

/** `modelOffset`, `modelRotation` (stopnie) i `modelScale` (liczba albo [x, y, z]) z obiektu schematu. */
function parseTransform(o: Obj, where: string, p: string[]): ModelTransform {
  const vec = (key: string, d: [number, number, number]): [number, number, number] => {
    const v = o[key];
    if (v === undefined) return [...d];
    if (isNum3(v)) return [...v];
    p.push(`${where}: ${key} musi być listą trzech liczb.`);
    return [...d];
  };
  let scale: [number, number, number] = [1, 1, 1];
  if (typeof o.modelScale === 'number' && o.modelScale > 0) scale = [o.modelScale, o.modelScale, o.modelScale];
  else if (isNum3(o.modelScale) && o.modelScale.every((x) => x > 0)) scale = [...o.modelScale];
  else if (o.modelScale !== undefined) p.push(`${where}: modelScale musi być liczbą dodatnią albo listą trzech liczb dodatnich.`);
  return { offset: vec('modelOffset', [0, 0, 0]), rotation: vec('modelRotation', [0, 0, 0]), scale };
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

/** Typ ze schematu albo wbudowany typ edytora (kolizje rysowane, id z „@”). */
export function getType(schema: Schema, id: string): ObjectTypeDef | undefined {
  return schema.objectTypes.find((t) => t.id === id) ?? (id.startsWith('@') ? BUILTIN_TYPES.find((t) => t.id === id) : undefined);
}

/** Domyślne wartości właściwości nowego obiektu. */
export function defaultProps(t: ObjectTypeDef): Record<string, PropValue> {
  const out: Record<string, PropValue> = {};
  for (const p of t.properties) out[p.id] = p.default;
  return out;
}
