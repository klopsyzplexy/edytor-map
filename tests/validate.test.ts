import { describe, expect, it } from 'vitest';
import { EditorDoc } from '../src/core/doc';
import { createMap } from '../src/core/map';
import { parseSchema, SchemaError } from '../src/core/schema';
import { validateMap } from '../src/core/validate';
import { exampleSchema } from './helpers';

function setup() {
  const schema = exampleSchema();
  const doc = new EditorDoc(schema, createMap(schema, { name: 't', size: [64, 64], resolution: 33, height: 0 }));
  return { schema, doc, codes: () => validateMap(schema, doc.map).map((i) => i.code) };
}

describe('walidacja mapy', () => {
  it('pusta mapa: brak startu (błąd) i brak generatora (ostrzeżenie)', () => {
    const { schema, doc } = setup();
    const issues = validateMap(schema, doc.map);
    expect(issues.find((i) => i.code === 'ruleCountMin' && i.params.type === 'start')?.level).toBe('error');
    expect(issues.find((i) => i.code === 'ruleCountMin' && i.params.type === 'generator')?.level).toBe('warning');
  });

  it('dwa starty: błąd wskazujący nadmiarowy obiekt', () => {
    const { schema, doc } = setup();
    doc.addObject('start', [1, 0, 1]);
    const second = doc.addObject('start', [3, 0, 3]);
    const i = validateMap(schema, doc.map).find((x) => x.code === 'ruleCountMax');
    expect(i?.objectId).toBe(second.id);
  });

  it('właściwości: wymagane, min, max, lista, odwołanie', () => {
    const { doc, codes } = setup();
    doc.addObject('start', [1, 0, 1]);
    const g = doc.addObject('generator', [10, 0, 10]);
    expect(codes()).toContain('propRequired');
    doc.updateObjects([g.id], (o) => {
      o.props.nazwa = 'A';
      o.props.liczba = 0;
      o.props.rodzaj = 'nieznany';
      o.props.obszar = 'brak';
    });
    expect(codes()).toEqual(expect.arrayContaining(['propMin', 'propEnum', 'refMissing']));
    doc.updateObjects([g.id], (o) => (o.props.liczba = 11));
    expect(codes()).toContain('propMax');
    const tree = doc.addObject('drzewo', [20, 0, 20]);
    doc.updateObjects([g.id], (o) => {
      o.props.liczba = 5;
      o.props.rodzaj = 'boss';
      o.props.obszar = tree.id;
    });
    expect(codes()).toEqual(['refWrongType']);
    const zone = doc.addObject('obszar', [0, 0, 0], [[1, 0, 1], [5, 0, 1], [5, 0, 5]]);
    doc.updateObjects([g.id], (o) => (o.props.obszar = zone.id));
    expect(codes()).toEqual([]);
  });

  it('ścieżki i strefy z za małą liczbą punktów, obiekt poza mapą, odległość', () => {
    const { doc, codes } = setup();
    doc.addObject('start', [1, 0, 1]);
    doc.addObject('trasa', [0, 0, 0], [[1, 0, 1]]);
    doc.addObject('obszar', [0, 0, 0], [[1, 0, 1], [2, 0, 2]]);
    doc.addObject('drzewo', [100, 0, 5]);
    const a = doc.addObject('generator', [10, 0, 10]);
    const b = doc.addObject('generator', [12, 0, 10]);
    doc.updateObjects([a.id, b.id], (o) => (o.props.nazwa = 'g'));
    expect(codes().sort()).toEqual(['outsideMap', 'pathTooShort', 'ruleMinDistance', 'zoneTooShort']);
  });
});

describe('walidacja schematu', () => {
  it('przykładowy schemat jest poprawny', () => {
    expect(exampleSchema().objectTypes.length).toBeGreaterThan(5);
  });

  it('zgłasza wszystkie problemy naraz', () => {
    try {
      parseSchema({
        id: 'x y',
        terrainLayers: [],
        objectTypes: [{ id: 'a', kind: 'kula', properties: [{ id: 'p', type: 'enum' }] }],
        rules: [{ type: 'count', objectType: 'b' }],
      });
      throw new Error('powinien rzucić');
    } catch (e) {
      expect(e).toBeInstanceOf(SchemaError);
      const p = (e as SchemaError).problems.join('\n');
      expect(p).toMatch(/"id"/);
      expect(p).toMatch(/terrainLayers/);
      expect(p).toMatch(/kind/);
      expect(p).toMatch(/options/);
      expect(p).toMatch(/nieznany objectType/);
    }
  });
});
