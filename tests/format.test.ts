import { describe, expect, it } from 'vitest';
import { decodeF32, encodeF32 } from '../src/core/binary';
import { deserializeMap, mapToJson, parseMap, serializeMap, MapFormatError, FORMAT_VERSION } from '../src/core/format';
import { createMap, type MapData } from '../src/core/map';
import { applyHeightBrush, computeSlopeMask, paintLayer } from '../src/core/terrain';
import { collectWalkable } from '../src/core/walkable';
import { EditorDoc } from '../src/core/doc';
import { exampleSchema } from './helpers';

function sampleMap(): MapData {
  const schema = exampleSchema();
  const map = createMap(schema, { name: 'Test', size: [48, 32], resolution: 65, height: 1.25 });
  const doc = new EditorDoc(schema, map);
  const brush = { radius: 6, strength: 0.8, softness: 0.5, target: 3 };
  applyHeightBrush(map, 'raise', 10, 10, brush, 0.5);
  applyHeightBrush(map, 'noise', 30, 20, brush, 0.3);
  paintLayer(map, 'woda', 20, 16, brush, 0.4);
  paintLayer(map, 'piasek', 24, 12, brush, 0.2);
  const start = doc.addObject('start', [5, 1.25, 5]);
  const gen = doc.addObject('generator', [20.123456789, 2, 7.5]);
  const zone = doc.addObject('obszar', [0, 0, 0], [[1, 1, 1], [10, 1, 1], [10, 1.5, 10]]);
  doc.addObject('trasa', [0, 0, 0], [[2, 1, 2], [8, 2, 3]]);
  doc.addObject('most', [16, 1.5, 16]);
  doc.updateObjects([gen.id], (o) => {
    o.props.nazwa = 'Gniazdo „żółwi” 🐢';
    o.props.obszar = zone.id;
    o.rotation = [0, 33.3333, 0];
    o.scale = [1.5, 1, 0.75];
  });
  doc.groupObjects([start.id, gen.id], 'Grupa A');
  doc.updateSettings((s) => (s.slope = { enabled: true, maxDeg: 35 }));
  return map;
}

describe('format mapy', () => {
  it('base64 Float32 jest bezstratny', () => {
    const a = new Float32Array([0, -1.5, 3.14159, 1e-7, 123456.789, -0]);
    expect(Array.from(decodeF32(encodeF32(a)))).toEqual(Array.from(a));
  });

  it('zapis → odczyt daje tę samą mapę', () => {
    const map = sampleMap();
    const back = parseMap(mapToJson(map));
    expect(back.settings).toEqual(map.settings);
    expect(back.groups).toEqual(map.groups);
    expect(back.objects).toEqual(map.objects);
    expect(back.schema).toEqual(map.schema);
    expect(back.terrain.nx).toBe(map.terrain.nx);
    expect(Array.from(back.terrain.heights)).toEqual(Array.from(map.terrain.heights));
    for (const id of Object.keys(map.terrain.layers)) expect(Array.from(back.terrain.layers[id])).toEqual(Array.from(map.terrain.layers[id]));
  });

  it('zapis → odczyt → zapis daje identyczny plik (także z danymi pochodnymi)', () => {
    const schema = exampleSchema();
    const map = sampleMap();
    const derived = { blocked: computeSlopeMask(map), walkable: collectWalkable(schema, map) };
    const a = mapToJson(map, derived, '0.1.0');
    const b = mapToJson(parseMap(a), derived, '0.1.0');
    expect(b).toBe(a);
  });

  it('eksport zawiera maskę nieprzechodniości i powierzchnie chodliwe', () => {
    const schema = exampleSchema();
    const map = sampleMap();
    const derived = { blocked: computeSlopeMask(map), walkable: collectWalkable(schema, map) };
    const f = serializeMap(map, derived);
    expect(f.formatVersion).toBe(FORMAT_VERSION);
    expect(f.derived?.blocked).toBeTypeOf('string');
    expect(f.derived?.walkable).toHaveLength(1);
    expect(f.derived?.walkable?.[0].triangles).toHaveLength(18);
    // Most 3 × 0,3 × 8 stoi na wysokości 1,5 → górna ściana na 1,8
    expect(f.derived!.walkable![0].triangles[1]).toBeCloseTo(1.8);
  });

  it('odrzuca złe pliki z czytelnym komunikatem', () => {
    expect(() => parseMap('nie json')).toThrow(MapFormatError);
    expect(() => deserializeMap({ format: 'inny' })).toThrow(/edytor-map/);
    const f = serializeMap(sampleMap());
    expect(() => deserializeMap({ ...f, formatVersion: FORMAT_VERSION + 1 })).toThrow(/nowszą wersję/);
    expect(() => deserializeMap({ ...f, terrain: { ...f.terrain, resolution: [3, 3] } })).toThrow(/heights/);
  });

  it('uzupełnia brakujące pola obiektów wartościami domyślnymi', () => {
    const f = serializeMap(sampleMap());
    const raw = JSON.parse(JSON.stringify(f));
    raw.objects = [{ id: 'x', type: 'drzewo' }];
    const m = deserializeMap(raw);
    expect(m.objects[0]).toMatchObject({ name: 'x', position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], points: [], group: null });
  });
});
