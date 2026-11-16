import { describe, expect, it } from 'vitest';
import { EditorDoc } from '../src/core/doc';
import { createMap } from '../src/core/map';
import { simplify, smoothPoints, pointInPolygon, solidFootprint } from '../src/core/collision';
import { getType } from '../src/core/schema';
import { exampleSchema } from './helpers';

function doc() {
  const schema = exampleSchema();
  return new EditorDoc(schema, createMap(schema, { name: 't', size: [32, 32], resolution: 33, height: 0 }));
}

describe('drzewo grup', () => {
  it('grupy zagnieżdżone, ukrywanie i blokowanie dziedziczone', () => {
    const d = doc();
    const a = d.addObject('drzewo', [1, 0, 1]);
    const b = d.addObject('kamien', [2, 0, 2]);
    const inner = d.groupObjects([a.id], 'Wewnętrzna')!;
    const outer = d.groupObjects([b.id], 'Zewnętrzna', [inner.id])!;
    expect(d.getGroup(inner.id)!.parent).toBe(outer.id);
    expect(d.groupObjectIds(outer.id).sort()).toEqual([a.id, b.id].sort());
    d.updateGroup(outer.id, { hidden: true });
    expect(d.isVisible(d.getObject(a.id)!)).toBe(false);
    d.updateGroup(outer.id, { hidden: false, locked: true });
    expect(d.isVisible(d.getObject(a.id)!)).toBe(true);
    expect(d.isPickable(d.getObject(a.id)!)).toBe(false);
  });

  it('przeciąganie: nie da się wrzucić grupy do jej podgrupy; zmiana kolejności', () => {
    const d = doc();
    const a = d.addObject('drzewo', [1, 0, 1]);
    const b = d.addObject('kamien', [2, 0, 2]);
    const c = d.addObject('kamien', [3, 0, 3]);
    const g1 = d.groupObjects([a.id], 'G1')!;
    const g2 = d.groupObjects([b.id], 'G2')!;
    expect(d.moveToGroup([], [g2.id], g1.id)).toBe(true);
    expect(d.moveToGroup([], [g1.id], g2.id)).toBe(false);
    expect(d.moveToGroup([c.id], [], null, { kind: 'object', id: a.id })).toBe(true);
    expect(d.map.objects.map((o) => o.id)).toEqual([c.id, a.id, b.id]);
    // cofnij przywraca poprzedni stan jednym krokiem
    d.undo();
    expect(d.map.objects.map((o) => o.id)).toEqual([a.id, b.id, c.id]);
  });

  it('rozgrupowanie przenosi zawartość poziom wyżej', () => {
    const d = doc();
    const a = d.addObject('drzewo', [1, 0, 1]);
    const inner = d.groupObjects([a.id], 'In')!;
    const outer = d.groupObjects([], 'Out', [inner.id])!;
    d.ungroup(inner.id);
    expect(d.getObject(a.id)!.group).toBe(outer.id);
  });

  it('wklejenie całej grupy tworzy kopię struktury z nowymi id', () => {
    const d = doc();
    const a = d.addObject('drzewo', [1, 0, 1]);
    const b = d.addObject('kamien', [2, 0, 2]);
    const inner = d.groupObjects([a.id], 'In')!;
    const outer = d.groupObjects([b.id], 'Out', [inner.id])!;
    const groups = d.fullGroups(d.groupObjectIds(outer.id));
    expect(groups.map((g) => g.id).sort()).toEqual([inner.id, outer.id].sort());
    const copies = d.pasteObjects([d.getObject(a.id)!, d.getObject(b.id)!], [5, 0, 0], groups);
    expect(d.map.groups).toHaveLength(4);
    const ca = copies[0];
    const newInner = d.getGroup(ca.group)!;
    expect(newInner.id).not.toBe(inner.id);
    expect(newInner.parent).not.toBe(outer.id);
    expect(d.getGroup(newInner.parent)!.name).toBe('Out');
  });
});

describe('kształty kolizji', () => {
  it('upraszcza i wygładza łamane', () => {
    const line: [number, number, number][] = [[0, 0, 0], [1, 0, 0.01], [2, 0, 0], [3, 0, 0]];
    expect(simplify(line, 0.1)).toEqual([[0, 0, 0], [3, 0, 0]]);
    const sq: [number, number, number][] = [[0, 0, 0], [4, 0, 0], [4, 0, 4], [0, 0, 4]];
    const sm = smoothPoints(sq, true, 1);
    expect(sm).toHaveLength(8);
    expect(sm[0]).toEqual([1, 0, 0]);
    expect(smoothPoints([[0, 0, 0], [4, 0, 0], [4, 0, 4]], false, 1)[0]).toEqual([0, 0, 0]);
  });

  it('obrys bryły po obrocie', () => {
    const schema = exampleSchema();
    const d = doc();
    const wall = d.addObject('sciana', [10, 0, 10]);
    d.updateObjects([wall.id], (o) => (o.rotation = [0, 90, 0]));
    const t = getType(schema, 'sciana')!;
    const fp = solidFootprint(t, d.getObject(wall.id)!);
    const [w, , dd] = t.defaultSize;
    // po obrocie o 90° szerokość leży wzdłuż osi Z
    const xs = fp.map((p) => p[0]);
    const zs = fp.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(dd);
    expect(Math.max(...zs) - Math.min(...zs)).toBeCloseTo(w);
    expect(pointInPolygon(10, 10, fp)).toBe(true);
  });
});
