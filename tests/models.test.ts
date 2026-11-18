import { describe, expect, it } from 'vitest';
import raw from '../examples/schemat-przyklad.json';
import { collectCollision, computeBlockedMask, DECORATION } from '../src/core/collision';
import { EditorDoc } from '../src/core/doc';
import { deserializeMap, FORMAT_VERSION, mapToJson, parseMap, serializeMap } from '../src/core/format';
import { createMap } from '../src/core/map';
import { modelRef, objectFlags, objectModel, usedModels } from '../src/core/objectModel';
import { getType, parseSchema } from '../src/core/schema';
import { computeLayerMask } from '../src/core/terrain';
import { collectWalkable } from '../src/core/walkable';
import { exampleSchema } from './helpers';

describe('schemat: postać gracza, kamera, warstwy, ułożenie modelu', () => {
  it('przykładowy schemat ma sekcję player i warstwę nieprzechodnią', () => {
    const s = exampleSchema();
    expect(s.player).toMatchObject({ radius: 0.4, height: 1.8, stepHeight: 0.4, startType: 'start', animations: { idle: 'stoi', walk: 'idzie' } });
    expect(s.terrainLayers.find((l) => l.id === 'gleboka-woda')!.passable).toBe(false);
    expect(s.terrainLayers.find((l) => l.id === 'woda')!.passable).toBe(true);
    expect(s.camera).toMatchObject({ followSmoothing: 0.15, minDistance: 15, maxDistance: 90 });
  });

  it('bez sekcji player i bez pól kamery – wartości domyślne', () => {
    const r = structuredClone(raw) as Record<string, unknown>;
    delete r.player;
    r.camera = { distance: 20 };
    const s = parseSchema(r);
    expect(s.player.model).toBeUndefined();
    expect(s.player.startType).toBeUndefined();
    expect(s.player.radius).toBeGreaterThan(0);
    expect(s.camera.minDistance).toBeLessThan(20);
    expect(s.camera.maxDistance).toBeGreaterThan(20);
  });

  it('zgłasza złe wartości postaci i nieznany typ startu', () => {
    const r = structuredClone(raw) as Record<string, unknown>;
    r.player = { radius: -1, startType: 'nie-ma', modelScale: 'duży' };
    expect(() => parseSchema(r)).toThrow(/modelScale[\s\S]*player.radius[\s\S]*startType/);
  });

  it('modelScale może być liczbą albo listą; modelOffset i modelRotation – listy', () => {
    const r = structuredClone(raw) as { objectTypes: Array<Record<string, any>> };
    const k = r.objectTypes.find((t) => t.id === 'kladka')!;
    Object.assign(k.look, { modelScale: 2, modelOffset: [0, 0.5, 0], modelRotation: [0, 90, 0] });
    const s = parseSchema(r);
    expect(getType(s, 'kladka')!.look.modelTransform).toEqual({ offset: [0, 0.5, 0], rotation: [0, 90, 0], scale: [2, 2, 2] });
  });
});

