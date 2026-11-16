// Tłumaczenia interfejsu. Teksty są wyłącznie w plikach pl.json i en.json.
import en from './en.json';
import pl from './pl.json';

export type Lang = 'pl' | 'en';
type Dict = Record<string, string>;
const dicts: Record<Lang, Dict> = { pl, en };
export const LANGS: Lang[] = ['pl', 'en'];

let lang: Lang = detect();
const listeners = new Set<() => void>();

function detect(): Lang {
  try {
    const saved = localStorage.getItem('edytor-map.lang');
    if (saved === 'pl' || saved === 'en') return saved;
  } catch {
    /* brak dostępu do localStorage */
  }
  return navigator.language?.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang): void {
  lang = l;
  try {
    localStorage.setItem('edytor-map.lang', l);
  } catch {
    /* ignoruj */
  }
  document.documentElement.lang = l;
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void): void {
  listeners.add(fn);
}

/** Tekst po kluczu; {nazwa} zastępuje parametrem. */
export function t(key: string, params: Record<string, string | number> = {}): string {
  const s = dicts[lang][key] ?? dicts.pl[key] ?? key;
  return s.replace(/\{(\w+)\}/g, (_, k: string) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
}

export function hasKey(key: string): boolean {
  return key in dicts[lang];
}
