// Wyświetlanie wymiarów: metry (według przelicznika ze schematu) i jednostki mapy.
import { getLang } from '../i18n';

/** Liczba z najwyżej `digits` miejscami po przecinku, w formacie języka interfejsu. */
export function formatNum(v: number, digits = 2): string {
  return v.toLocaleString(getLang(), { maximumFractionDigits: digits });
}

export function formatMeters(m: number): string {
  return `${formatNum(m)} m`;
}
