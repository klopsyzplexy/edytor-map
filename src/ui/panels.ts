// Panele boczne: paleta obiektów, teren, lista obiektów, właściwości, walidacja.
import type { Ctx } from '../context';
import type { MapGroup, MapObject, Vec3 } from '../core/map';
import { BUILTIN_TYPES, COLLISION_LINE, DECORATION, simplify, smoothPoints } from '../core/collision';
import { isBuiltinType } from '../core/builtinTypes';
import { fileStem } from '../core/modelFiles';
import { changeableTypes, modelRef, objectFlags, objectModel, objectSize, sameModel } from '../core/objectModel';
import { cellSize, heightAt, modelBaseScale } from '../core/map';
import { getType, locText, type ObjectTypeDef, type PropDef, type PropValue, type Schema } from '../core/schema';
import { BRUSH_SHAPES, type HeightTool } from '../core/terrain';
import { openBinaryFiles } from '../storage/files';
import { KEY, tip } from './shortcuts';
import { validateMap, type Issue } from '../core/validate';
import { getLang, t } from '../i18n';
import { clear, h } from './dom';
import { formatNum } from './units';

export interface Actions {
  duplicate(): void;
  remove(): void;
  ground(): void;
  group(): void;
  ungroup(groupId: string): void;
  /** Ctrl + Shift + G: rozgrupowuje zaznaczone grupy (albo wyjmuje zaznaczone obiekty z ich grup). */
  ungroupSelection(): void;
  newGroup(): void;
  duplicateGroup(groupId: string): void;
  focusObject(id: string): void;
  toggleHidden(ids: string[]): void;
  toggleLocked(ids: string[]): void;
  /** „Zmień typ”: dekoracja ↔ typ ze schematu z zachowaniem modelu, pozycji, obrotu i skali. */
  changeType(ids: string[], typeId: string): void;
  /** Własny model obiektów (dekoracji); undefined – model typu. */
  setObjectModel(ids: string[], model: string | undefined): void;
  /** Okno „Model typu” (zmiana zapisuje się w schemacie). */
  editTypeModel(typeId: string): void;
  /** Skala bazowa modelu (wszystkie kopie na mapie i domyślna w bibliotece). */
  setBaseScale(ref: string, baseScale: number): void;
}

const L = (x: Parameters<typeof locText>[0], fb = '') => locText(x, getLang(), fb);

/** Przerysowanie z zachowaniem fokusu pola (po klawiszu Tab). */
function rerender(root: HTMLElement, build: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active && root.contains(active) ? active.dataset.key : undefined;
  const scroll = root.scrollTop;
  clear(root);
  build();
  root.scrollTop = scroll;
  if (key) (root.querySelector(`[data-key="${CSS.escape(key)}"]`) as HTMLElement | null)?.focus();
}

function swatch(color: string): HTMLElement {
  return h('span', { class: 'swatch', style: `background:${color}` });
}

// ---------------- Paleta ----------------

export function renderPalette(root: HTMLElement, ctx: Ctx): void {
  rerender(root, () => {
    const cats = new Map<string, ObjectTypeDef[]>();
    for (const ty of ctx.doc.schema.objectTypes) {
      const c = L(ty.category);
      if (!cats.has(c)) cats.set(c, []);
      cats.get(c)!.push(ty);
    }
    root.append(h('p', { class: 'muted small' }, t('palette.intro')));
    // kolizje rysowane – wbudowane w edytor, działają z każdym schematem
    const st = ctx.state;
    root.append(
      h('h3', {}, t('builtin.category')),
      h(
        'div',
        { class: 'palette' },
        h(
          'button',
          { class: `palette-item${st.tool === 'lasso' ? ' active' : ''}`, title: t('builtin.collisionZoneHint'), onclick: () => ctx.setTool('lasso') },
          swatch(BUILTIN_TYPES[0].look.color),
          h('span', { class: 'name' }, t('tool.lasso')),
          h('span', { class: 'key' }, KEY.lasso),
        ),
        h(
          'button',
          {
            class: `palette-item${st.tool === 'place' && st.placeType === COLLISION_LINE ? ' active' : ''}`,
            title: t('builtin.collisionLineHint'),
            onclick: () => {
              st.placeType = COLLISION_LINE;
              ctx.setTool('place');
            },
          },
          swatch(BUILTIN_TYPES[1].look.color),
          h('span', { class: 'name' }, t('tool.line')),
          h('span', { class: 'key' }, KEY.line),
        ),
      ),
      slider(t('lasso.smooth'), st.lassoSmooth, 0, 3, 1, (v) => (st.lassoSmooth = v), 'lassoSmooth', t('lasso.smoothHint')),
    );
    for (const [cat, types] of cats) {
      root.append(
        h('h3', {}, cat),
        h(
          'div',
          { class: 'palette' },
          ...types.map((ty) =>
            h(
              'button',
              {
                class: `palette-item${ctx.state.tool === 'place' && ctx.state.placeType === ty.id ? ' active' : ''}`,
                title: [L(ty.hint), t(`kind.${ty.kind}`)].filter(Boolean).join(' – '),
                onclick: () => {
                  ctx.state.placeType = ty.id;
                  ctx.state.lastPaletteType = ty.id;
                  ctx.setTool('place');
                },
              },
              swatch(ty.look.color),
              h('span', { class: 'name' }, L(ty.name, ty.id)),
              h('span', { class: 'kind' }, t(`kindShort.${ty.kind}`)),
              ctx.state.lastPaletteType === ty.id ? h('span', { class: 'key', title: tip(t('tb.placeHint'), 'place') }, KEY.place) : null,
            ),
          ),
        ),
      );
    }
  });
}

