// Losowa wariacja przy stawianiu wielu obiektów (dekoracje, drzewa…): zakres mnożnika skali i losowy obrót
// wokół osi pionowej. Czyste funkcje; losowość z podanego generatora (testy podają własny).
import type { MapObject } from './map';

export interface Variation {
  enabled: boolean;
  /** Zakres mnożnika skali (jednolitego), np. 0,8–1,2. */
  scaleMin: number;
  scaleMax: number;
  /** Losowy obrót wokół osi Y (0–360°). */
  rotate: boolean;
}

export const DEFAULT_VARIATION: Variation = { enabled: false, scaleMin: 0.8, scaleMax: 1.2, rotate: true };

/** Mnoży skalę obiektu przez losową wartość z zakresu i ustawia losowy obrót Y (gdy włączone). */
export function applyVariation(o: MapObject, v: Variation, rnd: () => number = Math.random): void {
  if (!v.enabled || o.points.length) return;
  const lo = Math.min(v.scaleMin, v.scaleMax);
  const hi = Math.max(v.scaleMin, v.scaleMax);
  if (lo > 0) {
    const k = lo + (hi - lo) * rnd();
    o.scale = [o.scale[0] * k, o.scale[1] * k, o.scale[2] * k];
  }
  if (v.rotate) o.rotation = [o.rotation[0], Math.round(rnd() * 3600) / 10, o.rotation[2]];
}
