// Okna dialogowe: komunikat, potwierdzenie, nowa mapa, pomoc, toasty.
import type { ModelTransform } from '../core/schema';
import { t } from '../i18n';
import { h } from './dom';
import { cheatSheet } from './shortcuts';

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

/** Pole tekstowe w oknie; null, gdy anulowano. */
export async function promptBox(title: string, label: string, value: string, hint?: string): Promise<string | null> {
  const input = h('input', { type: 'text', value });
  const v = await modal(title, h('div', { class: 'form' }, h('label', {}, label, input), hint ? h('p', { class: 'muted small' }, hint) : null), [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('btn.ok'), primary: true, value: 'ok' },
  ]);
  return v === 'ok' ? input.value : null;
}

/** Wybór jednej z opcji (lista do wyboru); null, gdy anulowano. */
export async function chooseBox(title: string, text: string, options: Array<{ value: string; label: string; group?: string }>, selected?: string): Promise<string | null> {
  const select = h('select', { size: Math.min(12, options.length + 2), class: 'choose' });
  const groups = new Map<string, HTMLElement>();
  for (const o of options) {
    const opt = h('option', { value: o.value, selected: o.value === selected }, o.label);
    if (!o.group) select.append(opt);
    else {
      if (!groups.has(o.group)) select.append(groups.set(o.group, h('optgroup', { label: o.group })).get(o.group)!);
      groups.get(o.group)!.append(opt);
    }
  }
  if (!select.value && options.length) select.value = options[0].value;
  select.addEventListener('dblclick', () => (document.querySelector('.modal .modal-buttons .primary') as HTMLElement | null)?.click());
  const v = await modal(title, h('div', { class: 'form' }, h('p', {}, text), select), [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('btn.ok'), primary: true, value: 'ok' },
  ]);
  return v === 'ok' ? select.value : null;
}

export interface ModelChoice {
  model: string | undefined;
  transform: ModelTransform;
}

/**
 * Okno „Model typu” / „Model postaci”: wybór modelu z biblioteki (albo brak – prosta bryła lub kapsuła)
 * i jego ułożenie względem punktu obiektu: skala, obrót (stopnie) i przesunięcie.
 */
export async function modelDialog(title: string, intro: string, models: string[], current: ModelChoice, noneLabel: string): Promise<ModelChoice | null> {
  const list = [...new Set([...(current.model ? [current.model] : []), ...models])];
  const select = h('select', {}, h('option', { value: '' }, noneLabel), ...list.map((m) => h('option', { value: m, selected: m === current.model }, m)));
  const vec = (label: string, v: number[], step: number) => {
    const inputs = v.map((x) => h('input', { type: 'number', step, value: x }));
    return { row: h('div', { class: 'vec' }, h('span', {}, label), ...['X', 'Y', 'Z'].map((a, k) => h('label', {}, a, inputs[k]))), read: () => inputs.map((i, k) => (Number.isFinite(Number(i.value)) && i.value !== '' ? Number(i.value) : v[k])) as [number, number, number] };
  };
  const tr = current.transform;
  const uniform = tr.scale[0] === tr.scale[1] && tr.scale[1] === tr.scale[2];
  const scaleOne = h('input', { type: 'number', step: 0.1, min: 0.0001, value: tr.scale[0] });
  const scale3 = vec(t('modelDlg.scale'), tr.scale, 0.1);
  const one = h('label', { class: 'check' }, h('input', { type: 'checkbox', checked: uniform, onchange: () => sync() }), t('modelDlg.uniform'));
  const scaleRow = h('label', { class: 'inline' }, t('modelDlg.scale'), scaleOne);
  const sync = () => {
    const on = (one.querySelector('input') as HTMLInputElement).checked;
    scaleRow.style.display = on ? '' : 'none';
    scale3.row.style.display = on ? 'none' : '';
  };
  const rot = vec(t('modelDlg.rotation'), tr.rotation, 5);
  const off = vec(t('modelDlg.offset'), tr.offset, 0.1);
  const body = h('div', { class: 'form' }, h('p', { class: 'muted small' }, intro), h('label', {}, t('modelDlg.model'), select), one, scaleRow, scale3.row, rot.row, off.row, h('p', { class: 'muted small' }, t('modelDlg.hint')));
  sync();
  const v = await modal(title, body, [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('btn.ok'), primary: true, value: 'ok' },
  ]);
  if (v !== 'ok') return null;
  const on = (one.querySelector('input') as HTMLInputElement).checked;
  const k = Math.max(0.0001, Number(scaleOne.value) || 1);
  const scale = on ? ([k, k, k] as [number, number, number]) : (scale3.read().map((x) => Math.max(0.0001, x || 1)) as [number, number, number]);
  return { model: select.value || undefined, transform: { scale, rotation: rot.read(), offset: off.read() } };
}

/** Ściąga skrótów (klawisz ? albo F1) – treść z ui/shortcuts.ts. */
export async function helpDialog(): Promise<void> {
  const sections = cheatSheet().map((sec) =>
    h(
      'section',
      { class: 'sc-section' },
      h('h3', {}, sec.title),
      h('table', { class: 'shortcuts' }, ...sec.rows.map(([k, d]) => h('tr', {}, h('td', {}, h('kbd', {}, k)), h('td', {}, d)))),
    ),
  );
  const mouse = h('ul', {}, ...['help.mouse1', 'help.mouse2', 'help.mouse3', 'help.mouse4'].map((k) => h('li', {}, t(k))));
  const body = h(
    'div',
    { class: 'help' },
    h('h3', {}, t('help.mouse')),
    mouse,
    h('h3', {}, t('help.shortcuts')),
    h('p', { class: 'muted' }, t('help.shortcutsHint')),
    h('div', { class: 'sc-grid' }, ...sections),
    h('p', { class: 'muted' }, t('help.more')),
  );
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
