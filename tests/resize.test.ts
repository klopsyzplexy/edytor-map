import { describe, expect, it } from 'vitest';
import { EditorDoc } from '../src/core/doc';
import { createMap, heightAt } from '../src/core/map';
import { RESIZE_WARN_POINTS, resizeMap, resizedResolution } from '../src/core/resize';
import { applyHeightBrush, paintLayer } from '../src/core/terrain';
import { exampleSchema } from './helpers';

function setup() {
  const schema = exampleSchema();
  const map = createMap(schema, { name: 't', size: [32, 32], resolution: 33, height: 0 });
  const doc = new EditorDoc(schema, map);
  applyHeightBrush(map, 'raise', 16, 16, { radius: 5, strength: 1, softness: 0.5, target: 0 }, 1);
  paintLayer(map, 'piasek', 4, 4, { radius: 2, strength: 1, softness: 0, target: 0 }, 1);
  const tree = doc.addObject('drzewo', [16, heightAt(map, 16, 16), 16]);
  const zone = doc.addObject('obszar', [0, 0, 0], [[2, 0, 2], [10, 0, 2], [10, 0, 10]]);
  return { schema, map, doc, tree, zone };
}
const base = { fillLayer: 'trawa', fillHeight: 0 };

describe('zmiana rozmiaru mapy', () => {
  it('rozszerz od środka o 50%: teren bez zmian w środku, nowe brzegi płaskie, obiekty przesunięte razem z terenem', () => {
    const { schema, map, tree, zone } = setup();
    const h0 = heightAt(map, 16, 16);
    const r = resizeMap(schema, map, { ...base, width: 48, depth: 48, mode: 'expand', anchor: 'center' });
    expect(r.size).toEqual([48, 48]);
    expect([r.terrain.nx, r.terrain.nz]).toEqual([49, 49]); // gęstość 1 punkt na jednostkę
    const at = (x: number, z: number) => r.terrain.heights[z * r.terrain.nx + x];
    expect(at(24, 24)).toBeCloseTo(h0);
    expect(at(0, 0)).toBe(0);
    expect(r.terrain.layers.trawa[0]).toBe(255);
    expect(r.terrain.layers.piasek[(4 + 8) * 49 + 4 + 8]).toBe(map.terrain.layers.piasek[4 * 33 + 4]);
    expect(r.objects.length).toBe(2);
    expect(r.objects.find((o) => o.id === tree.id)!.position).toEqual([24, tree.position[1], 24]);
    expect(r.objects.find((o) => o.id === zone.id)!.points[0]).toEqual([10, 0, 10]);
  });

  it('rozszerz od rogu: stara mapa w rogu (0, 0), nowy teren z wybraną warstwą i wysokością', () => {
    const { schema, map, tree } = setup();
    const r = resizeMap(schema, map, { width: 64, depth: 48, mode: 'expand', anchor: 'nw', fillLayer: 'piasek', fillHeight: 2 });
    expect(r.objects.find((o) => o.id === tree.id)!.position[0]).toBe(16);
    expect(r.terrain.heights[r.terrain.nx - 1]).toBe(2);
    expect(r.terrain.layers.piasek[r.terrain.nx - 1]).toBe(255);
    const se = resizeMap(schema, map, { ...base, width: 64, depth: 64, mode: 'expand', anchor: 'se' });
    expect(se.objects.find((o) => o.id === tree.id)!.position).toEqual([48, tree.position[1], 48]);
  });

  it('rozciągnij ×2: pozycje skalowane, rozmiary obiektów bez zmian, teren rozciągnięty', () => {
    const { schema, map, tree } = setup();
    const h0 = heightAt(map, 16, 16);
    const r = resizeMap(schema, map, { ...base, width: 64, depth: 64, mode: 'stretch', anchor: 'center' });
    const t2 = r.objects.find((o) => o.id === tree.id)!;
    expect(t2.position[0]).toBe(32);
    expect(t2.scale).toEqual([1, 1, 1]);
    expect(r.terrain.heights[32 * r.terrain.nx + 32]).toBeCloseTo(h0);
  });

  it('cofnij przywraca rozmiar, teren i obiekty; ponów – nowy stan', () => {
    const { schema, map, doc } = setup();
    const heights = map.terrain.heights.slice();
    const objects = structuredClone(map.objects);
    doc.resize(resizeMap(schema, map, { ...base, width: 64, depth: 40, mode: 'expand', anchor: 'center' }));
    expect(doc.map.settings.size).toEqual([64, 40]);
    expect(doc.map.settings.resolution).toEqual([65, 41]);
    doc.undo();
    expect(doc.map.settings.size).toEqual([32, 32]);
    expect(doc.map.terrain.heights).toEqual(heights);
    expect(doc.map.objects).toEqual(objects);
    doc.redo();
    expect(doc.map.terrain.nx).toBe(65);
  });

  it('własna liczba punktów i próg wydajności', () => {
    const { map } = setup();
    expect(resizedResolution(map, 64, 32, 33)).toEqual([33, 17]);
    const [nx, nz] = resizedResolution(map, 2048, 2048);
    expect(nx * nz).toBeGreaterThan(RESIZE_WARN_POINTS);
  });
});
