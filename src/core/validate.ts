// Walidacja mapy według schematu. Wynik to lista problemów z kodami; teksty tłumaczy interfejs.
import { insideMap, objectCenter, type MapData, type MapObject } from './map';
import { pointInPolygon } from './math';
import { getType, PLAYER_HEIGHT_M, type CountRule, type LocText, type Schema } from './schema';

export type IssueLevel = 'error' | 'warning';

export type IssueCode =
  | 'unknownType'
  | 'propRequired'
  | 'propMin'
  | 'propMax'
  | 'propType'
  | 'propEnum'
  | 'refMissing'
  | 'refWrongType'
  | 'pathTooShort'
  | 'zoneTooShort'
  | 'outsideMap'
  | 'ruleCountMin'
  | 'ruleCountMax'
  | 'ruleCountExact'
  | 'ruleCountRange'
  | 'teleportNoTarget'
  | 'playerScaleMismatch'
  | 'ruleMinDistance'
  | 'unknownLayer'
  | 'schemaMismatch';

export interface Issue {
  level: IssueLevel;
  code: IssueCode;
  /** Obiekt, którego dotyczy problem (kliknięcie przenosi do niego). */
  objectId?: string;
  /** Drugi obiekt (np. przy zasadzie odległości). */
  otherId?: string;
  propId?: string;
  /** Typ obiektu, którego dotyczy pole `propId`. */
  objectType?: string;
  params: Record<string, string | number>;
  /** Własny komunikat z zasady schematu. */
  message?: LocText;
}

export function validateMap(schema: Schema, map: MapData): Issue[] {
  const issues: Issue[] = [];
  const byId = new Map(map.objects.map((o) => [o.id, o]));

  if (map.schema.id && map.schema.id !== schema.id)
    issues.push({ level: 'warning', code: 'schemaMismatch', params: { map: map.schema.id, schema: schema.id } });
  for (const id of Object.keys(map.terrain.layers))
    if (!schema.terrainLayers.some((l) => l.id === id)) issues.push({ level: 'warning', code: 'unknownLayer', params: { layer: id } });

  for (const o of map.objects) {
    const t = getType(schema, o.type);
    const base = { objectId: o.id, params: { name: o.name } };
    if (!t) {
      issues.push({ ...base, level: 'error', code: 'unknownType', params: { name: o.name, type: o.type } });
      continue;
    }
    if (t.kind === 'path' && o.points.length < 2) issues.push({ ...base, level: 'error', code: 'pathTooShort' });
    if (t.kind === 'zone' && o.points.length < 3) issues.push({ ...base, level: 'error', code: 'zoneTooShort' });
    const pts = t.kind === 'path' || t.kind === 'zone' ? o.points : [o.position];
    if (pts.some((p) => !insideMap(map, p[0], p[2]))) issues.push({ ...base, level: 'warning', code: 'outsideMap' });

    for (const p of t.properties) {
      const v = o.props[p.id];
      const pb = { ...base, propId: p.id, objectType: o.type, params: { name: o.name, prop: p.id } };
      const empty = v === undefined || v === null || v === '';
      if (empty) {
        if (p.required) issues.push({ ...pb, level: 'error', code: 'propRequired' });
        continue;
      }
      switch (p.type) {
        case 'number':
          if (typeof v !== 'number' || !Number.isFinite(v)) issues.push({ ...pb, level: 'error', code: 'propType' });
          else {
            if (p.min !== undefined && v < p.min) issues.push({ ...pb, level: 'error', code: 'propMin', params: { ...pb.params, min: p.min, value: v } });
            if (p.max !== undefined && v > p.max) issues.push({ ...pb, level: 'error', code: 'propMax', params: { ...pb.params, max: p.max, value: v } });
          }
          break;
        case 'text':
          if (typeof v !== 'string') issues.push({ ...pb, level: 'error', code: 'propType' });
          else {
            if (p.min !== undefined && v.length < p.min) issues.push({ ...pb, level: 'error', code: 'propMin', params: { ...pb.params, min: p.min, value: v.length } });
            if (p.max !== undefined && v.length > p.max) issues.push({ ...pb, level: 'error', code: 'propMax', params: { ...pb.params, max: p.max, value: v.length } });
          }
          break;
        case 'bool':
          if (typeof v !== 'boolean') issues.push({ ...pb, level: 'error', code: 'propType' });
          break;
        case 'color':
          if (typeof v !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(v)) issues.push({ ...pb, level: 'error', code: 'propType' });
          break;
        case 'enum':
          if (!p.options?.some((op) => op.value === v)) issues.push({ ...pb, level: 'error', code: 'propEnum', params: { ...pb.params, value: String(v) } });
          break;
        case 'ref': {
          const target = typeof v === 'string' ? byId.get(v) : undefined;
          if (!target) issues.push({ ...pb, level: 'error', code: 'refMissing', params: { ...pb.params, value: String(v) } });
          else if (p.refTypes?.length && !p.refTypes.includes(target.type))
            issues.push({ ...pb, otherId: target.id, level: 'error', code: 'refWrongType', params: { ...pb.params, target: target.name, type: target.type } });
          break;
        }
      }
    }
  }

  // przelicznik ze schematu nie zgadza się z wysokością postaci (1,8 m)
  if (schema.scale.source === 'schema') {
    const m = schema.player.height / schema.scale.unitsPerMeter;
    if (Math.abs(m - PLAYER_HEIGHT_M) > PLAYER_HEIGHT_M * 0.1)
      issues.push({ level: 'warning', code: 'playerScaleMismatch', params: { height: Math.round(m * 100) / 100, expected: PLAYER_HEIGHT_M } });
  }

  // przejścia bez celu
  for (const o of map.objects) {
    const t = getType(schema, o.type);
    if (t?.behavior?.type !== 'teleport') continue;
    const v = o.props[t.behavior.target];
    if (v === null || v === undefined || v === '') issues.push({ level: 'warning', code: 'teleportNoTarget', objectId: o.id, params: { name: o.name } });
  }

  for (const r of schema.rules) {
    const ofType = map.objects.filter((o) => o.type === r.objectType);
    if (r.type === 'count') {
      if (!r.within) checkCount(issues, r, ofType);
      else
        for (const zone of map.objects.filter((o) => o.type === r.within && o.points.length >= 3)) {
          const inside = ofType.filter((o) => {
            const c = objectCenter(o);
            return pointInPolygon(c[0], c[2], zone.points);
          });
          checkCount(issues, r, inside, zone);
        }
    } else if (r.type === 'minDistance') {
      const others = r.otherType ? map.objects.filter((o) => o.type === r.otherType) : ofType;
      for (const a of ofType)
        for (const b of others) {
          if (a === b || (!r.otherType && a.id > b.id)) continue;
          const d = flatDistance(a, b);
          if (d < r.distance)
            issues.push({
              level: r.level,
              code: 'ruleMinDistance',
              objectId: a.id,
              otherId: b.id,
              params: { name: a.name, other: b.name, distance: r.distance, actual: Math.round(d * 100) / 100 },
              message: r.message,
            });
        }
    }
  }
  return issues;
}

