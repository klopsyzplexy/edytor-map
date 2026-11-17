// Normalizacja skali modeli: pomiar modelu i propozycja skali bazowej według kategorii (rozmiary w metrach
// ze schematu albo domyślne). Czyste funkcje, bez DOM i Three.js.
import type { Vec3 } from './map';
import type { ScaleCategory, ScaleMeasure } from './schema';

/** Wymiar modelu mierzony dla kategorii: wysokość (Y) albo szerokość podstawy (większy z boków X, Z). */
export function measureSize(size: Vec3, measure: ScaleMeasure): number {
  return measure === 'height' ? size[1] : Math.max(size[0], size[2]);
}

/** Rozmiar docelowy (metry) dla modelu, który ma teraz `currentM` metrów: w zakresie kategorii zostaje, poza nim – najbliższa granica. */
export function targetMeters(cat: ScaleCategory, currentM: number): number {
  if (cat.min !== undefined && cat.max !== undefined) return Math.min(Math.max(currentM, cat.min), cat.max);
  return cat.size;
}

export interface ScaleProposal {
  /** Zaproponowana skala bazowa (mnoży wymiary pliku modelu). */
  baseScale: number;
  /** Wymiar mierzony (wysokość albo szerokość) w metrach: przed i po skali. */
  beforeM: number;
  afterM: number;
}

/**
 * Skala bazowa, po której model ma rozmiar docelowy. `size` – wymiary pliku modelu w jednostkach mapy (przy
 * skali 1), `unitsPerMeter` – przelicznik ze schematu. `customM` (opcjonalnie) zastępuje rozmiar kategorii.
 */
export function proposeBaseScale(size: Vec3, cat: ScaleCategory, unitsPerMeter: number, customM?: number): ScaleProposal {
  const measured = measureSize(size, cat.measure);
  const beforeM = measured / unitsPerMeter;
  if (!(measured > 0)) return { baseScale: 1, beforeM, afterM: beforeM };
  const afterM = customM !== undefined && customM > 0 ? customM : targetMeters(cat, beforeM);
  const baseScale = (afterM * unitsPerMeter) / measured;
  return { baseScale: roundScale(baseScale), beforeM, afterM };
}

/** Skala zaokrąglona do 4 cyfr znaczących (czytelna w panelu i w pliku). */
export function roundScale(v: number): number {
  if (!(v > 0) || !Number.isFinite(v)) return 1;
  return Number(v.toPrecision(4));
}

/** Słowa w nazwie pliku, po których edytor zgaduje kategorię domyślną (polskie i angielskie). */
const GUESS: Record<string, RegExp> = {
  postac: /(postac|posta[cć]|character|player|hero|human|person|npc|gracz)/i,
  drzewo: /(drzew|tree|pine|oak|birch|sosn|d[aą]b|brzoz|palm|spruce|[sś]wierk)/i,
  krzew: /(krzew|krzak|bush|shrub|hedge|plant|ro[sś]lin)/i,
  skala: /(ska[lł]|kami|rock|stone|boulder|cliff|g[lł]az)/i,
  plot: /(p[lł]ot|fence|railing|barier|palisad)/i,
  budynek: /(budyn|dom|house|building|chata|hut|tower|wie[zż]|castle|zamek|barn|stodo|shop|sklep)/i,
};

/** Kategoria zgadnięta z nazwy pliku: najpierw id i nazwy kategorii ze schematu, potem słowa domyślne. */
export function guessCategory(fileName: string, categories: ScaleCategory[], names: (c: ScaleCategory) => string[] = () => []): string | undefined {
  const n = fileName.toLowerCase();
  for (const c of categories) if ([c.id, ...names(c)].some((x) => x && n.includes(x.toLowerCase()))) return c.id;
  for (const c of categories) if (GUESS[c.id]?.test(n)) return c.id;
  return undefined;
}
