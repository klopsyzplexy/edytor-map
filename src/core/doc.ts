// Dokument edytora: schemat + mapa + zaznaczenie + historia. Każda zmiana przechodzi przez tę klasę,
// dzięki czemu działa cofnij/ponów i odświeżanie widoków. Bez DOM i Three.js.
import { History } from './history';
import { cloneObject, createObject, newId, syncLayersWithSchema, type MapData, type MapGroup, type MapObject, type MapSettings, type Vec3 } from './map';
import { getType, type Schema } from './schema';
import { copyRect, pasteRect, unionRect, type Rect } from './terrain';

export type DocEvent = 'map' | 'objects' | 'terrain' | 'selection' | 'settings' | 'history';
type Listener = (payload?: unknown) => void;

interface ObjectsSnapshot {
  objects: MapObject[];
  groups: MapGroup[];
}

interface StrokeState {
  heights: Float32Array;
  layers: Record<string, Uint8Array>;
  rect: Rect | null;
}

export class EditorDoc {
  readonly history = new History();
  selection: string[] = [];
  /** Liczba zmian od ostatniego zapisu do pliku (0 = zapisane). */
  changes = 0;
  private listeners = new Map<DocEvent, Set<Listener>>();
  private stroke: StrokeState | null = null;

  constructor(
    public schema: Schema,
    public map: MapData,
  ) {
    syncLayersWithSchema(map, schema);
  }

  on(ev: DocEvent, fn: Listener): () => void {
    if (!this.listeners.has(ev)) this.listeners.set(ev, new Set());
    this.listeners.get(ev)!.add(fn);
    return () => this.listeners.get(ev)!.delete(fn);
  }

  emit(ev: DocEvent, payload?: unknown): void {
    this.listeners.get(ev)?.forEach((fn) => fn(payload));
  }

  /** Nowa mapa lub wczytany plik: czyści historię i zaznaczenie. */
  setMap(map: MapData, schema: Schema = this.schema): void {
    this.schema = schema;
    syncLayersWithSchema(map, schema);
    this.map = map;
    this.selection = [];
    this.history.clear();
    this.changes = 0;
    this.emit('map');
    this.emit('selection');
    this.emit('history');
  }

  private touched(): void {
    this.changes++;
    this.emit('history');
  }

  getObject(id: string): MapObject | undefined {
    return this.map.objects.find((o) => o.id === id);
  }

  selectedObjects(): MapObject[] {
    return this.selection.map((id) => this.getObject(id)).filter((o): o is MapObject => !!o);
  }

  // ---------- zaznaczenie ----------

  select(ids: string[], mode: 'set' | 'add' | 'toggle' = 'set'): void {
    let next: string[];
    if (mode === 'set') next = [...ids];
    else if (mode === 'add') next = [...this.selection, ...ids.filter((id) => !this.selection.includes(id))];
    else {
      next = [...this.selection];
      for (const id of ids) {
        const k = next.indexOf(id);
        if (k >= 0) next.splice(k, 1);
        else next.push(id);
      }
    }
    next = next.filter((id) => this.getObject(id));
    if (next.length === this.selection.length && next.every((id, i) => id === this.selection[i])) return;
    this.selection = next;
    this.emit('selection');
  }

  // ---------- obiekty (zmiany przez migawki, cofane w całości) ----------

  private snapshot(): ObjectsSnapshot {
    return { objects: this.map.objects.map(cloneObject), groups: this.map.groups.map((g) => ({ ...g })) };
  }

  private restore(s: ObjectsSnapshot): void {
    this.map.objects = s.objects.map(cloneObject);
    this.map.groups = s.groups.map((g) => ({ ...g }));
    const before = this.selection.length;
    this.selection = this.selection.filter((id) => this.getObject(id));
    this.emit('objects');
    if (before !== this.selection.length) this.emit('selection');
  }

  /** Wykonuje zmianę obiektów jako jeden krok historii. */
  transact(label: string, fn: () => void, selectAfter?: string[]): void {
    const before = this.snapshot();
    const selBefore = [...this.selection];
    fn();
    const after = this.snapshot();
    const selAfter = selectAfter ?? this.selection.filter((id) => this.getObject(id));
    this.history.push({
      label,
      undo: () => {
        this.restore(before);
        this.select(selBefore);
      },
      redo: () => {
        this.restore(after);
        this.select(selAfter);
      },
    });
    this.emit('objects');
    this.select(selAfter);
    this.touched();
  }

  addObject(typeId: string, at: Vec3, points?: Vec3[]): MapObject {
    const o = createObject(this.schema, this.map, typeId, at, points);
    this.transact('add', () => this.map.objects.push(o), [o.id]);
    return o;
  }

  updateObjects(ids: string[], patch: (o: MapObject) => void, label = 'edit'): void {
    const targets = ids.map((id) => this.getObject(id)).filter((o): o is MapObject => !!o);
    if (!targets.length) return;
    this.transact(label, () => targets.forEach(patch));
  }

  removeObjects(ids: string[]): void {
    const set = new Set(ids);
    if (!this.map.objects.some((o) => set.has(o.id))) return;
    this.transact('delete', () => (this.map.objects = this.map.objects.filter((o) => !set.has(o.id))), []);
  }