function flatDistance(a: MapObject, b: MapObject): number {
  const pa = objectCenter(a);
  const pb = objectCenter(b);
  return Math.hypot(pa[0] - pb[0], pa[2] - pb[2]);
}

/** Rodzaj zasady liczebności: dokładnie N, co najmniej N, co najwyżej N albo przedział N–M. */
export function countRuleKind(r: CountRule): 'exact' | 'min' | 'max' | 'range' {
  if (r.exactly !== undefined || (r.min !== undefined && r.min === r.max)) return 'exact';
  if (r.min !== undefined && r.max !== undefined) return 'range';
  return r.min !== undefined ? 'min' : 'max';
}

const COUNT_CODES = { exact: 'ruleCountExact', min: 'ruleCountMin', max: 'ruleCountMax', range: 'ruleCountRange' } as const;

/** Sprawdza liczebność; `zone` – strefa, w której liczono (zasada z `within`). */
function checkCount(issues: Issue[], r: CountRule, objs: MapObject[], zone?: MapObject): void {
  const kind = countRuleKind(r);
  const min = r.exactly ?? r.min;
  const max = r.exactly ?? r.max;
  const code = COUNT_CODES[kind];
  const params: Issue['params'] = { type: r.objectType, count: objs.length };
  if (min !== undefined) params.min = min;
  if (max !== undefined) params.max = max;
  if (zone) params.zone = zone.name;
  const base = { level: r.level, code, message: r.message } as const;
  if (min !== undefined && objs.length < min)
    // za mało: wskazujemy strefę (zasada w strefie) albo pierwszy obiekt typu
    issues.push({ ...base, objectId: zone?.id ?? objs[0]?.id, params: { ...params, problem: 'tooFew' } });
  if (max !== undefined && objs.length > max)
    // za dużo: każdy nadmiarowy obiekt osobno (kliknięcie przenosi do niego)
    for (const extra of objs.slice(max)) issues.push({ ...base, objectId: extra.id, otherId: zone?.id, params: { ...params, problem: 'tooMany', name: extra.name } });
}
