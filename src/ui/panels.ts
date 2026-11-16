// Panele boczne: paleta obiektów, teren, lista obiektów, właściwości, walidacja.
import type { Ctx } from '../context';
import type { MapObject, Vec3 } from '../core/map';
import { getType, locText, type ObjectTypeDef, type PropDef, type PropValue, type Schema } from '../core/schema';
import type { HeightTool } from '../core/terrain';
import { validateMap, type Issue } from '../core/validate';
import { getLang, t } from '../i18n';
import { clear, h } from './dom';

export interface Actions {
  duplicate(): void;
  remove(): void;
  ground(): void;
  group(): void;
  ungroup(groupId: string): void;
  focusObject(id: string): void;
  toggleHidden(ids: string[]): void;
  toggleLocked(ids: string[]): void;
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
                  ctx.setTool('place');
                },
              },
              swatch(ty.look.color),
              h('span', { class: 'name' }, L(ty.name, ty.id)),
              h('span', { class: 'kind' }, t(`kindShort.${ty.kind}`)),
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
          ),
        ),
      ),
      slider(t('terrain.size'), s.brush.radius, 0.5, Math.round(maxR), 0.5, (v) => (s.brush.radius = v), 'radius', '[ / ]'),
      slider(t('terrain.strength'), s.brush.strength, 0.05, 1, 0.05, (v) => (s.brush.strength = v), 'strength'),
      slider(t('terrain.softness'), s.brush.softness, 0, 1, 0.05, (v) => (s.brush.softness = v), 'softness'),
      h(
        'label',
        { class: 'inline', title: t('terrain.targetHint') },
        t('terrain.target'),
        h('input', { type: 'number', step: 0.1, value: s.brush.target, 'data-key': 'target', onchange: (e: Event) => (s.brush.target = Number((e.target as HTMLInputElement).value) || 0) }),
      ),
      h('p', { class: 'muted small' }, t('terrain.sculptHelp')),

      h('h3', {}, t('terrain.layers')),
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

// ---------------- Lista obiektów ----------------

export interface ListState {
  query: string;
  type: string;
  collapsed: Set<string>;
}

export function renderObjectList(root: HTMLElement, ctx: Ctx, ls: ListState, actions: Actions, rerenderAll: () => void): void {
  const doc = ctx.doc;
  rerender(root, () => {
    const q = ls.query.trim().toLowerCase();
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
      ...doc.schema.objectTypes.map((ty) => h('option', { value: ty.id, selected: ls.type === ty.id }, L(ty.name, ty.id))),
    );
    root.append(
      h('div', { class: 'list-tools' }, search, filter),
      h(
        'div',
        { class: 'list-buttons' },
        h('button', { title: 'Ctrl + G', disabled: doc.selection.length === 0, onclick: actions.group }, t('list.group')),
        h('button', { title: 'H', disabled: doc.selection.length === 0, onclick: () => actions.toggleHidden(doc.selection) }, t('list.hide')),
        h('button', { title: 'L', disabled: doc.selection.length === 0, onclick: () => actions.toggleLocked(doc.selection) }, t('list.lock')),
      ),
    );

    const row = (o: MapObject) => {
      const ty = getType(doc.schema, o.type);
      const selected = doc.selection.includes(o.id);
      return h(
        'div',
        {
          class: `list-row${selected ? ' selected' : ''}${o.hidden ? ' dim' : ''}`,
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
    };

    const list = h('div', { class: 'list' });
    const LIMIT = 500;
    let shown = 0;
    for (const g of doc.map.groups) {
      const members = doc.map.objects.filter((o) => o.group === g.id && match(o));
      if (!members.length && (q || ls.type)) continue;
      const open = !ls.collapsed.has(g.id);
      list.append(
        h(
          'div',
          { class: `list-group${g.hidden ? ' dim' : ''}` },
          h('button', { class: 'icon', onclick: () => (open ? ls.collapsed.add(g.id) : ls.collapsed.delete(g.id), rerenderAll()) }, open ? '▾' : '▸'),
          h('button', { class: `icon${g.hidden ? ' off' : ''}`, title: t('list.hide'), onclick: () => doc.updateGroup(g.id, { hidden: !g.hidden }) }, g.hidden ? '◌' : '👁'),
          h('button', { class: `icon${g.locked ? '' : ' off'}`, title: t('list.lock'), onclick: () => doc.updateGroup(g.id, { locked: !g.locked }) }, g.locked ? '🔒' : '🔓'),
          h('input', {
            class: 'group-name',
            value: g.name,
            'data-key': `g-${g.id}`,
            onchange: (e: Event) => doc.updateGroup(g.id, { name: (e.target as HTMLInputElement).value || g.name }),
          }),
          h('button', { class: 'link', title: t('list.selectGroupHint'), onclick: () => doc.select(doc.map.objects.filter((o) => o.group === g.id).map((o) => o.id)) }, t('list.selectGroup')),
          h('button', { class: 'link', onclick: () => actions.ungroup(g.id) }, t('list.ungroup')),
        ),
      );
      if (open) for (const o of members) if (shown++ < LIMIT) list.append(h('div', { class: 'indent' }, row(o)));
    }
    for (const o of doc.map.objects) if ((!o.group || !doc.map.groups.some((g) => g.id === o.group)) && match(o) && shown++ < LIMIT) list.append(row(o));
    if (shown > LIMIT) list.append(h('p', { class: 'muted small' }, t('list.more', { n: shown - LIMIT })));
    if (!doc.map.objects.length) list.append(h('p', { class: 'muted small' }, t('list.empty')));
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
      h('button', { title: 'Ctrl + D', onclick: actions.duplicate }, t('props.duplicate')),
      h('button', { title: 'G', onclick: actions.ground }, t('props.ground')),
      h('button', { title: 'F', onclick: () => actions.focusObject(ids[0]) }, t('props.focus')),
      h('button', { class: 'danger', title: 'Delete', onclick: actions.remove }, t('props.delete')),
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
          vecRow(t('props.scale'), o.scale, 'scl', (k, v) => doc.updateObjects(ids, (x) => (x.scale[k] = v || 0.01), 'scale')),
        );
      } else {
        root.append(h('p', { class: 'muted small' }, t('props.points', { n: o.points.length }) + ' ' + t('props.pointsHelp')));
      }
    }
    const flags = ty!.flags;
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

// ---------------- Walidacja ----------------

let schemaForIssues: Schema | null = null;

/** Tekst problemu z walidacji; identyfikatory pól i typów zamienia na nazwy ze schematu. */
export function issueText(i: Issue): string {
  if (i.message) return L(i.message);
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
  return t(`issue.${i.code}`, params);
}

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
