// Panel Biblioteka: wszystkie wczytane modele z miniaturami, wyszukiwaniem i folderami.
// Model przeciąga się na mapę (dekoracja) albo przypisuje do roli („Użyj jako…”).
import type { Ctx } from '../context';
import { modelBaseScale } from '../core/map';
import { sameModel } from '../core/objectModel';
import { locText } from '../core/schema';
import { getLang, t } from '../i18n';
import type { Thumbnails } from '../render/thumbnails';
import { clear, h } from './dom';
import { formatNum } from './units';

/** Typ danych przeciąganego modelu (przeciąganie z biblioteki na widok 3D). */
export const MODEL_DRAG_TYPE = 'application/x-edytor-model';

export interface LibraryActions {
  importFiles(): void;
  loadExamples(): void;
  place(name: string): void;
  useAs(name: string): void;
  setFolder(name: string): void;
  /** Skala bazowa / normalizacja do rozmiaru w metrach. */
  normalize(name: string): void;
  /** Obrys kolizji modelu (szczegół, poprawka, własny kształt). */
  collision(name: string): void;
  remove(name: string): void;
}

export interface LibraryState {
  query: string;
  collapsed: Set<string>;
}

/** Role modelu: postać gracza i typy ze schematu, które go używają. */
export function modelRoles(ctx: Ctx, name: string): string[] {
  const s = ctx.doc.schema;
  const out: string[] = [];
  if (sameModel(s.player.model, name)) out.push(t('lib.rolePlayer'));
  for (const ty of s.objectTypes) if (sameModel(ty.look.model, name)) out.push(locText(ty.name, getLang(), ty.id));
  return out;
}

export function renderLibrary(root: HTMLElement, ctx: Ctx, thumbs: Thumbnails, ls: LibraryState, actions: LibraryActions, rerender: () => void): void {
  const scroll = root.scrollTop;
  const focused = document.activeElement?.classList.contains('lib-search');
  clear(root);
  const names = ctx.models.fileNames.slice().sort((a, b) => a.localeCompare(b));
  const q = ls.query.trim().toLowerCase();
  const search = h('input', {
    type: 'search',
    class: 'lib-search',
    placeholder: t('lib.search'),
    value: ls.query,
    oninput: (e: Event) => {
      ls.query = (e.target as HTMLInputElement).value;
      rerender();
    },
  });
  root.append(
    h('p', { class: 'muted small' }, t('lib.intro')),
    h('div', { class: 'list-tools' }, search),
    h('div', { class: 'list-buttons' }, h('button', { onclick: actions.importFiles }, t('lib.import')), h('button', { onclick: actions.loadExamples, title: t('lib.examplesHint') }, t('lib.examples'))),
  );
  if (!names.length) {
    root.append(h('p', { class: 'muted small' }, t('lib.empty')));
    return;
  }
  const byFolder = new Map<string, string[]>();
  for (const n of names) {
    const folder = ctx.models.folders.get(n) ?? '';
    const roles = modelRoles(ctx, n);
    if (q && !n.toLowerCase().includes(q) && !folder.toLowerCase().includes(q) && !roles.some((r) => r.toLowerCase().includes(q))) continue;
    if (!byFolder.has(folder)) byFolder.set(folder, []);
    byFolder.get(folder)!.push(n);
  }
  const folders = [...byFolder.keys()].sort((a, b) => (a === '' ? 1 : b === '' ? -1 : a.localeCompare(b)));
  if (!folders.length) root.append(h('p', { class: 'muted small' }, t('lib.noMatch')));
  for (const f of folders) {
    const list = byFolder.get(f)!;
    const collapsed = ls.collapsed.has(f) && !q;
    root.append(
      h(
        'div',
        { class: 'lib-folder' },
        h('button', { class: 'icon', onclick: () => (collapsed ? ls.collapsed.delete(f) : ls.collapsed.add(f), rerender()) }, collapsed ? '▸' : '▾'),
        h('span', { class: 'grow' }, f || t('lib.noFolder')),
        h('span', { class: 'muted small' }, String(list.length)),
      ),
    );
    if (collapsed) continue;
    root.append(h('div', { class: 'lib-grid' }, ...list.map((n) => card(ctx, thumbs, n, actions))));
  }
  root.scrollTop = scroll;
  if (focused) {
    search.focus();
    search.setSelectionRange(search.value.length, search.value.length);
  }
}

function card(ctx: Ctx, thumbs: Thumbnails, name: string, actions: LibraryActions): HTMLElement {
  const url = thumbs.get(name);
  const failed = ctx.models.state(name) === 'error';
  const roles = modelRoles(ctx, name);
  const base = modelBaseScale(ctx.doc.map, name) !== 1 ? modelBaseScale(ctx.doc.map, name) : (ctx.models.baseScaleOf(name) ?? 1);
  const menu = h('details', { class: 'menu lib-menu' }, h('summary', { title: t('lib.more') }, '⋯'));
  const item = (label: string, fn: () => void, cls = '') =>
    h('button', {
      class: cls,
      onclick: (e: Event) => {
        e.stopPropagation();
        menu.open = false;
        fn();
      },
    }, label);
  menu.append(
    h(
      'div',
      { class: 'menu-list' },
      item(t('lib.place'), () => actions.place(name)),
      item(t('lib.useAs'), () => actions.useAs(name)),
      item(t('lib.normalize'), () => actions.normalize(name)),
      item(t('lib.collision'), () => actions.collision(name)),
      item(t('lib.folder'), () => actions.setFolder(name)),
      h('hr'),
      item(t('lib.remove'), () => actions.remove(name), 'danger'),
    ),
  );
  menu.addEventListener('toggle', () => {
    if (menu.open) setTimeout(() => document.addEventListener('click', () => (menu.open = false), { once: true }), 0);
  });
  return h(
    'div',
    {
      class: 'lib-card',
      draggable: 'true',
      title: `${name}\n${t('lib.dragHint')}`,
      ondragstart: (e: DragEvent) => {
        e.dataTransfer?.setData(MODEL_DRAG_TYPE, name);
        e.dataTransfer?.setData('text/plain', name);
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'copy';
      },
      ondblclick: () => actions.place(name),
    },
    h('div', { class: 'lib-thumb' }, url ? h('img', { src: url, alt: '', draggable: 'false' }) : h('span', { class: 'muted small' }, failed ? t('lib.failed') : '…')),
    h('div', { class: 'lib-name' }, name.replace(/\.glb$/i, '')),
    roles.length || base !== 1
      ? h('div', { class: 'lib-roles' }, ...roles.map((r) => h('span', { class: 'tag role' }, r)), base !== 1 ? h('span', { class: 'tag', title: t('lib.baseScaleHint') }, `× ${formatNum(base, 4)}`) : null)
      : null,
    menu,
  );
}
