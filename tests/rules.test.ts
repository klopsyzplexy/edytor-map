import { describe, expect, it } from 'vitest';
import raw from '../examples/schemat-przyklad.json';
import { EditorDoc } from '../src/core/doc';
import { createMap } from '../src/core/map';
import { parseSchema, SchemaError } from '../src/core/schema';
import { countRuleKind, validateMap } from '../src/core/validate';

function withRules(rules: unknown[]) {
  const r = structuredClone(raw) as Record<string, unknown>;
  r.rules = rules;
  const schema = parseSchema(r);
  const doc = new EditorDoc(schema, createMap(schema, { name: 't', size: [64, 64], resolution: 17, height: 0 }));
  const issues = () => validateMap(schema, doc.map).filter((i) => i.code.startsWith('ruleCount'));
  return { schema, doc, issues };
}

describe('zasady liczebności', () => {
  it('dokładnie N: za mało i za dużo, kod ruleCountExact', () => {
    const { doc, issues } = withRules([{ type: 'count', objectType: 'drzewo', exactly: 2 }]);
    doc.addObject('drzewo', [1, 0, 1]);
    expect(issues().map((i) => [i.code, i.params.problem])).toEqual([['ruleCountExact', 'tooFew']]);
    doc.addObject('drzewo', [2, 0, 1]);
    expect(issues()).toEqual([]);
    const third = doc.addObject('drzewo', [3, 0, 1]);
    expect(issues().map((i) => [i.code, i.params.problem, i.objectId])).toEqual([['ruleCountExact', 'tooMany', third.id]]);
  });

  it('co najmniej, co najwyżej, przedział', () => {
    const min = withRules([{ type: 'count', objectType: 'drzewo', min: 1 }]);
    expect(min.issues()[0].code).toBe('ruleCountMin');
    const max = withRules([{ type: 'count', objectType: 'drzewo', max: 1 }]);
    max.doc.addObject('drzewo', [1, 0, 1]);
    expect(max.issues()).toEqual([]);
    max.doc.addObject('drzewo', [2, 0, 1]);
    expect(max.issues()[0].code).toBe('ruleCountMax');
    const range = withRules([{ type: 'count', objectType: 'drzewo', min: 2, max: 3 }]);
    range.doc.addObject('drzewo', [1, 0, 1]);
    expect(range.issues().map((i) => [i.code, i.params.problem])).toEqual([['ruleCountRange', 'tooFew']]);
    for (let k = 0; k < 3; k++) range.doc.addObject('drzewo', [2 + k, 0, 1]);
    expect(range.issues().map((i) => [i.code, i.params.problem])).toEqual([['ruleCountRange', 'tooMany']]);
  });

  it('min = max to „dokładnie”', () => {
    expect(countRuleKind({ type: 'count', objectType: 'a', min: 1, max: 1, level: 'error' })).toBe('exact');
  });

  it('w obrębie strefy: liczone osobno w każdej strefie', () => {
    const { doc, issues } = withRules([{ type: 'count', objectType: 'generator', exactly: 1, within: 'obszar' }]);
    const a = doc.addObject('obszar', [0, 0, 0], [[0, 0, 0], [10, 0, 0], [10, 0, 10], [0, 0, 10]]);
    const b = doc.addObject('obszar', [0, 0, 0], [[20, 0, 0], [30, 0, 0], [30, 0, 10], [20, 0, 10]]);
    doc.addObject('generator', [5, 0, 5]);
    doc.addObject('generator', [40, 0, 40]); // poza strefami – nie liczy się
    const list = issues();
    expect(list.length).toBe(1);
    expect(list[0].objectId).toBe(b.id);
    expect(list[0].params.zone).toBe(b.name);
    doc.addObject('generator', [6, 0, 6]);
    expect(issues().some((i) => i.otherId === a.id && i.params.problem === 'tooMany')).toBe(true);
  });

  it('błędy schematu: exactly z min, ujemne, within nie-strefa', () => {
    const bad = (rule: unknown) => {
      const r = structuredClone(raw) as Record<string, unknown>;
      r.rules = [rule];
      try {
        parseSchema(r);
        return '';
      } catch (e) {
        return (e as SchemaError).problems.join('\n');
      }
    };
    expect(bad({ type: 'count', objectType: 'drzewo', exactly: 1, min: 1 })).toMatch(/exactly/);
    expect(bad({ type: 'count', objectType: 'drzewo', min: -1 })).toMatch(/min/);
    expect(bad({ type: 'count', objectType: 'drzewo', min: 3, max: 1 })).toMatch(/min większe/);
    expect(bad({ type: 'count', objectType: 'drzewo', min: 1, within: 'drzewo' })).toMatch(/within/);
  });
});