// ---------------- Teren ----------------

const HEIGHT_TOOLS: HeightTool[] = ['raise', 'lower', 'smooth', 'flatten', 'noise'];

function slider(label: string, value: number, min: number, max: number, step: number, onInput: (v: number) => void, key: string, title?: string): HTMLElement {
  const out = h('span', { class: 'value' }, String(value));
  const input = h('input', {
    type: 'range',
    min,
    max,
    step,
    value,
    'data-key': key,
    oninput: () => {
      out.textContent = input.value;
      onInput(Number(input.value));
    },
  });
  return h('label', { class: 'slider', title }, h('span', {}, label), input, out);
}

export function renderTerrainPanel(root: HTMLElement, ctx: Ctx): void {
  const s = ctx.state;
  const map = ctx.doc.map;
  rerender(root, () => {
    const maxR = Math.max(map.settings.size[0], map.settings.size[1]) / 3;
    root.append(
      h('h3', {}, t('terrain.sculpt')),
      h(
        'div',
        { class: 'tool-grid' },
        ...HEIGHT_TOOLS.map((ht, k) =>
          h(
            'button',
            {
              class: s.tool === 'sculpt' && s.heightTool === ht ? 'active' : '',
              title: `${t(`hint.sculpt.${ht}`)} (${k + 1})`,
              onclick: () => {
                s.heightTool = ht;
                ctx.setTool('sculpt');
              },
            },
            t(`terrain.tool.${ht}`),
            h('span', { class: 'key' }, String(k + 1)),
          ),
        ),
      ),
      h(
        'div',
        { class: 'shape-row', title: t('terrain.shape') },
        ...BRUSH_SHAPES.map((sh) =>
          h(
            'button',
            {
              class: (s.brush.shape ?? 'circle') === sh ? 'active' : '',
              title: t(`terrain.shape.${sh}`),
              onclick: () => {
                s.brush.shape = sh;
                if (s.tool !== 'sculpt' && s.tool !== 'paint') ctx.setTool('sculpt');
                else ctx.stateChanged();
              },
            },
            h('span', { class: `shape-icon ${sh}` }),
            t(`terrain.shape.${sh}`),
          ),
        ),
      ),
      slider(t('terrain.size'), s.brush.radius, 0.5, Math.round(maxR), 0.5, (v) => ((s.brush.radius = v), ctx.refreshBrush()), 'radius', '[ / ]'),
      slider(t('terrain.strength'), s.brush.strength, 0.05, 1, 0.05, (v) => (s.brush.strength = v), 'strength', 'Shift + [ / ]'),
      slider(t('terrain.softness'), s.brush.softness, 0, 1, 0.05, (v) => ((s.brush.softness = v), ctx.refreshBrush()), 'softness'),
      slider(t('terrain.angle'), s.brush.angle ?? 0, 0, 359, 1, (v) => ((s.brush.angle = v), ctx.refreshBrush()), 'angle', ', / .'),
      h(
        'label',
        { class: 'inline', title: t('terrain.targetHint') },
        t('terrain.target'),
        h('input', { type: 'number', step: 0.1, value: s.brush.target, 'data-key': 'target', onchange: (e: Event) => (s.brush.target = Number((e.target as HTMLInputElement).value) || 0) }),
      ),
      h('p', { class: 'muted small' }, t('terrain.sculptHelp')),

      h('h3', {}, t('terrain.stamp'), ' ', h('kbd', {}, KEY.stamp)),
      h(
        'div',
        { class: 'stamp-list' },
        ...ctx.stamps.entries.map((st) =>
          h(
            'button',
            {
              class: `stamp${s.tool === 'stamp' && s.stamp.id === st.id ? ' active' : ''}`,
              title: st.builtin ? t(st.name) : st.name,
              onclick: () => {
                s.stamp.id = st.id;
                s.stamp.midZero = st.midZero;
                ctx.setTool('stamp');
              },
            },
            h('img', { src: st.url, alt: '' }),
            h('span', {}, st.builtin ? t(st.name) : st.name),
          ),
        ),
      ),
      h(
        'label',
        { class: 'inline', title: t('terrain.stampHeightHint') },
        t('terrain.stampHeight'),
        h('input', { type: 'number', step: 0.5, value: s.stamp.height, 'data-key': 'stampHeight', onchange: (e: Event) => (s.stamp.height = Number((e.target as HTMLInputElement).value) || 0) }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: s.stamp.midZero,
          'data-key': 'stampMid',
          onchange: (e: Event) => {
            s.stamp.midZero = (e.target as HTMLInputElement).checked;
            ctx.stateChanged();
          },
        }),
        t('terrain.stampMid'),
      ),
      h(
        'button',
        {
          onclick: async () => {
            for (const f of await openBinaryFiles('image/*')) {
              try {
                const st = await ctx.stamps.addFile(f.name, f.data);
                s.stamp.id = st.id;
                s.stamp.midZero = false;
                ctx.setTool('stamp');
              } catch (e) {
                ctx.toast(`${f.name}: ${String(e)}`, 'error');
              }
            }
          },
        },
        t('terrain.stampUpload'),
      ),
      h('p', { class: 'muted small' }, t('terrain.stampHelp')),

      h('h3', {}, t('terrain.layers'), ' ', h('kbd', {}, KEY.paint)),
      h(
        'div',
        { class: 'layer-list' },
        ...ctx.doc.schema.terrainLayers.map((l, k) =>
          h(
            'button',
            {
              class: `layer${s.tool === 'paint' && s.paintLayer === l.id ? ' active' : ''}`,
              title: k === 0 ? t('terrain.baseLayer') : '',
              onclick: () => {
                s.paintLayer = l.id;
                ctx.setTool('paint');
              },
            },
            swatch(l.color),
            L(l.name, l.id),
            l.water ? h('span', { class: 'tag' }, t('terrain.water')) : null,
            k === 0 ? h('span', { class: 'tag' }, t('terrain.base')) : null,
          ),
        ),
      ),
      h('p', { class: 'muted small' }, t('terrain.paintHelp')),
      h(
        'label',
        { class: 'inline', title: t('terrain.waterLevelHint') },
        t('terrain.waterLevel'),
        h('input', {
          type: 'number',
          step: 0.1,
          value: map.settings.waterLevel,
          'data-key': 'water',
          onchange: (e: Event) => {
            const v = Number((e.target as HTMLInputElement).value) || 0;
            ctx.doc.updateSettings((st) => (st.waterLevel = v));
          },
        }),
      ),

      h('h3', {}, t('terrain.slope')),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: map.settings.slope.enabled,
          'data-key': 'slopeOn',
          onchange: (e: Event) => {
            const on = (e.target as HTMLInputElement).checked;
            ctx.doc.updateSettings((st) => (st.slope.enabled = on));
          },
        }),
        t('terrain.slopeEnable'),
      ),
      h(
        'label',
        { class: 'inline' },
        t('terrain.slopeMax'),
        h('input', {
          type: 'number',
          min: 1,
          max: 89,
          step: 1,
          value: map.settings.slope.maxDeg,
          'data-key': 'slopeMax',
          onchange: (e: Event) => {
            const v = Math.min(89, Math.max(1, Number((e.target as HTMLInputElement).value) || 40));
            ctx.doc.updateSettings((st) => (st.slope.maxDeg = v));
          },
        }),
      ),
      h(
        'label',
        { class: 'check' },
        h('input', {
          type: 'checkbox',
          checked: s.slopeOverlay,
          'data-key': 'slopeOverlay',
          onchange: (e: Event) => {
            s.slopeOverlay = (e.target as HTMLInputElement).checked;
            ctx.stateChanged();
          },
        }),
        t('terrain.slopePreview'),
      ),
      h('p', { class: 'muted small' }, t('terrain.slopeHelp')),
      h('h3', {}, t('terrain.mapInfo')),
      h('p', { class: 'muted small' }, t('terrain.mapInfoText', { w: map.settings.size[0], d: map.settings.size[1], nx: map.terrain.nx, nz: map.terrain.nz })),
    );
  });
}

