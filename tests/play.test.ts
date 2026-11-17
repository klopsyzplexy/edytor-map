import { describe, expect, it } from 'vitest';
import { collectCollision, COLLISION_LINE, COLLISION_ZONE } from '../src/core/collision';
import { EditorDoc } from '../src/core/doc';
import { createMap, heightAt, type MapData } from '../src/core/map';
import { buildPlayWorld, findStart, groundAt, slopeDegAt, spawnAt, stepPlayer, type PlayWorld } from '../src/core/play';
import type { Schema } from '../src/core/schema';
import { collectWalkable } from '../src/core/walkable';
import { exampleSchema } from './helpers';

function setup(build?: (doc: EditorDoc, map: MapData) => void): { schema: Schema; map: MapData; world: () => PlayWorld } {
  const schema = exampleSchema();
  const map = createMap(schema, { name: 't', size: [40, 40], resolution: 81, height: 0 });
  const doc = new EditorDoc(schema, map);
  build?.(doc, map);
  return { schema, map, world: () => buildPlayWorld(schema, map, { collision: collectCollision(schema, map), walkable: collectWalkable(schema, map) }) };
}

/** Idzie w kierunku `dir` przez `secs` sekund w klatkach po 1/60 s. */
function walk(w: PlayWorld, s: ReturnType<typeof spawnAt>, dir: [number, number], secs: number) {
  let last;
  for (let k = 0; k < secs * 60; k++) last = stepPlayer(w, s, dir, 1 / 60);
  return last!;
}