describe('skala świata w schemacie', () => {
  const parse = (patch: Record<string, unknown>) => parseSchema({ ...structuredClone(raw), ...patch });

  it('przelicznik z pola, z wysokości postaci albo domyślny', () => {
    expect(parse({ scale: { unitsPerMeter: 32 } }).scale).toMatchObject({ unitsPerMeter: 32, source: 'schema' });
    expect(parse({ scale: undefined, player: { height: 3.6 } }).scale).toMatchObject({ unitsPerMeter: 2, source: 'player' });
    expect(parse({ scale: undefined, player: {} }).scale).toMatchObject({ unitsPerMeter: 1, source: 'default' });
  });

  it('defaultSize w metrach × przelicznik; postać domyślnie 1,8 m', () => {
    const s = parse({ scale: { unitsPerMeter: 10 }, player: {} });
    const tree = s.objectTypes.find((t) => t.id === 'drzewo')!;
    expect(tree.defaultSizeM).toEqual([1.6, 3, 1.6]);
    expect(tree.defaultSize).toEqual([16, 30, 16]);
    expect(s.player.height).toBeCloseTo(18);
    expect(s.player.radius).toBeCloseTo(4);
  });

  it('kategorie: domyślne, zmienione po id i nowe', () => {
    const s = parse({ scale: { categories: [{ id: 'drzewo', size: 12 }, { id: 'lampa', size: 3, name: 'Lampa' }] } });
    const ids = s.scale.categories.map((c) => c.id);
    expect(ids).toEqual(expect.arrayContaining(['postac', 'drzewo', 'krzew', 'skala', 'plot', 'budynek', 'lampa']));
    expect(s.scale.categories.find((c) => c.id === 'drzewo')).toMatchObject({ size: 12, min: undefined });
    expect(s.scale.categories.find((c) => c.id === 'budynek')!.measure).toBe('width');
  });

  it('niezgodna wysokość postaci → ostrzeżenie', () => {
    const s = parse({ scale: { unitsPerMeter: 1 }, player: { height: 5 } });
    const map = createMap(s, { name: 't', size: [8, 8], resolution: 5, height: 0 });
    expect(validateMap(s, map).some((i) => i.code === 'playerScaleMismatch')).toBe(true);
  });
});

describe('zachowania typów', () => {
  const types = (extra: unknown[]) => ({ ...structuredClone(raw), objectTypes: [...structuredClone(raw.objectTypes), ...extra] });
  const portal = {
    id: 'portal', name: 'Portal', kind: 'point', behavior: { type: 'teleport', target: 'cel' },
    properties: [{ id: 'cel', name: 'Cel', type: 'ref', refTypes: ['portal', 'start'] }],
  };
  const region = {
    id: 'kraina', name: 'Kraina', kind: 'zone', behavior: { type: 'message', text: 'nazwa' },
    properties: [{ id: 'nazwa', name: 'Nazwa', type: 'text' }],
  };

  it('poprawne zachowania', () => {
    const s = parseSchema(types([portal, region]));
    expect(s.objectTypes.find((t) => t.id === 'portal')!.behavior).toEqual({ type: 'teleport', target: 'cel' });
    expect(s.objectTypes.find((t) => t.id === 'kraina')!.behavior).toEqual({ type: 'message', text: 'nazwa' });
  });

  it('błędne: cel nie jest odwołaniem, komunikat poza strefą', () => {
    expect(() => parseSchema(types([{ ...portal, behavior: { type: 'teleport', target: 'brak' } }]))).toThrow(/teleport/);
    expect(() => parseSchema(types([{ ...region, kind: 'point' }]))).toThrow(/message/);
  });

  it('przejście bez celu → ostrzeżenie walidacji', () => {
    const s = parseSchema(types([portal]));
    const doc = new EditorDoc(s, createMap(s, { name: 't', size: [16, 16], resolution: 5, height: 0 }));
    doc.addObject('portal', [1, 0, 1]);
    expect(validateMap(s, doc.map).some((i) => i.code === 'teleportNoTarget')).toBe(true);
  });
});