// ---------------- Lista obiektów (drzewo grup) ----------------

export interface ListState {
  query: string;
  type: string;
  collapsed: Set<string>;
}

/** Przeciągany element drzewa (obiekty i grupy). */
interface DragPayload {
  objects: string[];
  groups: string[];
}
const DRAG_MIME = 'application/x-edytor-map';
let dragging: DragPayload | null = null;

export function renderObjectList(root: HTMLElement, ctx: Ctx, ls: ListState, actions: Actions, rerenderAll: () => void): void {
  const doc = ctx.doc;
  rerender(root, () => {
    const q = ls.query.trim().toLowerCase();
    const filtering = !!(q || ls.type);
    const match = (o: MapObject) => {
      if (ls.type && o.type !== ls.type) return false;
      if (!q) return true;
      const ty = getType(doc.schema, o.type);
      return o.name.toLowerCase().includes(q) || o.type.toLowerCase().includes(q) || L(ty?.name).toLowerCase().includes(q);
    };
    const search = h('input', {
      type: 'search',
      placeholder: t('list.search'),
      value: ls.query,
      'data-key': 'search',
      oninput: (e: Event) => {
        ls.query = (e.target as HTMLInputElement).value;
        rerenderAll();
      },
    });
    const filter = h(
      'select',
      {
        'data-key': 'filter',
        onchange: (e: Event) => {
          ls.type = (e.target as HTMLSelectElement).value;
          rerenderAll();
        },
      },
      h('option', { value: '' }, t('list.allTypes')),
      ...[...doc.schema.objectTypes, ...BUILTIN_TYPES].map((ty) => h('option', { value: ty.id, selected: ls.type === ty.id }, L(ty.name, ty.id))),
    );
    const none = doc.selection.length === 0;
    root.append(
      h('div', { class: 'list-tools' }, search, filter),
      h(
        'div',
        { class: 'list-buttons' },
        h('button', { title: tip(t('list.groupHint'), 'group'), disabled: none, onclick: actions.group }, t('list.group')),
        h('button', { title: tip(t('list.ungroupHint'), 'ungroup'), disabled: none, onclick: actions.ungroupSelection }, t('list.ungroup')),
        h('button', { title: `${KEY.hide}; ${t('sc.showAll')}: ${KEY.showAll}`, disabled: none, onclick: () => actions.toggleHidden(doc.selection) }, t('list.hide')),
        h('button', { title: KEY.lock, disabled: none, onclick: () => actions.toggleLocked(doc.selection) }, t('list.lock')),
        h('button', { title: `${t('list.newGroupHint')}`, onclick: actions.newGroup }, t('list.newGroup')),
      ),
      h('p', { class: 'muted small' }, t('list.treeHelp')),
    );

    // --- przeciąganie ---
    const payloadFor = (kind: 'object' | 'group', id: string): DragPayload => {
      if (kind === 'group') return { objects: [], groups: [id] };
      return doc.selection.includes(id) ? { objects: [...doc.selection], groups: [] } : { objects: [id], groups: [] };
    };
    const dragSource = (el: HTMLElement, kind: 'object' | 'group', id: string) => {
      el.draggable = true;
      el.addEventListener('dragstart', (e) => {
        dragging = payloadFor(kind, id);
        e.dataTransfer?.setData(DRAG_MIME, JSON.stringify(dragging));
        if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
        e.stopPropagation();
      });
      el.addEventListener('dragend', () => {
        dragging = null;
        root.querySelectorAll('.drop-into, .drop-before').forEach((x) => x.classList.remove('drop-into', 'drop-before'));
      });
    };
    /** Cel upuszczenia: do grupy (`into`) albo przed element (`before`) w grupie `parent`. */
    const dropTarget = (el: HTMLElement, parent: string | null, mode: 'into' | 'before', before?: { kind: 'object' | 'group'; id: string }) => {
      const cls = mode === 'into' ? 'drop-into' : 'drop-before';
      el.addEventListener('dragover', (e) => {
        if (!dragging) return;
        if (parent && dragging.groups.some((g) => doc.groupDescendants(g).has(parent))) return;
        e.preventDefault();
        e.stopPropagation();
        el.classList.add(cls);
      });
      el.addEventListener('dragleave', () => el.classList.remove(cls));
      el.addEventListener('drop', (e) => {
        e.preventDefault();
        e.stopPropagation();
        el.classList.remove(cls);
        const p = dragging;
        dragging = null;
        if (!p) return;
        // kolejność zmienia się tylko wśród elementów tego samego rodzaju
        const b = before && ((before.kind === 'object' && p.objects.length) || (before.kind === 'group' && p.groups.length)) ? before : undefined;
        if (!doc.moveToGroup(p.objects, p.groups, parent, b)) ctx.toast(t('list.cantMove'), 'error');
      });
    };

    const objRow = (o: MapObject, depth: number) => {
      const ty = getType(doc.schema, o.type);
      const selected = doc.selection.includes(o.id);
      const el = h(
        'div',
        {
          class: `list-row${selected ? ' selected' : ''}${o.hidden ? ' dim' : ''}`,
          style: `padding-left:${4 + depth * 14}px`,
          onclick: (e: MouseEvent) => doc.select([o.id], e.shiftKey || e.ctrlKey || e.metaKey ? 'toggle' : 'set'),
          ondblclick: () => actions.focusObject(o.id),
          title: t('list.rowHint'),
        },
        h('button', { class: `icon${o.hidden ? ' off' : ''}`, title: t('list.hide'), onclick: (e: Event) => (e.stopPropagation(), actions.toggleHidden([o.id])) }, o.hidden ? '◌' : '👁'),
        h('button', { class: `icon${o.locked ? '' : ' off'}`, title: t('list.lock'), onclick: (e: Event) => (e.stopPropagation(), actions.toggleLocked([o.id])) }, o.locked ? '🔒' : '🔓'),
        swatch(ty?.look.color ?? '#f0f'),
        h('span', { class: 'name' }, o.name),
        h('span', { class: 'type' }, L(ty?.name, o.type)),
      );
      dragSource(el, 'object', o.id);
      dropTarget(el, o.group && doc.getGroup(o.group) ? o.group : null, 'before', { kind: 'object', id: o.id });
      return el;
    };

    const list = h('div', { class: 'list' });
    const LIMIT = 500;
    let shown = 0;
    const objectsIn = (gid: string | null) => doc.map.objects.filter((o) => (gid ? o.group === gid : !o.group || !doc.getGroup(o.group)));
    const hasMatch = (gid: string) => doc.groupObjectIds(gid).some((id) => match(doc.getObject(id)!));

    const groupNode = (g: MapGroup, depth: number) => {
      if (filtering && !hasMatch(g.id)) return;
      const open = filtering || !ls.collapsed.has(g.id);
      const content = doc.groupObjectIds(g.id);
      const allSelected = content.length > 0 && content.every((id) => doc.selection.includes(id));
      const nameInput = h('input', {
        class: 'group-name',
        value: g.name,
        'data-key': `g-${g.id}`,
        title: t('list.renameHint'),
        onclick: (e: Event) => e.stopPropagation(),
        onchange: (e: Event) => doc.updateGroup(g.id, { name: (e.target as HTMLInputElement).value || g.name }),
      });
      const row = h(
        'div',
        {
          class: `list-group${g.hidden ? ' dim' : ''}${allSelected ? ' selected' : ''}`,
          style: `padding-left:${depth * 14}px`,
          title: t('list.selectGroupHint'),
          onclick: (e: MouseEvent) => doc.select(content, e.shiftKey || e.ctrlKey || e.metaKey ? 'add' : 'set'),
          ondblclick: () => content.length && actions.focusObject(content[0]),
        },
        h('button', { class: 'icon', title: open ? t('list.collapse') : t('list.expand'), onclick: (e: Event) => (e.stopPropagation(), open ? ls.collapsed.add(g.id) : ls.collapsed.delete(g.id), rerenderAll()) }, open ? '▾' : '▸'),
        h('button', { class: `icon${g.hidden ? ' off' : ''}`, title: t('list.hide'), onclick: (e: Event) => (e.stopPropagation(), doc.updateGroup(g.id, { hidden: !g.hidden })) }, g.hidden ? '◌' : '👁'),
        h('button', { class: `icon${g.locked ? '' : ' off'}`, title: t('list.lock'), onclick: (e: Event) => (e.stopPropagation(), doc.updateGroup(g.id, { locked: !g.locked })) }, g.locked ? '🔒' : '🔓'),
        h('span', { class: 'folder' }, '▤'),
        nameInput,
        h('span', { class: 'count' }, String(content.length)),
        h('button', { class: 'icon', title: t('list.duplicateGroup'), onclick: (e: Event) => (e.stopPropagation(), actions.duplicateGroup(g.id)) }, '⧉'),
        h('button', { class: 'icon', title: t('list.ungroupThis'), onclick: (e: Event) => (e.stopPropagation(), actions.ungroup(g.id)) }, '⊗'),
      );
      dragSource(row, 'group', g.id);
      dropTarget(row, g.id, 'into');
      list.append(row);
      if (!open) return;
      for (const child of doc.map.groups.filter((x) => x.parent === g.id)) groupNode(child, depth + 1);
      for (const o of objectsIn(g.id)) if (match(o) && shown++ < LIMIT) list.append(objRow(o, depth + 1));
    };

    for (const g of doc.map.groups.filter((x) => !x.parent || !doc.getGroup(x.parent))) groupNode(g, 0);
    for (const o of objectsIn(null)) if (match(o) && shown++ < LIMIT) list.append(objRow(o, 0));
    if (shown > LIMIT) list.append(h('p', { class: 'muted small' }, t('list.more', { n: shown - LIMIT })));
    if (!doc.map.objects.length && !doc.map.groups.length) list.append(h('p', { class: 'muted small' }, t('list.empty')));
    // upuszczenie w puste miejsce listy – najwyższy poziom
    const rootDrop = h('div', { class: 'list-root-drop' }, t('list.dropRoot'));
    dropTarget(rootDrop, null, 'into');
    list.append(rootDrop);
    root.append(list);
  });
}

