// Skróty klawiszowe w jednym miejscu: etykiety na przyciskach, w dymkach i w ściądze (klawisz ?).
// Obsługa klawiszy jest w app.ts (bindKeys) – przy zmianie skrótu trzeba poprawić oba miejsca.
import { t } from '../i18n';

/** Etykiety klawiszy. Słowa (spacja, strzałki, klik) pochodzą z tłumaczeń. */
export const KEY = {
  select: 'Q',
  translate: 'W',
  rotate: 'E',
  scale: 'R',
  heightTools: '1 – 5',
  sculpt: 'B',
  stamp: 'T',
  paint: 'P',
  place: 'O',
  lasso: 'L',
  line: 'K',
  brushSize: '[ / ]',
  brushStrength: 'Shift + [ / ]',
  brushRotate: ', / .',
  group: 'Ctrl + G',
  ungroup: 'Ctrl + Shift + G',
  hide: 'H',
  showAll: 'Shift + H',
  lock: 'Shift + L',
  undo: 'Ctrl + Z',
  redo: 'Ctrl + Y',
  copyPaste: 'Ctrl + C / Ctrl + V',
  duplicate: 'Ctrl + D',
  delete: 'Delete',
  selectAll: 'Ctrl + A',
  focus: 'F',
  home: 'Home',
  gameView: 'V',
  grid: 'X',
  ground: 'G',
  save: 'Ctrl + S',
  open: 'Ctrl + O',
  help: '?',
} as const;

export type KeyId = keyof typeof KEY;

/** Dymek: opis i skrót w nawiasie. */
export function tip(text: string, key: KeyId): string {
  return `${text} (${KEY[key]})`;
}

type Row = [label: string | (() => string), descKey: string];

/** Ściąga: sekcje i wiersze (etykieta klawisza, klucz opisu). */
export function cheatSheet(): Array<{ title: string; rows: Array<[string, string]> }> {
  const sections: Array<[string, Row[]]> = [
    [
      'sc.sec.tools',
      [
        [KEY.select, 'sc.select'],
        [`${KEY.translate} / ${KEY.rotate} / ${KEY.scale}`, 'sc.transform'],
        [KEY.heightTools, 'sc.heightTools'],
        [KEY.sculpt, 'sc.sculpt'],
        [KEY.stamp, 'sc.stamp'],
        [KEY.paint, 'sc.paint'],
        [KEY.place, 'sc.place'],
        [KEY.lasso, 'sc.lasso'],
        [KEY.line, 'sc.line'],
        ['Esc', 'sc.escape'],
      ],
    ],
    [
      'sc.sec.brush',
      [
        [KEY.brushSize, 'sc.brushSize'],
        [KEY.brushStrength, 'sc.brushStrength'],
        [KEY.brushRotate, 'sc.brushRotate'],
        [() => `Shift + ${t('sc.click')}`, 'sc.invert'],
        [() => `Ctrl + ${t('sc.click')}`, 'sc.pickHeight'],
      ],
    ],
    [
      'sc.sec.objects',
      [
        [KEY.undo, 'sc.undo'],
        [`${KEY.redo} / Ctrl + Shift + Z`, 'sc.redo'],
        [KEY.copyPaste, 'sc.copyPaste'],
        [KEY.duplicate, 'sc.duplicate'],
        [KEY.delete, 'sc.delete'],
        [KEY.selectAll, 'sc.selectAll'],
        [KEY.group, 'sc.group'],
        [KEY.ungroup, 'sc.ungroup'],
        [KEY.hide, 'sc.hide'],
        [KEY.showAll, 'sc.showAll'],
        [KEY.lock, 'sc.lock'],
        [KEY.ground, 'sc.ground'],
        [KEY.grid, 'sc.snap'],
        ['Enter', 'sc.finish'],
        ['Backspace', 'sc.undoPoint'],
        [() => `Alt + ${t('sc.click')}`, 'sc.deleteVertex'],
      ],
    ],
    [
      'sc.sec.camera',
      [
        [KEY.focus, 'sc.focus'],
        [KEY.home, 'sc.home'],
        [() => t('key.arrows'), 'sc.arrows'],
        [() => `${t('key.space')} + ${t('key.drag')}`, 'sc.spacePan'],
        [KEY.gameView, 'sc.gameView'],
      ],
    ],
    [
      'sc.sec.file',
      [
        [KEY.save, 'sc.save'],
        [KEY.open, 'sc.open'],
        [`${KEY.help} / F1`, 'sc.help'],
      ],
    ],
  ];
  return sections.map(([title, rows]) => ({ title: t(title), rows: rows.map(([k, d]) => [typeof k === 'function' ? k() : k, t(d)] as [string, string]) }));
}
