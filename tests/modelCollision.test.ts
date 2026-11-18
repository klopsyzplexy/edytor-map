import { describe, expect, it } from 'vitest';
import { fileURLToPath } from 'node:url';
import { collectCollision, DECORATION, distToSegment, modelOutline, pointInPolygon, type ModelOutlineProvider } from '../src/core/collision';
import { EditorDoc } from '../src/core/doc';
import { deserializeMap, mapToJson, parseMap, serializeMap } from '../src/core/format';
import { createMap, type MapObject, type Vec3 } from '../src/core/map';
import { collisionBand, computeOutline, polygonArea, sliceBand, type Outline, type Pt } from '../src/core/modelCollision';
import { modelToWorld, objectModel } from '../src/core/objectModel';
import { buildTriggers } from '../src/core/triggers';
import { glbTriangles } from './glb';
import { exampleSchema } from './helpers';

const model = (name: string) => glbTriangles(fileURLToPath(new URL(`../examples/modele/${name}.glb`, import.meta.url)));
const PLAYER_H = 1.8;

function outlineOf(name: string, detail = 0.5, height = PLAYER_H): Outline {
  const tris = model(name);
  const [y0, y1] = collisionBand(tris, height)!;
  return computeOutline(tris, y0, y1, detail);
}

/** Odległość punktu od obrysu (0 – w środku). */
function distTo(outline: Outline, x: number, z: number): number {
  if (outline.some((p) => pointInPolygon(x, z, p))) return 0;
  let d = Infinity;
  for (const p of outline) for (let k = 0; k < p.length; k++) d = Math.min(d, distToSegment(x, z, p[k][0], p[k][1], p[(k + 1) % p.length][0], p[(k + 1) % p.length][1]));
  return d;
}

/** Punkty geometrii w paśmie (wierzchołki kawałków przekroju i ich środki). */
function bandSamples(tris: Float32Array, y0: number, y1: number): Pt[] {
  const out: Pt[] = [];
  for (const p of sliceBand(tris, y0, y1)) {
    out.push(...p);
    out.push([p.reduce((s, q) => s + q[0], 0) / p.length, p.reduce((s, q) => s + q[1], 0) / p.length]);
  }
  return out;
}

const area = (o: Outline) => o.reduce((s, p) => s + Math.abs(polygonArea(p)), 0);