// ---------------- Właściwości ----------------

function numInput(value: number, key: string, onChange: (v: number) => void, opts: { min?: number; max?: number; step?: number } = {}): HTMLInputElement {
  return h('input', {
    type: 'number',
    value: String(value),
    step: opts.step ?? 'any',
    min: opts.min,
    max: opts.max,
    'data-key': key,
    onchange: (e: Event) => {
      const v = Number((e.target as HTMLInputElement).value);
      if (Number.isFinite(v)) onChange(v);
    },
  });
}

function vecRow(label: string, v: Vec3, key: string, onChange: (k: number, val: number) => void, step = 0.1): HTMLElement {
  return h('div', { class: 'vec' }, h('span', { class: 'lbl' }, label), ...[0, 1, 2].map((k) => h('label', {}, 'XYZ'[k], numInput(Math.round(v[k] * 1e4) / 1e4, `${key}${k}`, (val) => onChange(k, val), { step }))));
}

/** Wymiary obiektu w metrach (w dymku – w jednostkach mapy). */
function sizeRow(ctx: Ctx, o: MapObject): HTMLElement {
  const doc = ctx.doc;
  const size = objectSize(doc.schema, o, doc.map, (ref) => ctx.models.bounds(ref));
  const upm = doc.schema.scale.unitsPerMeter;
  const m = size.map((v) => formatNum(v / upm)).join(' × ');
  const u = size.map((v) => formatNum(v)).join(' × ');
  return h(
    'p',
    { class: 'size-row small', title: t('props.sizeUnits', { size: u, upm: formatNum(upm, 4) }) },
    h('span', { class: 'lbl' }, t('props.size')),
    ' ',
    h('b', {}, `${m} m`),
    h('span', { class: 'muted' }, ` (${t('props.sizeAxes')})`),
  );
}

