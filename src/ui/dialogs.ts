// Okna dialogowe: komunikat, potwierdzenie, nowa mapa, pomoc, toasty.
import { t } from '../i18n';
import { h } from './dom';

export function modal(title: string, body: Node, buttons: Array<{ label: string; primary?: boolean; value: string }>, wide = false): Promise<string | null> {
  return new Promise((resolve) => {
    const close = (v: string | null) => {
      overlay.remove();
      document.removeEventListener('keydown', onKey, true);
      resolve(v);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        close(null);
      } else if (e.key === 'Enter' && !(e.target instanceof HTMLTextAreaElement)) {
        const p = buttons.find((b) => b.primary);
        if (p) {
          e.preventDefault();
          e.stopPropagation();
          close(p.value);
        }
      }
    };
    const overlay = h(
      'div',
      { class: 'modal-overlay', onmousedown: (e: Event) => e.target === overlay && close(null) },
      h(
        'div',
        { class: `modal${wide ? ' wide' : ''}`, role: 'dialog' },
        h('h2', {}, title),
        h('div', { class: 'modal-body' }, body),
        h('div', { class: 'modal-buttons' }, ...buttons.map((b) => h('button', { class: b.primary ? 'primary' : '', onclick: () => close(b.value) }, b.label))),
      ),
    );
    document.body.appendChild(overlay);
    document.addEventListener('keydown', onKey, true);
    (overlay.querySelector('input, select, button.primary') as HTMLElement | null)?.focus();
  });
}

export async function alertBox(title: string, text: string | Node): Promise<void> {
  await modal(title, typeof text === 'string' ? h('p', { class: 'pre' }, text) : text, [{ label: t('btn.ok'), primary: true, value: 'ok' }]);
}

export async function confirmBox(title: string, text: string, okLabel = t('btn.ok')): Promise<boolean> {
  return (await modal(title, h('p', { class: 'pre' }, text), [
    { label: t('btn.cancel'), value: 'no' },
    { label: okLabel, primary: true, value: 'ok' },
  ])) === 'ok';
}

export interface NewMapValues {
  name: string;
  width: number;
  depth: number;
  resolution: number;
  height: number;
}

export async function newMapDialog(d: NewMapValues): Promise<NewMapValues | null> {
  const name = h('input', { type: 'text', value: d.name });
  const width = h('input', { type: 'number', min: 4, max: 4096, value: d.width });
  const depth = h('input', { type: 'number', min: 4, max: 4096, value: d.depth });
  const res = h('select', {}, ...[65, 129, 257, 513].map((r) => h('option', { value: r, selected: r === d.resolution }, t('newMap.resOption', { n: r }))));
  const height = h('input', { type: 'number', step: 0.1, value: d.height });
  const body = h(
    'div',
    { class: 'form' },
    h('label', {}, t('newMap.name'), name),
    h('div', { class: 'row2' }, h('label', {}, t('newMap.width'), width), h('label', {}, t('newMap.depth'), depth)),
    h('label', {}, t('newMap.resolution'), res),
    h('p', { class: 'muted' }, t('newMap.resolutionHint')),
    h('label', {}, t('newMap.height'), height),
  );
  const v = await modal(t('newMap.title'), body, [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('newMap.create'), primary: true, value: 'ok' },
  ]);
  if (v !== 'ok') return null;
  const n = (el: HTMLInputElement, def: number, min: number, max: number) => Math.min(max, Math.max(min, Number(el.value) || def));
  return {
    name: name.value.trim() || d.name,
    width: n(width, d.width, 4, 4096),
    depth: n(depth, d.depth, 4, 4096),
    resolution: Number(res.value),
    height: Number(height.value) || 0,
  };
}

export const SHORTCUTS: Array<[string, string]> = [
  ['Q', 'sc.select'],
  ['W / E / R', 'sc.transform'],
  ['B', 'sc.sculpt'],
  ['P', 'sc.paint'],
  ['1 – 5', 'sc.heightTools'],
  ['[ / ]', 'sc.brushSize'],
  ['Shift', 'sc.invert'],
  ['Ctrl + klik', 'sc.pickHeight'],
  ['Esc', 'sc.escape'],
  ['Enter', 'sc.finish'],
  ['Backspace', 'sc.undoPoint'],
  ['Alt + klik', 'sc.deleteVertex'],
  ['Ctrl + Z', 'sc.undo'],
  ['Ctrl + Y / Ctrl + Shift + Z', 'sc.redo'],
  ['Ctrl + C / Ctrl + V', 'sc.copyPaste'],
  ['Ctrl + D', 'sc.duplicate'],
  ['Delete', 'sc.delete'],
  ['Ctrl + A', 'sc.selectAll'],
  ['Ctrl + G', 'sc.group'],
  ['H', 'sc.hide'],
  ['L', 'sc.lock'],
  ['G', 'sc.ground'],
  ['F', 'sc.focus'],
  ['X', 'sc.snap'],
  ['C', 'sc.gameView'],
  ['Ctrl + S', 'sc.save'],
  ['Ctrl + O', 'sc.open'],
  ['F1 / ?', 'sc.help'],
];

export async function helpDialog(): Promise<void> {
  const table = h(
    'table',
    { class: 'shortcuts' },
    ...SHORTCUTS.map(([k, key]) => h('tr', {}, h('td', {}, h('kbd', {}, k.replace('klik', t('sc.click')))), h('td', {}, t(key)))),
  );
  const mouse = h('ul', {}, ...['help.mouse1', 'help.mouse2', 'help.mouse3', 'help.mouse4'].map((k) => h('li', {}, t(k))));
  const body = h('div', { class: 'help' }, h('h3', {}, t('help.mouse')), mouse, h('h3', {}, t('help.shortcuts')), table, h('p', { class: 'muted' }, t('help.more')));
  await modal(t('help.title'), body, [{ label: t('btn.close'), primary: true, value: 'ok' }], true);
}

let toastBox: HTMLElement | null = null;
export function toast(msg: string, kind: 'info' | 'error' = 'info'): void {
  if (!toastBox) {
    toastBox = h('div', { class: 'toasts' });
    document.body.appendChild(toastBox);
  }
  const el = h('div', { class: `toast ${kind}` }, msg);
  toastBox.appendChild(el);
  setTimeout(() => el.classList.add('hide'), kind === 'error' ? 5000 : 2800);
  setTimeout(() => el.remove(), kind === 'error' ? 5500 : 3300);
}
