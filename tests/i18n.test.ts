import { describe, expect, it } from 'vitest';
import en from '../src/i18n/en.json';
import pl from '../src/i18n/pl.json';

describe('tłumaczenia', () => {
  it('pl i en mają te same klucze i parametry', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(pl).sort());
    const params = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort();
    for (const k of Object.keys(pl)) expect(params((en as Record<string, string>)[k]), k).toEqual(params((pl as Record<string, string>)[k]));
  });
});