function propField(ctx: Ctx, p: PropDef, objs: MapObject[], issues: Issue[]): HTMLElement {
  const doc = ctx.doc;
  const values = objs.map((o) => o.props[p.id]);
  const same = values.every((v) => v === values[0]);
  const v = same ? values[0] : undefined;
  const set = (val: PropValue) => doc.updateObjects(objs.map((o) => o.id), (o) => (o.props[p.id] = val), 'prop');
  const key = `p-${p.id}`;
  let input: HTMLElement;
  switch (p.type) {
    case 'number':
      input = h('input', {
        type: 'number',
        value: typeof v === 'number' ? String(v) : '',
        placeholder: same ? '' : t('props.mixed'),
        min: p.min,
        max: p.max,
        step: p.step ?? 'any',
        'data-key': key,
        onchange: (e: Event) => {
          const raw = (e.target as HTMLInputElement).value;
          set(raw === '' ? null : Number(raw));
        },
      });
      break;
    case 'text':
      input = h('input', { type: 'text', value: typeof v === 'string' ? v : '', placeholder: same ? '' : t('props.mixed'), 'data-key': key, onchange: (e: Event) => set((e.target as HTMLInputElement).value) });
      break;
    case 'bool':
      input = h('input', { type: 'checkbox', checked: v === true, indeterminate: !same, 'data-key': key, onchange: (e: Event) => set((e.target as HTMLInputElement).checked) });
      break;
    case 'color':
      input = h('input', { type: 'color', value: typeof v === 'string' ? v : '#ffffff', 'data-key': key, onchange: (e: Event) => set((e.target as HTMLInputElement).value) });
      break;
    case 'enum':
      input = h(
        'select',
        { 'data-key': key, onchange: (e: Event) => set((e.target as HTMLSelectElement).value) },
        !same || !p.options?.some((o) => o.value === v) ? h('option', { value: '', selected: true, disabled: true }, same ? String(v ?? '') : t('props.mixed')) : null,
        ...(p.options ?? []).map((o) => h('option', { value: o.value, selected: o.value === v }, L(o.name, o.value))),
      );
      break;
    case 'ref': {
      const targets = doc.map.objects.filter((o) => !objs.includes(o) && (!p.refTypes?.length || p.refTypes.includes(o.type)));
      const missing = typeof v === 'string' && !doc.getObject(v);
      input = h(
        'div',
        { class: 'ref' },
        h(
          'select',
          { 'data-key': key, onchange: (e: Event) => set((e.target as HTMLSelectElement).value || null) },
          h('option', { value: '', selected: v === null || v === undefined || !same }, same ? t('props.none') : t('props.mixed')),
          missing ? h('option', { value: v as string, selected: true }, t('props.missingRef', { id: v as string })) : null,
          ...targets.map((o) => h('option', { value: o.id, selected: o.id === v }, `${o.name} (${L(getType(doc.schema, o.type)?.name, o.type)})`)),
        ),
        typeof v === 'string' && doc.getObject(v) ? h('button', { class: 'icon', title: t('props.goToRef'), onclick: () => doc.select([v]) }, '→') : null,
      );
      break;
    }
  }
  const mine = issues.filter((i) => i.propId === p.id);
  const label = L(p.name, p.id) + (p.required ? ' *' : '');
  const range = p.type === 'number' && (p.min !== undefined || p.max !== undefined) ? ` (${p.min ?? '−∞'} … ${p.max ?? '∞'})` : '';
  return h(
    'div',
    { class: `field${mine.some((i) => i.level === 'error') ? ' invalid' : ''}`, title: L(p.hint) },
    h('label', { class: p.type === 'bool' ? 'check' : '' }, p.type === 'bool' ? input : null, h('span', {}, label, h('span', { class: 'muted' }, range))),
    p.type !== 'bool' ? input : null,
    ...mine.map((i) => h('div', { class: `issue-inline ${i.level}` }, issueText(i))),
  );
}