describe('modele obiektów i dekoracje', () => {
  it('własny model obiektu zastępuje model typu i stoi bez ułożenia z typu', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    const doc = new EditorDoc(s, map);
    const a = doc.addObject('kladka', [5, 0, 5]);
    expect(objectModel(s, a)!.ref).toBe('modele/kladka.glb');
    doc.updateObjects([a.id], (o) => (o.model = modelRef('beczka.fbx')));
    const o = doc.getObject(a.id)!;
    expect(objectModel(s, o)).toEqual({ ref: 'modele/beczka.glb', transform: { offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } });
    expect(usedModels(s, map.objects)).toEqual(['modele/beczka.glb']);
  });

  it('dekoracja: flagi z właściwości obiektu, obrys kolizji z pudełka modelu, powierzchnia z modelu', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    const doc = new EditorDoc(s, map);
    const d = doc.addObject(DECORATION, [10, 1, 10]);
    doc.updateObjects([d.id], (o) => (o.model = 'modele/skrzynia.glb'));
    const t = getType(s, DECORATION)!;
    expect(objectFlags(t, doc.getObject(d.id)!)).toMatchObject({ collision: false, walkable: false });
    expect(collectCollision(s, map)).toHaveLength(0);

    doc.updateObjects([d.id], (o) => Object.assign(o.props, { collision: true, walkable: true }));
    const bounds = () => ({ min: [-1, 0, -2] as [number, number, number], max: [1, 1, 2] as [number, number, number] });
    const [shape] = collectCollision(s, map, bounds);
    expect(shape.shape).toBe('polygon');
    const xs = shape.points.map((p) => p[0]);
    const zs = shape.points.map((p) => p[1]);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...zs), Math.max(...zs)]).toEqual([9, 11, 8, 12]);

    // jeden trójkąt w modelu (na wysokości 1) → przesunięty do punktu obiektu
    const walk = collectWalkable(s, map, () => new Float32Array([0, 1, 0, 1, 1, 0, 0, 1, 1]));
    expect(walk[0].triangles).toEqual([10, 2, 10, 11, 2, 10, 10, 2, 11]);
  });

  it('model typu: obrys kolizji uwzględnia ułożenie modelu z typu', () => {
    const r = structuredClone(raw) as { objectTypes: Array<Record<string, any>> };
    const tree = r.objectTypes.find((t) => t.id === 'drzewo')!;
    Object.assign(tree.look, { model: 'modele/drzewo.glb', modelScale: 2, modelOffset: [5, 0, 0] });
    const s = parseSchema(r);
    const map = createMap(s, { name: 'm', size: [32, 32], resolution: 33, height: 0 });
    new EditorDoc(s, map).addObject('drzewo', [10, 0, 10]);
    const [shape] = collectCollision(s, map, () => ({ min: [-0.5, 0, -0.5], max: [0.5, 3, 0.5] }));
    const xs = shape.points.map((p) => p[0]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([14, 16]);
  });
});

describe('warstwy nieprzechodnie i maska', () => {
  it('punkt jest zablokowany, gdy warstwy nieprzechodnie mają co najmniej połowę wagi', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [8, 8], resolution: 9, height: 0 });
    const L = map.terrain.layers;
    L['gleboka-woda'][0] = 255; // 255 vs trawa 255 → połowa
    L['gleboka-woda'][1] = 100; // 100 vs 255 → mniej niż połowa
    const mask = computeLayerMask(map, ['gleboka-woda']);
    expect([mask[0], mask[1], mask[2]]).toEqual([255, 0, 0]);
    const full = computeBlockedMask(s, map, [])!;
    expect(full[0]).toBe(255);
  });

  it('bez zboczy, warstw nieprzechodnich i kolizji maski nie ma', () => {
    const r = structuredClone(raw) as { terrainLayers: Array<Record<string, unknown>> };
    r.terrainLayers = r.terrainLayers.filter((l) => l.passable !== false);
    const s = parseSchema(r);
    const map = createMap(s, { name: 'm', size: [8, 8], resolution: 9, height: 0 });
    expect(computeBlockedMask(s, map, [])).toBeUndefined();
  });
});

describe('format mapy 3', () => {
  it('model obiektu przechodzi zapis → odczyt; bez modelu pola nie ma', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [16, 16], resolution: 17, height: 0 });
    const doc = new EditorDoc(s, map);
    const a = doc.addObject(DECORATION, [1, 0, 1]);
    doc.addObject('drzewo', [3, 0, 3]);
    doc.updateObjects([a.id], (o) => (o.model = 'modele/beczka.glb'));
    const json = mapToJson(map, { models: usedModels(s, map.objects) });
    const f = JSON.parse(json);
    expect(f.formatVersion).toBe(FORMAT_VERSION);
    expect(f.objects[0].model).toBe('modele/beczka.glb');
    expect('model' in f.objects[1]).toBe(false);
    expect(f.derived.models).toEqual(['modele/beczka.glb']);
    const back = parseMap(json);
    expect(back.objects).toEqual(map.objects);
    expect(mapToJson(back, { models: usedModels(s, back.objects) })).toBe(json);
  });

  it('wczytuje plik w formacie 2 bez zmian w danych', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [16, 16], resolution: 17, height: 0 });
    new EditorDoc(s, map).addObject('drzewo', [3, 0, 3]);
    const f = serializeMap(map) as unknown as Record<string, unknown>;
    f.formatVersion = 2;
    expect(deserializeMap(f).objects).toEqual(map.objects);
  });
});