  /**
   * Wkleja kopie obiektów z nowymi id; odwołania między wklejanymi obiektami wskazują na nowe kopie.
   * Kopiowane grupy (`groups`) powstają od nowa z całą strukturą podgrup.
   */
  pasteObjects(clips: MapObject[], offset: Vec3, groups: MapGroup[] = []): MapObject[] {
    if (!clips.length) return [];
    const exists = (id: string | null) => !!id && this.map.groups.some((g) => g.id === id);
    const gMap = new Map<string, string>(groups.map((g) => [g.id, newId('g')]));
    const newGroups = groups.map((g) => ({
      ...g,
      id: gMap.get(g.id)!,
      parent: g.parent && gMap.has(g.parent) ? gMap.get(g.parent)! : exists(g.parent) ? g.parent : null,
      hidden: false,
      locked: false,
    }));
    const idMap = new Map<string, string>();
    const copies = clips.map((c) => {
      const o = cloneObject(c);
      idMap.set(c.id, (o.id = newId()));
      o.position = [o.position[0] + offset[0], o.position[1] + offset[1], o.position[2] + offset[2]];
      o.points = o.points.map((p) => [p[0] + offset[0], p[1] + offset[1], p[2] + offset[2]] as Vec3);
      o.locked = false;
      o.hidden = false;
      if (o.group && gMap.has(o.group)) o.group = gMap.get(o.group)!;
      else if (!exists(o.group)) o.group = null;
      return o;
    });
    for (const o of copies) {
      const t = getType(this.schema, o.type);
      for (const p of t?.properties ?? []) if (p.type === 'ref' && typeof o.props[p.id] === 'string' && idMap.has(o.props[p.id] as string)) o.props[p.id] = idMap.get(o.props[p.id] as string)!;
    }
    this.transact('paste', () => {
      this.map.groups.push(...newGroups);
      this.map.objects.push(...copies);
    }, copies.map((o) => o.id));
    return copies;
  }

  // ---------- grupy (drzewo: grupa może mieć podgrupy) ----------

  getGroup(id: string | null): MapGroup | undefined {
    return id ? this.map.groups.find((g) => g.id === id) : undefined;
  }

  /** Grupa i wszystkie grupy nad nią (od najbliższej). */
  groupChain(id: string | null): MapGroup[] {
    const out: MapGroup[] = [];
    for (let g = this.getGroup(id); g && !out.includes(g); g = this.getGroup(g.parent)) out.push(g);
    return out;
  }

  /** Id grupy i wszystkich jej podgrup (w głąb). */
  groupDescendants(id: string): Set<string> {
    const out = new Set([id]);
    let grew = true;
    while (grew) {
      grew = false;
      for (const g of this.map.groups)
        if (g.parent && out.has(g.parent) && !out.has(g.id)) {
          out.add(g.id);
          grew = true;
        }
    }
    return out;
  }

  /** Obiekty grupy razem z obiektami podgrup. */
  groupObjectIds(id: string): string[] {
    const ids = this.groupDescendants(id);
    return this.map.objects.filter((o) => o.group && ids.has(o.group)).map((o) => o.id);
  }

  /** Grupy, których cała zawartość jest w podanym zbiorze obiektów (do kopiowania grup z zawartością). */
  fullGroups(objectIds: string[]): MapGroup[] {
    const set = new Set(objectIds);
    return this.map.groups.filter((g) => {
      const ids = this.groupObjectIds(g.id);
      return ids.length > 0 && ids.every((id) => set.has(id));
    });
  }

  /**
   * Nowa grupa z zaznaczonych obiektów i grup. Trafia tam, gdzie wszystkie zaznaczone elementy
   * mają wspólnego rodzica (albo na najwyższy poziom).
   */
  groupObjects(ids: string[], name: string, groupIds: string[] = []): MapGroup | null {
    if (!ids.length && !groupIds.length) return null;
    const parents = new Set<string | null>([...ids.map((id) => this.getObject(id)?.group ?? null), ...groupIds.map((id) => this.getGroup(id)?.parent ?? null)]);
    const parent = parents.size === 1 ? [...parents][0] : null;
    const g: MapGroup = { id: newId('g'), name, parent: groupIds.includes(parent ?? '') ? null : parent, hidden: false, locked: false };
    this.transact('group', () => {
      this.map.groups.push(g);
      for (const id of ids) {
        const o = this.getObject(id);
        if (o) o.group = g.id;
      }
      for (const id of groupIds) {
        const x = this.getGroup(id);
        if (x && x.id !== g.id) x.parent = g.id;
      }
    });
    return g;
  }

  /** Rozgrupowanie: zawartość grupy (obiekty i podgrupy) przechodzi poziom wyżej. */
  ungroup(groupId: string): void {
    const g = this.getGroup(groupId);
    if (!g) return;
    this.transact('ungroup', () => {
      this.map.groups = this.map.groups.filter((x) => x.id !== groupId);
      for (const o of this.map.objects) if (o.group === groupId) o.group = g.parent;
      for (const x of this.map.groups) if (x.parent === groupId) x.parent = g.parent;
    });
  }

