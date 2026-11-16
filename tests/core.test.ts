import { describe, expect, it } from 'vitest';
import { EditorDoc } from '../src/core/doc';
import { createMap, heightAt } from '../src/core/map';
import { rotateXYZ } from '../src/core/math';
import { applyHeightBrush, computeSlopeMask, paintLayer, raycastTerrain } from '../src/core/terrain';
import { exampleSchema } from './helpers';

function setup() {
  const schema = exampleSchema();
  const map = createMap(schema, { name: 't', size: [32, 32], resolution: 33, height: 0 });
  return { schema, map, doc: new EditorDoc(schema, map) };
}
const brush = { radius: 5, strength: 1, softness: 0.5, target: 2 };

describe('teren', () => {
  it('podnieś, obniż, wyrównaj', () => {
    const { map } = setup();
    applyHeightBrush(map, 'raise', 16, 16, brush, 1);
    const h = heightAt(map, 16, 16);
    expect(h).toBeGreaterThan(0);
    expect(heightAt(map, 2, 2)).toBe(0);
    applyHeightBrush(map, 'lower', 16, 16, brush, 0.5);
    expect(heightAt(map, 16, 16)).toBeLessThan(h);
    for (let k = 0; k < 50; k++) applyHeightBrush(map, 'flatten', 16, 16, brush, 0.1);
    expect(heightAt(map, 16, 16)).toBeCloseTo(2, 2);
  });

  it('malowanie warstwy zachowuje sumę wag ≈ 255', () => {
    const { map } = setup();
    for (let k = 0; k < 10; k++) paintLayer(map, 'woda', 16, 16, brush, 0.1);
    const idx = 16 * map.terrain.nx + 16;
    expect(map.terrain.layers.woda[idx]).toBe(255);
    expect(map.terrain.layers.trawa[idx]).toBe(0);
  });

  it('strome zbocza trafiają do maski', () => {
    const { map } = setup();
    for (let k = 0; k < 10; k++) applyHeightBrush(map, 'raise', 16, 16, { ...brush, softness: 0.2 }, 1);
    const mask = computeSlopeMask(map, 40);
    expect(mask.some((v) => v === 255)).toBe(true);
    expect(mask[0]).toBe(0);
  });

  it('promień z góry trafia w teren', () => {
    const { map } = setup();
    applyHeightBrush(map, 'raise', 10, 10, brush, 1);
    const hit = raycastTerrain(map, [10, 50, 10], [0, -1, 0]);
    expect(hit![1]).toBeCloseTo(heightAt(map, 10, 10), 3);
    const slanted = raycastTerrain(map, [-10, 20, 16], [1, -1, 0]);
    expect(slanted![0]).toBeCloseTo(10, 1);
    expect(raycastTerrain(map, [-10, 20, 16], [-1, -1, 0])).toBeNull();
  });
});

describe('dokument i historia', () => {
  it('cofnij/ponów obiektów', () => {
    const { doc } = setup();
    const o = doc.addObject('drzewo', [1, 0, 1]);
    doc.updateObjects([o.id], (x) => (x.position = [5, 0, 5]));
    doc.undo();
    expect(doc.getObject(o.id)!.position).toEqual([1, 0, 1]);
    doc.undo();
    expect(doc.map.objects).toHaveLength(0);
    doc.redo();
    doc.redo();
    expect(doc.getObject(o.id)!.position).toEqual([5, 0, 5]);
  });

  it('cofnij pociągnięcia pędzlem', () => {
    const { doc, map } = setup();
    doc.beginStroke();
    doc.strokeChanged(applyHeightBrush(map, 'raise', 16, 16, brush, 1), 'heights');
    doc.strokeChanged(paintLayer(map, 'piasek', 16, 16, brush, 1), 'layers');
    doc.endStroke('heights');
    const raised = heightAt(map, 16, 16);
    doc.undo();
    expect(heightAt(map, 16, 16)).toBe(0);
    expect(map.terrain.layers.piasek.every((v) => v === 0)).toBe(true);
    doc.redo();
    expect(heightAt(map, 16, 16)).toBe(raised);
  });

  it('wklejanie przepina odwołania na kopie', () => {
    const { doc } = setup();
    const z = doc.addObject('obszar', [0, 0, 0], [[1, 0, 1], [4, 0, 1], [4, 0, 4]]);
    const g = doc.addObject('generator', [2, 0, 2]);
    doc.updateObjects([g.id], (o) => (o.props.obszar = z.id));
    const copies = doc.pasteObjects([z, g], [10, 0, 0]);
    const gc = copies.find((c) => c.type === 'generator')!;
    expect(gc.props.obszar).toBe(copies[0].id);
    expect(gc.position).toEqual([12, 0, 2]);
    expect(doc.selection).toEqual(copies.map((c) => c.id));
  });

  it('grupy ukrywają i blokują obiekty', () => {
    const { doc } = setup();
    const o = doc.addObject('drzewo', [1, 0, 1]);
    const g = doc.groupObjects([o.id], 'G')!;
    doc.updateGroup(g.id, { locked: true });
    expect(doc.isPickable(o)).toBe(false);
    expect(doc.isVisible(o)).toBe(true);
    doc.updateGroup(g.id, { hidden: true });
    expect(doc.isVisible(doc.getObject(o.id)!)).toBe(false);
  });

  it('obrót XYZ zgodny z konwencją Three.js', () => {
    const r = rotateXYZ([1, 0, 0], [0, 90, 0]);
    expect(r[0]).toBeCloseTo(0);
    expect(r[2]).toBeCloseTo(-1);
  });
});

import * as THREE from 'three';
describe('zgodność z Three.js', () => {
  it('rotateXYZ = THREE.Euler XYZ dla dowolnych kątów', () => {
    const v = new THREE.Vector3(0.3, -1.2, 2.5).applyEuler(new THREE.Euler(0.4, -1.1, 2.0, 'XYZ'));
    const r = rotateXYZ([0.3, -1.2, 2.5], [(0.4 * 180) / Math.PI, (-1.1 * 180) / Math.PI, (2.0 * 180) / Math.PI]);
    expect(r[0]).toBeCloseTo(v.x, 6);
    expect(r[1]).toBeCloseTo(v.y, 6);
    expect(r[2]).toBeCloseTo(v.z, 6);
  });
});