describe('format mapy 4: skala bazowa modelu i mnożnik obiektu', () => {
  const setup = () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 'm', size: [16, 16], resolution: 17, height: 0 });
    return { s, map, doc: new EditorDoc(s, map) };
  };
  const box = () => ({ min: [-1, 0, -1] as [number, number, number], max: [1, 2, 1] as [number, number, number] });

  it('migracja 3 → 4: pusta sekcja models, mapa bez zmian', () => {
    const { map, doc } = setup();
    const o = doc.addObject(DECORATION, [5, 0, 5]);
    doc.updateObjects([o.id], (x) => (x.model = 'modele/beczka.glb'));
    const f = serializeMap(map) as unknown as Record<string, unknown>;
    f.formatVersion = 3;
    delete f.models;
    const back = deserializeMap(f);
    expect(back.models).toEqual({});
    expect(back.objects).toEqual(map.objects);
  });

  it('skala bazowa: zapis → odczyt, wszystkie kopie modelu, mnożnik obiektu osobno', () => {
    const { s, map, doc } = setup();
    const a = doc.addObject(DECORATION, [4, 0, 4]);
    const b = doc.addObject(DECORATION, [10, 0, 10]);
    doc.updateObjects([a.id, b.id], (x) => (x.model = 'modele/beczka.glb'));
    doc.updateObjects([b.id], (x) => (x.scale = [2, 2, 2]));
    doc.setModelBaseScale('modele/beczka.glb', 0.5);
    const json = mapToJson(map);
    expect(JSON.parse(json).models).toEqual({ 'modele/beczka.glb': { baseScale: 0.5 } });
    expect(parseMap(json).models).toEqual(map.models);
    // obrys kolizji: pudełko 2×2 × skala bazowa 0,5 × mnożnik (1 albo 2)
    const width = (id: string) => {
      const o = map.objects.find((x) => x.id === id)!;
      o.props.collision = true;
      const sh = collectCollision(s, map, box).find((c) => c.objectId === id)!;
      const xs = sh.points.map((p) => p[0]);
      return Math.max(...xs) - Math.min(...xs);
    };
    expect(width(a.id)).toBeCloseTo(1);
    expect(width(b.id)).toBeCloseTo(2);
    expect(objectModel(s, map.objects[0], undefined, map)!.transform.scale).toEqual([0.5, 0.5, 0.5]);
    doc.undo();
    expect(map.models).toEqual({});
    expect(width(a.id)).toBeCloseTo(2);
  });

  it('skala bazowa modelu typu mnoży ułożenie z typu', () => {
    const { s, map, doc } = setup();
    const k = doc.addObject('kladka', [8, 0, 8]);
    doc.setModelBaseScale('kladka.glb', 3);
    expect(Object.keys(map.models)).toEqual(['kladka.glb']);
    expect(objectModel(s, map.objects.find((o) => o.id === k.id)!, undefined, map)!.transform.scale).toEqual([3, 3, 3]);
  });

  it('nowy obiekt z modelem nieznanym mapie dostaje skalę z biblioteki (w tym samym kroku cofania)', () => {
    const { map, doc } = setup();
    doc.modelDefaults = (ref) => (ref.includes('kladka') ? { baseScale: 0.25 } : undefined);
    doc.addObject('kladka', [8, 0, 8]);
    expect(map.models).toEqual({ 'modele/kladka.glb': { baseScale: 0.25 } });
    doc.undo();
    expect(map.models).toEqual({});
    expect(map.objects).toEqual([]);
  });

  it('zła skala bazowa w pliku → błąd', () => {
    const { map } = setup();
    const f = serializeMap(map) as unknown as Record<string, unknown>;
    f.models = { 'modele/x.glb': { baseScale: -1 } };
    expect(() => deserializeMap(f)).toThrow(/baseScale/);
  });
});
