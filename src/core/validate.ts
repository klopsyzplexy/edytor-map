// Walidacja mapy według schematu. Wynik to lista problemów z kodami; teksty tłumaczy interfejs.
import { insideMap, objectCenter, type MapData, type MapObject } from './map';
import { getType, type LocText, type Schema } from './schema';

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
      const pb = { ...base, propId: p.id, params: { name: o.name, prop: p.id } };
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

  for (const r of schema.rules) {
    const ofType = map.objects.filter((o) => o.type === r.objectType);
    if (r.type === 'count') {
      if (r.min !== undefined && ofType.length < r.min)
        issues.push({ level: r.level, code: 'ruleCountMin', params: { type: r.objectType, min: r.min, count: ofType.length }, message: r.message, objectId: ofType[0]?.id });
      if (r.max !== undefined && ofType.length > r.max)
        for (const extra of ofType.slice(r.max))
          issues.push({ level: r.level, code: 'ruleCountMax', objectId: extra.id, params: { type: r.objectType, max: r.max, count: ofType.length, name: extra.name }, message: r.message });
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
