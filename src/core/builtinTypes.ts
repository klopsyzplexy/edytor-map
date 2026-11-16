// Wbudowane typy obiektów edytora: kolizje rysowane (lasso – obszar, linia z grubością).
// Działają z każdym schematem; ich id zaczynają się od „@”, czego nie może mieć typ ze schematu.
// Nazwy pochodzą z plików tłumaczeń.
import pl from '../i18n/pl.json';
import en from '../i18n/en.json';
import type { ObjectTypeDef } from './schema';

/** Wbudowane typy edytora (nie pochodzą ze schematu; „@” nie może wystąpić w id typu schematu). */
export const COLLISION_ZONE = '@collision-zone';
export const COLLISION_LINE = '@collision-line';

const tr = (key: string) => ({ pl: (pl as Record<string, string>)[key], en: (en as Record<string, string>)[key] });

export const BUILTIN_TYPES: ObjectTypeDef[] = [
  {
    id: COLLISION_ZONE,
    name: tr('builtin.collisionZone'),
    category: tr('builtin.category'),
    kind: 'zone',
    look: { shape: 'box', color: '#ff4d4d' },
    defaultSize: [1, 1, 1],
    flags: { collision: true, visibleInGame: false, walkable: false },
    properties: [],
    hint: tr('builtin.collisionZoneHint'),
  },
  {
    id: COLLISION_LINE,
    name: tr('builtin.collisionLine'),
    category: tr('builtin.category'),
    kind: 'path',
    look: { shape: 'box', color: '#ff8a3d' },
    defaultSize: [1, 1, 1],
    flags: { collision: true, visibleInGame: false, walkable: false },
    properties: [{ id: 'width', name: tr('builtin.width'), type: 'number', default: 1, required: true, min: 0.05, max: 1000, step: 0.1, hint: tr('builtin.widthHint') }],
    hint: tr('builtin.collisionLineHint'),
  },
];

export function isBuiltinType(id: string): boolean {
  return id.startsWith('@');
}