export function renderProps(root: HTMLElement, ctx: Ctx, issues: Issue[], actions: Actions): void {
  const doc = ctx.doc;
  schemaForIssues = doc.schema;
  rerender(root, () => {
    const sel = doc.selectedObjects();
    if (!sel.length) {
      const s = doc.map.settings;
      root.append(
        h('h3', {}, t('props.map')),
        h('div', { class: 'field' }, h('label', {}, t('newMap.name')), h('input', { type: 'text', value: s.name, 'data-key': 'mapName', onchange: (e: Event) => doc.updateSettings((st) => (st.name = (e.target as HTMLInputElement).value)) })),
        h('p', { class: 'muted small' }, t('props.schemaInfo', { name: L(doc.schema.name, doc.schema.id), version: doc.schema.version })),
        h('p', { class: 'muted small' }, t('props.nothingSelected')),
      );
      return;
    }
    const types = new Set(sel.map((o) => o.type));
    const ty = types.size === 1 ? getType(doc.schema, sel[0].type) : undefined;
    const ids = sel.map((o) => o.id);
    const buttons = h(
      'div',
      { class: 'list-buttons' },
      h('button', { title: KEY.duplicate, onclick: actions.duplicate }, t('props.duplicate')),
      h('button', { title: KEY.ground, onclick: actions.ground }, t('props.ground')),
      h('button', { title: KEY.focus, onclick: () => actions.focusObject(ids[0]) }, t('props.focus')),
      h('button', { class: 'danger', title: KEY.delete, onclick: actions.remove }, t('props.delete')),
    );
    if (sel.length > 1) {
      root.append(h('h3', {}, t('props.multi', { n: sel.length })), buttons);
      if (!ty) {
        root.append(h('p', { class: 'muted small' }, t('props.multiTypes')));
        return;
      }
    } else {
      const o = sel[0];
      root.append(
        h('h3', {}, ty ? L(ty.name, ty.id) : o.type),
        buttons,
        h('div', { class: 'field' }, h('label', {}, t('props.name')), h('input', { type: 'text', value: o.name, 'data-key': 'name', onchange: (e: Event) => doc.updateObjects(ids, (x) => (x.name = (e.target as HTMLInputElement).value || x.name), 'name') })),
        h('p', { class: 'muted small' }, `id: ${o.id}`),
      );
      if (!ty) {
        root.append(h('p', { class: 'issue-inline error' }, t('issue.unknownType', { name: o.name, type: o.type })));
        return;
      }
      if (ty.kind === 'point' || ty.kind === 'solid') {
        root.append(
          vecRow(t('props.position'), o.position, 'pos', (k, v) => doc.updateObjects(ids, (x) => (x.position[k] = v), 'move')),
          vecRow(t('props.rotation'), o.rotation, 'rot', (k, v) => doc.updateObjects(ids, (x) => (x.rotation[k] = v), 'rotate'), 5),
          vecRow(objectModel(doc.schema, o, ty, doc.map) ? t('props.multiplier') : t('props.scale'), o.scale, 'scl', (k, v) => doc.updateObjects(ids, (x) => (x.scale[k] = v || 0.01), 'scale')),
          sizeRow(ctx, o),
        );
      } else {
        const closed = ty.kind === 'zone';
        const reshape = (fn: (pts: Vec3[]) => Vec3[], label: string) =>
          doc.updateObjects(ids, (x) => (x.points = fn(x.points).map((p) => [p[0], heightAt(doc.map, p[0], p[2]), p[2]] as Vec3)), label);
        const tol = Math.min(...cellSize(doc.map)) * 0.5;
        root.append(
          h('p', { class: 'muted small' }, t('props.points', { n: o.points.length }) + ' ' + t('props.pointsHelp')),
          h(
            'div',
            { class: 'list-buttons' },
            h('button', { title: t('props.smoothHint'), onclick: () => reshape((p) => smoothPoints(p, closed, 1), 'smooth') }, t('props.smooth')),
            h('button', { title: t('props.simplifyHint'), onclick: () => reshape((p) => (p.length > (closed ? 3 : 2) ? simplify(p, tol, closed) : p), 'simplify') }, t('props.simplify')),
          ),
        );
      }
    }
    if (ty!.kind === 'point' || ty!.kind === 'solid') root.append(typeAndModel(ctx, sel, ty!, actions));
    const flags = sel.length === 1 ? objectFlags(ty!, sel[0]) : ty!.flags;
    root.append(
      h(
        'p',
        { class: 'flags' },
        h('span', { class: 'tag' }, t(`kind.${ty!.kind}`)),
        flags.collision ? h('span', { class: 'tag' }, t('flag.collision')) : null,
        !flags.visibleInGame ? h('span', { class: 'tag' }, t('flag.editorOnly')) : null,
        flags.walkable ? h('span', { class: 'tag' }, t('flag.walkable')) : null,
      ),
    );
    if (ty!.properties.length) {
      root.append(h('h3', {}, t('props.properties')));
      const mine = issues.filter((i) => i.objectId && ids.includes(i.objectId));
      for (const p of ty!.properties) root.append(propField(ctx, p, sel, mine));
    }
  });
}

