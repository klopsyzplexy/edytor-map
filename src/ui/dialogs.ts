// Okna dialogowe: komunikat, potwierdzenie, nowa mapa, pomoc, toasty.
import type { Vec3 } from '../core/map';
import type { ResizeAnchor, ResizeMode, ResizeOptions } from '../core/resize';
import { proposeBaseScale } from '../core/scaleNormalize';
import type { ModelTransform, ScaleCategory, ScaleMeasure, WorldScale } from '../core/schema';
import { t } from '../i18n';
import { h } from './dom';
import { cheatSheet } from './shortcuts';
import { formatNum } from './units';

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

export interface NormalizeRow {
  /** Nazwa modelu w bibliotece (np. beczka.glb). */
  name: string;
  /** Wymiary pliku modelu w jednostkach mapy (przy skali 1); null – nie udało się zmierzyć. */
  size: Vec3 | null;
  /** Kategoria proponowana (zgadnięta z nazwy albo zapisana w bibliotece); '' – bez normalizacji. */
  category: string;
  /** Obecna skala bazowa. */
  baseScale: number;
}

export interface NormalizeResult {
  name: string;
  baseScale: number;
  category: string;
}

/**
 * Normalizacja skali modeli: edytor mierzy model, a użytkownik wybiera kategorię (rozmiar docelowy w metrach
 * ze schematu albo domyślny) lub wpisuje własny rozmiar. Wynik: skala bazowa każdego modelu.
 */
export async function normalizeDialog(rows: NormalizeRow[], scale: WorldScale, catName: (c: ScaleCategory) => string): Promise<NormalizeResult[] | null> {
  const upm = scale.unitsPerMeter;
  const CUSTOM = '@custom';
  const fmt = (v: number) => formatNum(v);
  const readers: Array<() => NormalizeResult> = [];
  const table = h('table', { class: 'normalize' }, h('tr', {}, ...['norm.model', 'norm.measured', 'norm.category', 'norm.result'].map((k) => h('th', {}, t(k)))));
  for (const r of rows) {
    const opts = [
      h('option', { value: '' }, t('norm.keep')),
      ...scale.categories.map((c) => {
        const range = c.min !== undefined && c.max !== undefined ? `${fmt(c.min)}–${fmt(c.max)}` : fmt(c.size);
        return h('option', { value: c.id, selected: c.id === r.category }, `${catName(c)} (${range} m, ${t(`norm.measure.${c.measure}`)})`);
      }),
      h('option', { value: CUSTOM }, t('norm.custom')),
    ];
    const select = h('select', { disabled: !r.size }, ...opts) as HTMLSelectElement;
    const customM = h('input', { type: 'number', min: 0.01, step: 0.1, value: 1, class: 'short' }) as HTMLInputElement;
    const measure = h('select', {}, h('option', { value: 'height' }, t('norm.measure.height')), h('option', { value: 'width' }, t('norm.measure.width'))) as HTMLSelectElement;
    const customBox = h('span', { class: 'inline' }, customM, ' m ', measure);
    const result = h('span', {});
    const compute = (): NormalizeResult => {
      const v = select.value;
      if (!r.size || v === '') return { name: r.name, baseScale: r.baseScale, category: '' };
      const cat: ScaleCategory = v === CUSTOM ? { id: CUSTOM, size: Number(customM.value) || 1, measure: measure.value as ScaleMeasure } : scale.categories.find((c) => c.id === v)!;
      const p = proposeBaseScale(r.size, cat, upm, v === CUSTOM ? Number(customM.value) || 1 : undefined);
      return { name: r.name, baseScale: p.baseScale, category: v === CUSTOM ? '' : v };
    };
    const update = () => {
      customBox.style.display = select.value === CUSTOM ? '' : 'none';
      const res = compute();
      if (!r.size) result.textContent = t('norm.noSize');
      else {
        const s = r.size.map((x) => (x * res.baseScale) / upm);
        result.textContent = t('norm.resultText', { scale: formatNum(res.baseScale, 4), size: `${fmt(s[0])} × ${fmt(s[1])} × ${fmt(s[2])}` });
      }
    };
    for (const el of [select, customM, measure]) el.addEventListener('input', update);
    update();
    readers.push(compute);
    const measured = r.size ? `${fmt(r.size[0] / upm)} × ${fmt(r.size[1] / upm)} × ${fmt(r.size[2] / upm)} m` : '—';
    table.append(h('tr', {}, h('td', {}, r.name.replace(/\.glb$/i, '')), h('td', { title: t('norm.measuredHint', { scale: formatNum(r.baseScale, 4) }) }, measured), h('td', {}, select, customBox), h('td', {}, result)));
  }
  const body = h('div', { class: 'form' }, h('p', { class: 'muted small' }, t('norm.intro', { upm: formatNum(upm, 4) })), table, h('p', { class: 'muted small' }, t('norm.hint')));
  const v = await modal(t('norm.title'), body, [
    { label: t('norm.skip'), value: 'no' },
    { label: t('norm.apply'), primary: true, value: 'ok' },
  ], true);
  return v === 'ok' ? readers.map((f) => f()) : null;
}

export interface ResizeDialogInput {
  size: [number, number];
  /** Punkty siatki na dłuższym boku przy obecnej gęstości dla podanego rozmiaru. */
  pointsFor: (w: number, d: number) => number;
  /** Liczba punktów siatki dla rozmiaru i punktów na dłuższym boku. */
  gridFor: (w: number, d: number, points: number) => [number, number];
  warnPoints: number;
  layers: Array<{ id: string; name: string }>;
  fillHeight: number;
}