  updateGroup(groupId: string, patch: Partial<Omit<MapGroup, 'id' | 'parent'>>): void {
    this.transact('group', () => {
      const g = this.getGroup(groupId);
      if (g) Object.assign(g, patch);
    });
  }

  /**
   * Przenosi obiekty i grupy do grupy `target` (null = najwyższy poziom), opcjonalnie przed wskazany element
   * (zmiana kolejności). Grupy nie da się przenieść do niej samej ani do jej podgrupy.
   */
  moveToGroup(objectIds: string[], groupIds: string[], target: string | null, before?: { kind: 'object' | 'group'; id: string }): boolean {
    if (target && !this.getGroup(target)) return false;
    const blocked = new Set<string>();
    for (const id of groupIds) for (const d of this.groupDescendants(id)) blocked.add(d);
    if (target && blocked.has(target)) return false;
    const objs = objectIds.map((id) => this.getObject(id)).filter((o): o is MapObject => !!o);
    const grps = groupIds.map((id) => this.getGroup(id)).filter((g): g is MapGroup => !!g);
    if (!objs.length && !grps.length) return false;
    this.transact('move-group', () => {
      for (const o of objs) o.group = target;
      for (const g of grps) g.parent = target;
      if (before?.kind === 'object' && objs.length) {
        const moving = new Set(objs.map((o) => o.id));
        const rest = this.map.objects.filter((o) => !moving.has(o.id));
        const k = rest.findIndex((o) => o.id === before.id);
        const list = this.map.objects.filter((o) => moving.has(o.id));
        rest.splice(k < 0 ? rest.length : k, 0, ...list);
        this.map.objects = rest;
      }
      if (before?.kind === 'group' && grps.length) {
        const moving = new Set(grps.map((g) => g.id));
        const rest = this.map.groups.filter((g) => !moving.has(g.id));
        const k = rest.findIndex((g) => g.id === before.id);
        rest.splice(k < 0 ? rest.length : k, 0, ...this.map.groups.filter((g) => moving.has(g.id)));
        this.map.groups = rest;
      }
    });
    return true;
  }

  /** Obiekt widoczny w edytorze (ani on, ani żadna grupa nad nim nie są ukryte). */
  isVisible(o: MapObject): boolean {
    if (o.hidden) return false;
    return !this.groupChain(o.group).some((g) => g.hidden);
  }

  /** Obiekt można zaznaczyć w widoku 3D (widoczny i nic nad nim nie jest zablokowane). */
  isPickable(o: MapObject): boolean {
    if (!this.isVisible(o) || o.locked) return false;
    return !this.groupChain(o.group).some((g) => g.locked);
  }

  // ---------- ustawienia mapy ----------

  updateSettings(patch: (s: MapSettings) => void): void {
    const before = structuredClone(this.map.settings);
    patch(this.map.settings);
    const after = structuredClone(this.map.settings);
    this.history.push({
      label: 'settings',
      undo: () => {
        this.map.settings = structuredClone(before);
        this.emit('settings');
      },
      redo: () => {
        this.map.settings = structuredClone(after);
        this.emit('settings');
      },
    });
    this.emit('settings');
    this.touched();
  }

  // ---------- teren (pociągnięcia pędzlem) ----------

  beginStroke(): void {
    const t = this.map.terrain;
    const layers: Record<string, Uint8Array> = {};
    for (const [id, a] of Object.entries(t.layers)) layers[id] = a.slice();
    this.stroke = { heights: t.heights.slice(), layers, rect: null };
  }

  /** Zgłasza zmieniony fragment terenu w trakcie pociągnięcia (odświeża widok). */
  strokeChanged(rect: Rect | null, kind: 'heights' | 'layers'): void {
    if (!rect) return;
    if (this.stroke) this.stroke.rect = unionRect(this.stroke.rect, rect);
    this.emit('terrain', { rect, kind });
  }

  endStroke(kind: 'heights' | 'layers'): void {
    const s = this.stroke;
    this.stroke = null;
    if (!s || !s.rect) return;
    const t = this.map.terrain;
    const r = s.rect;
    const nx = t.nx;
    const ids = Object.keys(t.layers);
    const before = { h: copyRect(s.heights, nx, r), l: ids.map((id) => copyRect(s.layers[id] ?? t.layers[id], nx, r)) };
    const after = { h: copyRect(t.heights, nx, r), l: ids.map((id) => copyRect(t.layers[id], nx, r)) };
    const apply = (v: typeof before) => {
      pasteRect(this.map.terrain.heights, nx, r, v.h);
      ids.forEach((id, k) => pasteRect(this.map.terrain.layers[id], nx, r, v.l[k]));
      this.emit('terrain', { rect: r, kind: 'all' });
    };
    this.history.push({ label: kind === 'heights' ? 'sculpt' : 'paint', undo: () => apply(before), redo: () => apply(after) });
    this.touched();
  }

  undo(): void {
    if (this.history.undo()) this.touched();
  }

  redo(): void {
    if (this.history.redo()) this.touched();
  }
}