/** „Zmień typ” i model obiektu (własny albo z typu) z przyciskiem „Model typu…”. */
function typeAndModel(ctx: Ctx, sel: MapObject[], ty: ObjectTypeDef, actions: Actions): HTMLElement {
  const schema = ctx.doc.schema;
  const ids = sel.map((o) => o.id);
  const box = h('div', { class: 'type-model' });
  const types = changeableTypes(schema);
  box.append(
    h(
      'div',
      { class: 'field' },
      h('label', { title: t('props.changeTypeHint') }, t('props.changeType')),
      h(
        'select',
        { 'data-key': 'changeType', onchange: (e: Event) => actions.changeType(ids, (e.target as HTMLSelectElement).value) },
        ...types.map((x) => h('option', { value: x.id, selected: x.id === ty.id }, `${L(x.name, x.id)}${isBuiltinType(x.id) ? '' : ` · ${L(x.category)}`}`)),
      ),
    ),
  );
  const o = sel[0];
  const om = objectModel(schema, o, ty);
  const own = sel.every((x) => x.model === o.model) ? o.model : undefined;
  const lib = ctx.models.fileNames;
  if (ty.id === DECORATION || own) {
    // własny model obiektu – wybór z biblioteki
    const options = [...new Set([...(own ? [own] : []), ...lib.map(modelRef)])];
    box.append(
      h(
        'div',
        { class: 'field' },
        h('label', {}, t('props.ownModel')),
        h(
          'select',
          { 'data-key': 'ownModel', onchange: (e: Event) => actions.setObjectModel(ids, (e.target as HTMLSelectElement).value || undefined) },
          h('option', { value: '' }, ty.id === DECORATION ? t('props.noModel') : t('props.typeModelOption')),
          ...options.map((m) => h('option', { value: m, selected: sameModel(m, own) }, fileStem(m))),
        ),
      ),
    );
  }
  if (!isBuiltinType(ty.id)) {
    box.append(
      h(
        'div',
        { class: 'model-row' },
        h('span', { class: 'muted small grow' }, ty.look.model ? t('props.typeModel', { model: fileStem(ty.look.model) }) : t('props.typeNoModel')),
        h('button', { title: t('props.typeModelHint'), onclick: () => actions.editTypeModel(ty.id) }, t('props.typeModelBtn')),
      ),
    );
  }
  if (om) {
    // skala bazowa modelu: wspólna dla wszystkich kopii modelu na mapie (mnożnik obiektu – osobno)
    const base = modelBaseScale(ctx.doc.map, om.ref);
    box.append(
      h(
        'div',
        { class: 'field', title: t('props.baseScaleHint') },
        h('label', {}, t('props.baseScale', { model: fileStem(om.ref) })),
        numInput(Math.round(base * 1e4) / 1e4, 'baseScale', (v) => v > 0 && actions.setBaseScale(om.ref, v), { min: 0.0001, step: 0.01 }),
      ),
    );
  }
  if (om && ctx.models.state(om.ref) === 'error') box.append(h('p', { class: 'issue-inline warning' }, t('props.modelMissing', { model: fileStem(om.ref) })));
  return box;
}