describe('tryb gry: ruch i kolizje', () => {
  it('na płaskim terenie idzie z ustawioną szybkością', () => {
    const { world, schema } = setup();
    const w = world();
    const s = spawnAt(w, 10, 10);
    walk(w, s, [1, 0], 1);
    expect(s.pos[0]).toBeCloseTo(10 + schema.player.speed, 3);
    expect(s.pos[2]).toBeCloseTo(10);
  });

  it('lasso kolizji zatrzymuje postać w odległości promienia od krawędzi', () => {
    const { world, schema } = setup((doc) => doc.addObject(COLLISION_ZONE, [0, 0, 0], [[20, 0, 0], [30, 0, 0], [30, 0, 40], [20, 0, 40]]));
    const w = world();
    const s = spawnAt(w, 10, 10);
    const r = walk(w, s, [1, 0], 4);
    expect(s.pos[0]).toBeCloseTo(20 - schema.player.radius, 3);
    expect(r.blocked).toBe(true);
    expect(r.blockedBy).toBe(COLLISION_ZONE);
  });

  it('ślizga się wzdłuż ściany przy ukośnym zderzeniu', () => {
    const { world, schema } = setup((doc) => doc.addObject(COLLISION_ZONE, [0, 0, 0], [[20, 0, 0], [30, 0, 0], [30, 0, 40], [20, 0, 40]]));
    const w = world();
    const s = spawnAt(w, 19, 10);
    walk(w, s, [Math.SQRT1_2, Math.SQRT1_2], 1);
    expect(s.pos[0]).toBeCloseTo(20 - schema.player.radius, 3);
    // wzdłuż ściany przesuwa się o składową ruchu (nie stoi w miejscu)
    expect(s.pos[2]).toBeGreaterThan(10 + schema.player.speed * 0.6);
  });

  it('ślizga się po ukośnej ścianie (obrócona ściana kolizji)', () => {
    const { world } = setup((doc) => {
      const o = doc.addObject('sciana', [20, 0, 20]);
      doc.updateObjects([o.id], (x) => {
        x.rotation = [0, 45, 0];
        x.scale = [6, 1, 2];
      });
    });
    const w = world();
    const s = spawnAt(w, 20, 8);
    walk(w, s, [0, 1], 3);
    // nie przeszła przez ścianę, ale zsunęła się w bok
    expect(Math.abs(s.pos[0] - 20)).toBeGreaterThan(2);
  });

  it('linia kolizji z grubością blokuje, nawet przy dużym kroku (bez przeskakiwania)', () => {
    const { world, schema } = setup((doc) => {
      const l = doc.addObject(COLLISION_LINE, [0, 0, 0], [[0, 0, 20], [40, 0, 20]]);
      doc.updateObjects([l.id], (o) => (o.props.width = 0.2));
    });
    const w = world();
    const s = spawnAt(w, 10, 15);
    for (let k = 0; k < 20; k++) stepPlayer(w, s, [0, 1], 0.1);
    expect(s.pos[2]).toBeCloseTo(20 - 0.1 - schema.player.radius, 3);
  });

  it('strome zbocza blokują tylko, gdy są włączone w mapie', () => {
    const { world, map } = setup();
    // ściana terenu: od z = 20 teren rośnie o 3 na każdą jednostkę
    const { nx, nz } = map.terrain;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) map.terrain.heights[j * nx + i] = Math.max(0, (j * 0.5 - 20) * 3);
    let w = world();
    let s = spawnAt(w, 10, 15);
    walk(w, s, [0, 1], 2);
    expect(s.pos[2]).toBeGreaterThan(22);
    map.settings.slope.enabled = true;
    w = world();
    s = spawnAt(w, 10, 15);
    const r = walk(w, s, [0, 1], 2);
    expect(s.pos[2]).toBeLessThan(20.1);
    expect(r.blockedBy).toBe('slope/layer');
    expect(slopeDegAt(map, 10, 25)).toBeGreaterThan(70);
  });

  it('warstwa nieprzechodnia blokuje, a most nad nią przepuszcza', () => {
    const { world, map, schema } = setup((doc) => {
      const most = doc.addObject('most', [20, 0, 20]); // 3 × 0,3 × 8 wzdłuż z
      doc.updateObjects([most.id], (o) => (o.scale = [1, 1, 3])); // długość 24: z 8…32
    });
    // głęboka woda: pas x 0…40, z 16…24
    const { nx } = map.terrain;
    for (let j = 32; j <= 48; j++) for (let i = 0; i < nx; i++) {
      map.terrain.layers['gleboka-woda'][j * nx + i] = 255;
      map.terrain.layers.trawa[j * nx + i] = 0;
    }
    const w = world();
    const s = spawnAt(w, 10, 10);
    walk(w, s, [0, 1], 2);
    expect(s.pos[2]).toBeLessThan(16);
    // na moście (wejście na 0,3 < stopień 0,4) przechodzi przez wodę
    const b = spawnAt(w, 20, 10);
    walk(w, b, [0, 1], 1);
    expect(b.pos[1]).toBeCloseTo(0.3);
    walk(w, b, [0, 1], 3);
    expect(b.pos[2]).toBeGreaterThan(25);
    expect(schema.player.stepHeight).toBe(0.4);
  });

  it('za wysoki stopień blokuje, pod wysokim mostem można przejść', () => {
    const { world } = setup((doc) => {
      const low = doc.addObject('most', [10, 0, 20]);
      doc.updateObjects([low.id], (o) => (o.scale = [1, 3, 1])); // górna ściana na 0,9 – wyżej niż stopień
      doc.addObject('most', [30, 2.5, 20]); // górna ściana na 2,8 – wyżej niż głowa (1,8)
    });
    const w = world();
    const a = spawnAt(w, 10, 10);
    const r = walk(w, a, [0, 1], 3);
    expect(a.pos[2]).toBeLessThan(16.1);
    expect(r.blockedBy).toBe('step');
    const b = spawnAt(w, 30, 10);
    walk(w, b, [0, 1], 3);
    expect(b.pos[2]).toBeGreaterThan(25);
    expect(b.pos[1]).toBeCloseTo(0);
  });

  it('pod górę bez zmiany szybkości (liczonej po ziemi), wysokość = teren', () => {
    const { world, map, schema } = setup();
    const { nx, nz } = map.terrain;
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) map.terrain.heights[j * nx + i] = j * 0.5 * 0.5; // nachylenie 0,5
    const w = world();
    const s = spawnAt(w, 10, 5);
    walk(w, s, [0, 1], 1);
    expect(s.pos[2]).toBeCloseTo(5 + schema.player.speed, 3);
    expect(s.pos[1]).toBeCloseTo(heightAt(map, 10, s.pos[2]), 3);
  });

  it('obiekty z kolizją (np. drzewo) blokują, bez kolizji – nie', () => {
    const { world } = setup((doc) => {
      doc.addObject('drzewo', [20, 0, 10]);
      doc.addObject('start', [20, 0, 30]);
    });
    const w = world();
    const s = spawnAt(w, 10, 10);
    walk(w, s, [1, 0], 3);
    expect(s.pos[0]).toBeLessThan(19.3);
    const t = spawnAt(w, 10, 30);
    walk(w, t, [1, 0], 3);
    expect(t.pos[0]).toBeGreaterThan(25);
  });

  it('start: pierwszy obiekt typu startowego; postać staje na moście, jeśli start na nim leży', () => {
    const { world, schema, map } = setup((doc) => {
      doc.addObject('most', [20, 1, 20]);
      doc.addObject('start', [20, 1.3, 20]);
    });
    const p = findStart(schema, map)!;
    expect(p).toEqual([20, 1.3, 20]);
    const w = world();
    const s = spawnAt(w, p[0], p[2], p[1]);
    expect(s.pos[1]).toBeCloseTo(1.3);
    expect(groundAt(w, 20, 20, 1.3).onSurface).toBe(true);
  });

  it('nie wychodzi poza mapę', () => {
    const { world, schema } = setup();
    const w = world();
    const s = spawnAt(w, 2, 2);
    const r = walk(w, s, [-1, -1], 2);
    expect(s.pos[0]).toBeCloseTo(schema.player.radius);
    expect(s.pos[2]).toBeCloseTo(schema.player.radius);
    expect(r.blockedBy).toBe('edge');
  });
});
