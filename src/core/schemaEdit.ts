// Zmiany schematu z poziomu interfejsu (bez edycji pliku JSON): model typu i model postaci gracza.
// Działają na surowym JSON-ie schematu, żeby zachować wszystko, czego edytor nie rozumie (dodatkowe pola gry).
// Czyste funkcje: zwracają nową kopię, nie zmieniają argumentu.
import { IDENTITY_TRANSFORM, type ModelTransform } from './schema';

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const same = (a: number[], b: number[]) => a.every((x, k) => x === b[k]);

/** Wpisuje model i ułożenie do obiektu schematu (`look` typu albo `player`); wartości domyślne usuwa. */
function writeModel(o: Obj, model: string | undefined, tr: ModelTransform): void {
  if (model) o.model = model;
  else delete o.model;
  const s = tr.scale;
  if (same(s, [1, 1, 1]) || !model) delete o.modelScale;
  else o.modelScale = s[0] === s[1] && s[1] === s[2] ? s[0] : [...s];
  if (same(tr.rotation, [0, 0, 0]) || !model) delete o.modelRotation;
  else o.modelRotation = [...tr.rotation];
  if (same(tr.offset, [0, 0, 0]) || !model) delete o.modelOffset;
  else o.modelOffset = [...tr.offset];
}

/** Przypisuje typowi obiektu model (albo go usuwa, gdy `model` puste) z ułożeniem względem punktu obiektu. */
export function setTypeModel(raw: unknown, typeId: string, model: string | undefined, tr: ModelTransform = IDENTITY_TRANSFORM): unknown {
  const out = structuredClone(raw) as Obj;
  const types = Array.isArray(out.objectTypes) ? out.objectTypes : [];
  const t = types.find((x) => isObj(x) && x.id === typeId) as Obj | undefined;
  if (!t) throw new Error(`Nieznany typ obiektu: ${typeId}`);
  if (!isObj(t.look)) t.look = {};
  writeModel(t.look as Obj, model, tr);
  return out;
}

/** Ustawia model postaci gracza (sekcja `player`); bez modelu postać jest kapsułą. */
export function setPlayerModel(raw: unknown, model: string | undefined, tr: ModelTransform = IDENTITY_TRANSFORM): unknown {
  const out = structuredClone(raw) as Obj;
  if (!isObj(out.player)) out.player = {};
  writeModel(out.player as Obj, model, tr);
  return out;
}