// ---------------- Walidacja ----------------

let schemaForIssues: Schema | null = null;

/** Tekst problemu z walidacji; identyfikatory pól i typów zamienia na nazwy ze schematu. */
export function issueText(i: Issue): string {
  const params = { ...i.params };
  const s = schemaForIssues;
  if (s) {
    const typeOf = (id: unknown) => s.objectTypes.find((x) => x.id === id);
    if (typeof params.type === 'string' && typeOf(params.type)) params.type = L(typeOf(params.type)!.name, params.type);
    if (i.propId) {
      for (const ty of s.objectTypes) {
        const p = ty.properties.find((x) => x.id === i.propId);
        if (p && (!i.objectType || i.objectType === ty.id)) {
          params.prop = L(p.name, p.id);
          break;
        }
      }
    }
  }
  if (COUNT_CODES.includes(i.code)) {
    // zasada liczebności: komunikat (własny albo standardowy) i opis zasady, której dotyczy
    const kind = i.code === 'ruleCountExact' ? 'exact' : i.code === 'ruleCountMin' ? 'min' : i.code === 'ruleCountMax' ? 'max' : 'range';
    const rule = t(`rule.${kind}`, params) + (params.zone !== undefined ? t('rule.within', params) : '');
    const head = i.message ? L(i.message) : t(`issue.count.${params.problem}`, params);
    return `${head} – ${t('issue.count.rule', { rule })}`;
  }
  if (i.message) return L(i.message);
  return t(`issue.${i.code}`, params);
}

const COUNT_CODES: Issue['code'][] = ['ruleCountExact', 'ruleCountMin', 'ruleCountMax', 'ruleCountRange'];

export function renderValidation(root: HTMLElement, ctx: Ctx, issues: Issue[], header: HTMLElement): void {
  schemaForIssues = ctx.doc.schema;
  const errors = issues.filter((i) => i.level === 'error').length;
  const warnings = issues.length - errors;
  header.textContent = t('validation.summary', { e: errors, w: warnings });
  header.className = errors ? 'bad' : warnings ? 'warn' : 'good';
  rerender(root, () => {
    if (!issues.length) {
      root.append(h('p', { class: 'muted small' }, t('validation.ok')));
      return;
    }
    for (const i of issues)
      root.append(
        h(
          'div',
          {
            class: `issue ${i.level}${i.objectId ? ' clickable' : ''}`,
            title: i.objectId ? t('validation.clickHint') : '',
            onclick: () => {
              if (!i.objectId) return;
              ctx.doc.select([i.objectId]);
              const o = ctx.doc.getObject(i.objectId);
              if (o) ctx.viewport.focus(o.points.length ? o.points[0] : o.position);
            },
          },
          h('span', { class: 'icon' }, i.level === 'error' ? '⛔' : '⚠'),
          issueText(i),
        ),
      );
  });
}

export function runValidation(ctx: Ctx): Issue[] {
  return validateMap(ctx.doc.schema, ctx.doc.map);
}
