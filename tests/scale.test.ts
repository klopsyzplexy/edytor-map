import { describe, expect, it } from 'vitest';
import { createMap } from '../src/core/map';
import { createObject } from '../src/core/map';
import { guessCategory, measureSize, proposeBaseScale } from '../src/core/scaleNormalize';
import { DEFAULT_SCALE_CATEGORIES } from '../src/core/schema';
import { applyVariation } from '../src/core/variation';
import { exampleSchema } from './helpers';

const cat = (id: string) => DEFAULT_SCALE_CATEGORIES.find((c) => c.id === id)!;

describe('normalizacja skali modeli', () => {
  it('mierzy wysokość albo szerokość podstawy', () => {
    expect(measureSize([4, 2, 6], 'height')).toBe(2);
    expect(measureSize([4, 2, 6], 'width')).toBe(6);
  });

  it('postać w centymetrach (180 j.) → 1,8 m przy przeliczniku 1', () => {
    const p = proposeBaseScale([50, 180, 30], cat('postac'), 1);
    expect(p.baseScale).toBeCloseTo(0.01);
    expect(p.beforeM).toBe(180);
    expect(p.afterM).toBe(1.8);
  });

  it('drzewo w zakresie 6–10 m zostaje, poza nim – najbliższa granica', () => {
    expect(proposeBaseScale([2, 7, 2], cat('drzewo'), 1).baseScale).toBe(1);
    expect(proposeBaseScale([2, 20, 2], cat('drzewo'), 1).afterM).toBe(10);
    expect(proposeBaseScale([2, 1, 2], cat('drzewo'), 1).afterM).toBe(6);
  });

  it('budynek według szerokości podstawy, przelicznik 32 j./m', () => {
    const p = proposeBaseScale([5, 3, 4], cat('budynek'), 32);
    expect(p.afterM).toBe(10);
    expect(p.baseScale).toBeCloseTo(64);
  });

  it('własny rozmiar zastępuje kategorię', () => {
    expect(proposeBaseScale([1, 2, 1], cat('krzew'), 1, 0.5).baseScale).toBe(0.25);
  });

  it('zgaduje kategorię z nazwy pliku', () => {
    expect(guessCategory('Oak_Tree_01.glb', DEFAULT_SCALE_CATEGORIES)).toBe('drzewo');
    expect(guessCategory('fence-wood.fbx', DEFAULT_SCALE_CATEGORIES)).toBe('plot');
    expect(guessCategory('postac.glb', DEFAULT_SCALE_CATEGORIES)).toBe('postac');
    expect(guessCategory('xyz.glb', DEFAULT_SCALE_CATEGORIES)).toBeUndefined();
  });
});

describe('losowa wariacja', () => {
  it('skala w zakresie i obrót Y', () => {
    const s = exampleSchema();
    const map = createMap(s, { name: 't', size: [8, 8], resolution: 5, height: 0 });
    const o = createObject(s, map, 'drzewo', [1, 0, 1]);
    const seq = [0.5, 0.25];
    applyVariation(o, { enabled: true, scaleMin: 0.8, scaleMax: 1.2, rotate: true }, () => seq.shift()!);
    expect(o.scale[0]).toBeCloseTo(1);
    expect(o.rotation[1]).toBeCloseTo(90);
    const p = createObject(s, map, 'drzewo', [1, 0, 1]);
    applyVariation(p, { enabled: false, scaleMin: 2, scaleMax: 3, rotate: true });
    expect(p.scale).toEqual([1, 1, 1]);
  });
});