/** Mapa → Zmień rozmiar…: nowa szerokość i długość (także w procentach), kotwica, tryb, warstwa nowego terenu. */
export async function resizeDialog(d: ResizeDialogInput): Promise<ResizeOptions | null> {
  const [w0, d0] = d.size;
  const num = (v: number, step = 1) => h('input', { type: 'number', min: 1, step, value: v, class: 'short' }) as HTMLInputElement;
  const w = num(w0);
  const dd = num(d0);
  const pw = num(100);
  const pd = num(100);
  const lock = h('input', { type: 'checkbox', checked: true }) as HTMLInputElement;
  const points = num(d.pointsFor(w0, d0));
  let pointsTouched = false;
  let anchor: ResizeAnchor = 'center';
  const anchorBtns = new Map<ResizeAnchor, HTMLButtonElement>();
  const anchorGrid = h('div', { class: 'anchor-grid' });
  const cells: Array<ResizeAnchor | null> = ['nw', null, 'ne', null, 'center', null, 'sw', null, 'se'];
  for (const a of cells) {
    if (!a) {
      anchorGrid.append(h('span'));
      continue;
    }
    const b = h('button', { type: 'button', title: t(`resize.anchor.${a}`), onclick: () => ((anchor = a), sync()) }, '●') as HTMLButtonElement;
    anchorBtns.set(a, b);
    anchorGrid.append(b);
  }
  const mode = h('select', {}, h('option', { value: 'expand' }, t('resize.expand')), h('option', { value: 'stretch' }, t('resize.stretch'))) as HTMLSelectElement;
  const layer = h('select', {}, ...d.layers.map((l) => h('option', { value: l.id }, l.name))) as HTMLSelectElement;
  const fillH = num(d.fillHeight, 0.1);
  fillH.min = '';
  const info = h('p', { class: 'small' });
  const modeHint = h('p', { class: 'muted small' });
  const fillRow = h('div', { class: 'inline' }, h('label', {}, t('resize.fillLayer'), layer), h('label', {}, t('resize.fillHeight'), fillH));
  const sync = () => {
    for (const [a, b] of anchorBtns) b.classList.toggle('active', a === anchor);
    const expand = mode.value === 'expand';
    fillRow.style.display = expand ? '' : 'none';
    anchorGrid.style.opacity = expand ? '1' : '0.4';
    modeHint.textContent = t(expand ? 'resize.expandHint' : 'resize.stretchHint');
    const W = Number(w.value) || w0;
    const D = Number(dd.value) || d0;
    if (!pointsTouched) points.value = String(d.pointsFor(W, D));
    const [nx, nz] = d.gridFor(W, D, Number(points.value) || 2);
    info.textContent = t('resize.grid', { nx, nz, cell: formatNum(W / (nx - 1), 3) });
    if (nx * nz > d.warnPoints) info.append(h('span', { class: 'issue-inline warning' }, ' ' + t('resize.warn', { n: formatNum(d.warnPoints, 0) })));
  };
  const fromPct = (src: HTMLInputElement, dst: HTMLInputElement, base: number) => {
    dst.value = String(Math.round(((Number(src.value) || 100) * base) / 100 * 1000) / 1000);
  };
  pw.oninput = () => {
    fromPct(pw, w, w0);
    if (lock.checked) {
      pd.value = pw.value;
      fromPct(pd, dd, d0);
    }
    sync();
  };
  pd.oninput = () => {
    fromPct(pd, dd, d0);
    if (lock.checked) {
      pw.value = pd.value;
      fromPct(pw, w, w0);
    }
    sync();
  };
  w.oninput = () => {
    pw.value = String(Math.round(((Number(w.value) || w0) / w0) * 1000) / 10);
    if (lock.checked) {
      pd.value = pw.value;
      fromPct(pd, dd, d0);
    }
    sync();
  };
  dd.oninput = () => {
    pd.value = String(Math.round(((Number(dd.value) || d0) / d0) * 1000) / 10);
    if (lock.checked) {
      pw.value = pd.value;
      fromPct(pw, w, w0);
    }
    sync();
  };
  points.oninput = () => {
    pointsTouched = true;
    sync();
  };
  mode.onchange = sync;
  const body = h(
    'div',
    { class: 'form resize' },
    h('p', { class: 'muted small' }, t('resize.now', { w: formatNum(w0), d: formatNum(d0) })),
    h('div', { class: 'resize-grid' },
      h('span', {}, t('resize.width')), w, pw, h('span', { class: 'muted' }, '%'),
      h('span', {}, t('resize.depth')), dd, pd, h('span', { class: 'muted' }, '%'),
    ),
    h('label', { class: 'check' }, lock, t('resize.lock')),
    h('label', {}, t('resize.mode'), mode),
    modeHint,
    h('div', { class: 'inline' }, h('span', {}, t('resize.anchor')), anchorGrid),
    fillRow,
    h('label', { title: t('resize.pointsHint') }, t('resize.points'), points),
    info,
  );
  sync();
  const v = await modal(t('resize.title'), body, [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('resize.ok'), primary: true, value: 'ok' },
  ]);
  if (v !== 'ok') return null;
  const W = Number(w.value);
  const D = Number(dd.value);
  if (!(W > 0) || !(D > 0)) return null;
  return {
    width: W,
    depth: D,
    mode: mode.value as ResizeMode,
    anchor,
    fillLayer: layer.value,
    fillHeight: Number(fillH.value) || 0,
    resolution: pointsTouched ? Number(points.value) || undefined : undefined,
  };
}
