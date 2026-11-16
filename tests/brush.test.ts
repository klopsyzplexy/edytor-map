import { describe, expect, it } from 'vitest';
import { createMap } from '../src/core/map';
import { applyHeightBrush, applyStamp, brushLocal, sampleStamp, shapeDistance, type HeightStamp } from '../src/core/terrain';
import { exampleSchema } from './helpers';

const flat = () => createMap(exampleSchema(), { name: 't', size: [32, 32], resolution: 33, height: 0 });
const at = (m: ReturnType<typeof flat>, x: number, z: number) => m.terrain.heights[z * m.terrain.nx + x];

describe('kształty pędzla', () => {
  it('liczy odległość w normie koła, kwadratu i rombu', () => {
    expect(shapeDistance(3, 4, 'circle')).toBeCloseTo(5);
    expect(shapeDistance(3, 4, 'square')).toBeCloseTo(4);
    expect(shapeDistance(3, 4, 'diamond')).toBeCloseTo(7);
    // kwadrat obrócony o 45° to romb przeskalowany o √2
    expect(shapeDistance(1, 0, 'square', 45)).toBeCloseTo(Math.SQRT1_2);
  });

  it('obrót o 90° zamienia osie', () => {
    const [x, z] = brushLocal(1, 0, 90);
    expect(x).toBeCloseTo(0);
    expect(z).toBeCloseTo(-1);
  });

  it('kwadrat podnosi róg, którego koło nie obejmuje', () => {
    const b = { radius: 4, strength: 1, softness: 0, target: 0 };
    const circle = flat();
    const square = flat();
    applyHeightBrush(circle, 'raise', 16, 16, { ...b, shape: 'circle' }, 0.1);
    applyHeightBrush(square, 'raise', 16, 16, { ...b, shape: 'square' }, 0.1);
    expect(at(circle, 19, 19)).toBe(0);
    expect(at(square, 19, 19)).toBeGreaterThan(0);
    // romb nie sięga rogu, ale sięga osi
    const diamond = flat();
    applyHeightBrush(diamond, 'raise', 16, 16, { ...b, shape: 'diamond' }, 0.1);
    expect(at(diamond, 19, 19)).toBe(0);
    expect(at(diamond, 19, 16)).toBeGreaterThan(0);
  });
});

describe('stempel', () => {
  // 3 × 3: jasny środek, górny wiersz szary
  const st: HeightStamp = { w: 3, h: 3, data: new Float32Array([0.5, 0.5, 0.5, 0, 1, 0, 0, 0, 0]) };

  it('próbkuje obraz dwuliniowo', () => {
    expect(sampleStamp(st, 0.5, 0.5)).toBeCloseTo(1);
    expect(sampleStamp(st, 0.25, 0.5)).toBeCloseTo(0.5);
    expect(sampleStamp(st, 0.5, 0)).toBeCloseTo(0.5);
  });

  it('podnosi teren o wartość × wysokość, z orientacją obrazu (góra obrazu = mniejsze z)', () => {
    const m = flat();
    const r = applyStamp(m, st, 16, 16, { radius: 4, strength: 1, softness: 0, target: 0 }, 2);
    expect(r).not.toBeNull();
    expect(at(m, 16, 16)).toBeCloseTo(2);
    expect(at(m, 16, 12)).toBeCloseTo(1); // górny brzeg obrazu
    expect(at(m, 16, 20)).toBeCloseTo(0); // dolny brzeg obrazu
    expect(at(m, 25, 16)).toBe(0); // poza stemplem
  });

  it('przy „szary = bez zmian” ciemne obniża, a obrót o 90° przenosi górę obrazu w bok', () => {
    const m = flat();
    applyStamp(m, st, 16, 16, { radius: 4, strength: 1, softness: 0, target: 0, angle: 90 }, 2, true);
    expect(at(m, 16, 16)).toBeCloseTo(2);
    // po obrocie o 90° górny wiersz (szary → 0) leży po stronie +x
    expect(at(m, 20, 16)).toBeCloseTo(0);
    expect(at(m, 12, 16)).toBeCloseTo(-2);
  });
});