/** Dostawca obrysów z prawdziwych plików modeli (jak biblioteka w edytorze). */
const fromFiles: ModelOutlineProvider = (ref, detail, band) => {
  const tris = model(ref.replace(/^modele\//, '').replace(/\.glb$/, ''));
  const [y0] = collisionBand(tris, band)!;
  return computeOutline(tris, y0, y0 + band, detail);
};

describe('obrys kolizji z kształtu modelu', () => {
  it('skały: dwa osobne wielokąty, przylegają do geometrii, dużo mniejsze niż pudełko', () => {
    const tris = model('skaly');
    const [y0, y1] = collisionBand(tris, PLAYER_H)!;
    const o = computeOutline(tris, y0, y1);
    expect(o).toHaveLength(2);
    // każdy punkt geometrii w paśmie leży w obrysie (albo tuż przy nim – uproszczenie)
    for (const [x, z] of bandSamples(tris, y0, y1)) expect(distTo(o, x, z)).toBeLessThan(0.12);
    // każdy wierzchołek obrysu jest blisko geometrii
    const samples = bandSamples(tris, y0, y1);
    for (const p of o) for (const [x, z] of p) expect(Math.min(...samples.map((s) => Math.hypot(s[0] - x, s[1] - z)))).toBeLessThan(0.2);
    // pudełko modelu (dawna kolizja) jest wyraźnie większe
    const xs = samples.map((s) => s[0]);
    const zs = samples.map((s) => s[1]);
    const box = (Math.max(...xs) - Math.min(...xs)) * (Math.max(...zs) - Math.min(...zs));
    expect(area(o)).toBeLessThan(box * 0.6);
  });

  it('płot w kształcie L: jeden wklęsły wielokąt, wnętrze litery L jest wolne', () => {
    const o = outlineOf('plot');
    expect(o).toHaveLength(1);
    expect(polygonArea(o[0]) !== 0).toBe(true);
    // na płocie – kolizja
    for (const [x, z] of [[2, 0], [3.9, 0], [0, 1.5], [0, 2.4]] as Pt[]) expect(distTo(o, x, z)).toBe(0);
    // w środku L i za płotem – wolne
    for (const [x, z] of [[2, 1.25], [1, 1], [3, 2], [2, -0.4], [-0.4, 1.2]] as Pt[]) expect(distTo(o, x, z)).toBeGreaterThan(0.1);
    // obrys jest wąski: pole to ułamek pudełka 4 × 2,5
    expect(area(o)).toBeLessThan(4 * 2.5 * 0.2);
  });

  it('drzewo: tylko pień, korona nad głową postaci nie blokuje', () => {
    const o = outlineOf('drzewo');
    expect(o).toHaveLength(1);
    for (const [x, z] of o[0]) expect(Math.hypot(x, z)).toBeLessThan(0.35);
    // niska postać (pasmo do 0,5) – też tylko pień; bardzo wysoka – korona też
    expect(area(outlineOf('drzewo', 0.5, 0.5))).toBeLessThan(0.3);
    expect(area(outlineOf('drzewo', 0.5, 4))).toBeGreaterThan(4);
  });

  it('poziom szczegółu: więcej wierzchołków przy większym szczególe; prostszy obrys nie wcina się w model', () => {
    const tris = model('skaly');
    const [y0, y1] = collisionBand(tris, PLAYER_H)!;
    const lo = computeOutline(tris, y0, y1, 0);
    const hi = computeOutline(tris, y0, y1, 1);
    const n = (o: Outline) => o.reduce((s, p) => s + p.length, 0);
    expect(n(hi)).toBeGreaterThan(n(lo) * 1.5);
    // prostszy obrys jest trochę większy (bezpieczniejszy), ale ten sam kształt
    expect(area(lo)).toBeGreaterThanOrEqual(area(hi));
    expect(area(lo) / area(hi)).toBeLessThan(1.45);
    for (const o of [lo, hi]) for (const [x, z] of bandSamples(tris, y0, y1)) expect(distTo(o, x, z)).toBeLessThan(0.1);
  });

  it('model bez geometrii w paśmie – pusty obrys', () => {
    // jeden trójkąt na wysokości 5
    expect(computeOutline(new Float32Array([0, 5, 0, 1, 5, 0, 0, 5, 1]), 0, 1.8)).toEqual([]);
  });
});

describe('obrys przekształca się z obiektem', () => {
  const setup = () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [64, 64], resolution: 65, height: 0 });
    const doc = new EditorDoc(s, map);
    const add = (name: string, pos: Vec3, rot: Vec3, scale: Vec3) =>
      doc.addObject(DECORATION, pos, undefined, (o) => {
        o.model = `modele/${name}.glb`;
        o.props.collision = true;
        o.rotation = rot;
        o.scale = scale;
      });
    return { s, map, doc, add };
  };

  it('obrót, skala bazowa i mnożnik: geometria modelu po przekształceniu leży w obrysie z mapy', () => {
    const { s, map, doc, add } = setup();
    const o = add('plot', [30, 0, 20], [0, 37, 0], [1.5, 1, 0.8]);
    doc.setModelBaseScale('modele/plot.glb', 2);
    const shapes = collectCollision(s, map, undefined, fromFiles).filter((c) => c.objectId === o.id);
    expect(shapes).toHaveLength(1);
    expect(shapes[0]).toMatchObject({ shape: 'polygon', source: 'model' });
    const world: Outline = shapes.map((c) => c.points);
    const obj = doc.getObject(o.id)!;
    const m = objectModel(s, obj, undefined, map)!;
    const tris = model('plot');
    // skala bazowa 2 → pasmo w jednostkach modelu to połowa wysokości postaci
    const [y0, y1] = collisionBand(tris, PLAYER_H, 2)!;
    expect(y1 - y0).toBeCloseTo(0.9);
    for (const [x, z] of bandSamples(tris, y0, y1)) {
      const w = modelToWorld([x, 0, z], m.transform, obj);
      expect(distTo(world, w[0], w[2])).toBeLessThan(0.25);
    }
    // środek litery L po przekształceniu też jest wolny
    const mid = modelToWorld([2, 0, 1.25], m.transform, obj);
    expect(distTo(world, mid[0], mid[2])).toBeGreaterThan(0.5);
    // pole rośnie razem ze skalą: 2² × 1,5 × 0,8
    const local = collisionOutlineArea(map, 'modele/plot.glb');
    expect(area(world) / local).toBeCloseTo(4 * 1.5 * 0.8, 1);
  });

  it('ten sam obrót zapisany inaczej (180, 30, 180 = 0, 150, 0) daje ten sam obrys', () => {
    const { s, map, add } = setup();
    const a = add('skaly', [20, 0, 20], [180, 30, 180], [1, 1, 1]);
    const b = add('skaly', [20, 0, 20], [0, 150, 0], [1, 1, 1]);
    const pa = collectCollision(s, map, undefined, fromFiles).filter((c) => c.objectId === a.id);
    const pb = collectCollision(s, map, undefined, fromFiles).filter((c) => c.objectId === b.id);
    expect(pa).toHaveLength(2);
    pa.forEach((c, k) => c.points.forEach((p, i) => {
      expect(p[0]).toBeCloseTo(pb[k].points[i][0], 3);
      expect(p[1]).toBeCloseTo(pb[k].points[i][1], 3);
    }));
  });

  it('obrót obrysu zgadza się z obrotem modelu (wierzchołek modelu → obrócony punkt w obrysie)', () => {
    const { s, map, add } = setup();
    for (const deg of [0, 30, 45, 90, 135, 200, 315]) {
      const o = add('plot', [32, 0, 32], [0, deg, 0], [1, 1, 1]);
      const world: Outline = collectCollision(s, map, undefined, fromFiles).filter((c) => c.objectId === o.id).map((c) => c.points);
      const r = (deg * Math.PI) / 180;
      // koniec długiego ramienia płotu (4, 0) w układzie Three.js: x' = x cos + z sin, z' = −x sin + z cos
      const end: Pt = [32 + 4 * Math.cos(r), 32 - 4 * Math.sin(r)];
      expect(distTo(world, end[0] - 0.1 * Math.cos(r), end[1] + 0.1 * Math.sin(r))).toBe(0);
      // punkt odbity (zły kierunek obrotu) nie może być w obrysie
      if (deg % 180 !== 0) expect(distTo(world, 32 + 3.5 * Math.cos(r), 32 + 3.5 * Math.sin(r))).toBeGreaterThan(0.3);
    }
  });

  it('obrys poprawiony ręcznie zastępuje wyliczony; przejście używa obrysu z modelu', () => {
    const { s, map, doc, add } = setup();
    const o = add('skaly', [10, 0, 10], [0, 90, 0], [2, 2, 2]);
    doc.setModelCollision('modele/skaly.glb', { polygons: [[[0, 0], [1, 0], [1, 1], [0, 1]]], source: 'drawn' });
    const [c] = collectCollision(s, map, undefined, fromFiles).filter((x) => x.objectId === o.id);
    expect(c).toMatchObject({ source: 'drawn' });
    // obrót o 90° wokół Y: (x, z) → (z, −x), skala 2
    expect(c.points).toEqual([[10, 10], [10, 8], [12, 8], [12, 10]]);
    doc.undo();
    expect(collectCollision(s, map, undefined, fromFiles).filter((x) => x.objectId === o.id)).toHaveLength(2);
    // przejście z modelem skał: obrys = otoczka obu części
    expect(buildTriggers(s, map, undefined, fromFiles)).toEqual([]);
  });

  it('bez wczytanego modelu – pudełko modelu, a dla prostej bryły – jej kształt', () => {
    const { s, map, doc, add } = setup();
    add('skaly', [10, 0, 10], [0, 0, 0], [1, 1, 1]);
    const box = () => ({ min: [-1, 0, -1] as Vec3, max: [1, 1, 1] as Vec3 });
    expect(collectCollision(s, map, box)[0]).toMatchObject({ source: 'bounds' });
    const g = doc.addObject('generator', [20, 0, 20]);
    const c = collectCollision(s, map, box, fromFiles).find((x) => x.objectId === g.id)!;
    expect(c).toMatchObject({ source: 'shape' });
  });
});

function collisionOutlineArea(map: Parameters<typeof modelOutline>[0], ref: string): number {
  return area(modelOutline(map, ref, PLAYER_H, fromFiles)!.outline);
}

export type { MapObject };

describe('format 5: obrys kolizji w mapie', () => {
  const build = () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [64, 64], resolution: 65, height: 0 });
    const doc = new EditorDoc(s, map);
    for (const [name, pos, rot] of [['skaly', [10, 0, 10], 25], ['plot', [30, 0, 30], -40], ['drzewo', [50, 0, 20], 0]] as const)
      doc.addObject(DECORATION, [...pos], undefined, (o) => {
        o.model = `modele/${name}.glb`;
        o.props.collision = true;
        o.rotation = [0, rot, 0];
      });
    doc.setModelBaseScale('modele/drzewo.glb', 1.5);
    doc.setModelCollision('modele/plot.glb', { detail: 0.9 });
    doc.setModelCollision('modele/skaly.glb', { polygons: [[[-2, -1], [0.5, -1], [0.5, 1], [-2, 1]], [[1, 0], [2, 0], [1.5, 1]]], source: 'edited' });
    return { s, map, doc };
  };

  it('zapis → odczyt: ustawienia obrysów bez strat, skala bazowa zostaje', () => {
    const { s, map } = build();
    const collision = collectCollision(s, map, undefined, fromFiles);
    const text = mapToJson(map, { collision });
    const back = parseMap(text);
    expect(back.models).toEqual(map.models);
    expect(back.models['modele/drzewo.glb']).toEqual({ baseScale: 1.5 });
    expect(back.models['modele/skaly.glb'].collision).toMatchObject({ source: 'edited' });
    expect(mapToJson(back, { collision })).toBe(text);
    // gra dostaje w derived.collision dokładnie to, co edytor liczy po wczytaniu
    const f = JSON.parse(text);
    expect(f.formatVersion).toBe(5);
    expect(f.derived.collision).toEqual(JSON.parse(JSON.stringify(collectCollision(s, back, undefined, fromFiles))));
    // skały: dwa narysowane wielokąty, płot: jeden z modelu, drzewo: pień
    const by = (src: string) => f.derived.collision.filter((c: { source?: string }) => c.source === src).length;
    expect(by('edited')).toBe(2);
    expect(by('model')).toBe(2);
  });

  it('migracja 4 → 5: mapa bez obrysów wczytuje się bez zmian', () => {
    const { map } = build();
    const f = serializeMap(map) as unknown as Record<string, any>;
    f.formatVersion = 4;
    for (const v of Object.values(f.models) as Array<Record<string, unknown>>) delete v.collision;
    const back = deserializeMap(f);
    expect(back.models['modele/drzewo.glb']).toEqual({ baseScale: 1.5 });
    expect(back.models['modele/plot.glb']).toEqual({ baseScale: 1 });
    expect(back.objects).toEqual(map.objects);
  });

  it('złe dane obrysu są pomijane (zostaje obrys z modelu)', () => {
    const { map } = build();
    const f = serializeMap(map) as unknown as Record<string, any>;
    f.models['modele/skaly.glb'].collision = { polygons: [[[0, 0], [1]], 'x'], detail: 'dużo' };
    expect(deserializeMap(f).models['modele/skaly.glb']).toEqual({ baseScale: 1 });
  });
});

describe('ręczna poprawka obrysu', () => {
  it('wstawianie, przesuwanie i usuwanie wierzchołków', async () => {
    const { insertVertex, nearestEdge, nearestVertex, removeVertex, outlineStats } = await import('../src/core/modelCollision');
    let o: Outline = [[[0, 0], [2, 0], [2, 2], [0, 2]], [[5, 5], [6, 5], [5, 6]]];
    expect(nearestVertex(o, [2.1, 1.9], 0.3)).toEqual({ poly: 0, idx: 2 });
    expect(nearestVertex(o, [1, 1], 0.3)).toBeNull();
    const e = nearestEdge(o, [1, -0.1], 0.3)!;
    expect(e).toEqual({ poly: 0, idx: 0 });
    o = insertVertex(o, e, [1, -0.5]);
    expect(o[0]).toEqual([[0, 0], [2, 0 + 0], [2, 2], [0, 2]].flatMap((p, i) => (i === 0 ? [p, [1, -0.5]] : [p])));
    o = removeVertex(o, { poly: 1, idx: 0 });
    expect(outlineStats(o)).toEqual({ parts: 1, vertices: 5 });
  });
});
