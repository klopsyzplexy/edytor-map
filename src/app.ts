// Edytor: łączy dokument, widok 3D, narzędzia, panele, pliki i zapis roboczy.
import exampleSchemaRaw from '../examples/schemat-przyklad.json';
import type { Ctx, EditorState, ToolId, TransformMode } from './context';
import { EditorDoc } from './core/doc';
import { mapToJson, MapFormatError, parseMap, type MapDerived } from './core/format';
import { cloneObject, createMap, heightAt, objectCenter, type MapData, type MapObject, type Vec3 } from './core/map';
import { locText, parseSchema, SchemaError, type Schema } from './core/schema';
import { collectCollision, COLLISION_LINE, rasterizeCollision } from './core/collision';
import { computeSlopeMask, raycastTerrain } from './core/terrain';
import type { Issue } from './core/validate';
import { collectWalkable } from './core/walkable';
import { getLang, LANGS, onLangChange, setLang, t, type Lang } from './i18n';
import { MODEL_ACCEPT } from './core/modelFiles';
import { Gizmo } from './render/gizmo';
import { Minimap } from './render/minimap';
import { importModelFiles, zipModels } from './render/modelImport';
import { ModelLibrary } from './render/models';
import { ObjectsView } from './render/objectsView';
import { TerrainMesh } from './render/terrainMesh';
import { Viewport } from './render/viewport';
import { loadAutosave, writeAutosave } from './storage/autosave';
import { downloadBlob, hasFileSystemAccess, openBinaryFiles, openJsonFile, saveTextFile, type FsHandle } from './storage/files';
import { StampLibrary } from './tools/stamps';
import { LassoTool, PaintTool, PlaceTool, SculptTool, SelectTool, StampTool, type Tool } from './tools/tools';
import { alertBox, confirmBox, helpDialog, newMapDialog, toast } from './ui/dialogs';
import { clear, debounce, h } from './ui/dom';
import { renderObjectList, renderPalette, renderProps, renderTerrainPanel, renderValidation, runValidation, type Actions, type ListState } from './ui/panels';

type LeftTab = 'objects' | 'terrain' | 'list';

export class App implements Ctx {
  doc!: EditorDoc;
  viewport: Viewport;
  terrain!: TerrainMesh;
  objects!: ObjectsView;
  models = new ModelLibrary();
  stamps = new StampLibrary();
  gizmo: Gizmo;
  clipboard: MapObject[] = [];
  state: EditorState = {
    tool: 'select',
    transformMode: 'translate',
    heightTool: 'raise',
    brush: { radius: 4, strength: 0.5, softness: 0.5, target: 1, shape: 'circle', angle: 0 },
    paintLayer: '',
    stamp: { id: 'gora', height: 4, midZero: false },
    placeType: null,
    lastPaletteType: null,
    lassoSmooth: 1,
    snap: false,
    gridStep: 1,
    showGrid: false,
    slopeOverlay: true,
  };

  private schemaRaw: unknown = exampleSchemaRaw;
  private fileHandle: FsHandle | undefined;
  private fileName: string | undefined;
  private tools!: Record<ToolId, Tool>;
  private leftTab: LeftTab = 'objects';
  private listState: ListState = { query: '', type: '', collapsed: new Set() };
  private issues: Issue[] = [];
  private lastHit: { x: number; y: number; hit: Vec3 | null } | null = null;
  private savedAt: number | null = null;
  private gameView = false;
  private minimap: Minimap;
  /** Wciśnięte strzałki (przesuwanie kamery) i spacja (przesuwanie myszą). */
  private held = new Set<string>();

  // elementy interfejsu
  private el = {
    toolbar: h('header', { class: 'toolbar' }),
    tabs: h('nav', { class: 'tabs' }),
    left: h('div', { class: 'panel-body' }),
    view: h('main', { class: 'view' }),
    hint: h('div', { class: 'view-hint' }),
    props: h('div', { class: 'panel-body' }),
    validHeader: h('span'),
    valid: h('div', { class: 'panel-body validation' }),
    status: h('footer', { class: 'status' }),
    statusHint: h('span', { class: 'grow' }),
    statusCursor: h('span'),
    statusSel: h('span'),
    statusSave: h('span'),
  };

  constructor(root: HTMLElement) {
    const right = h(
      'aside',
      { class: 'right' },
      h('section', { class: 'props-section' }, h('div', { class: 'panel-title', 'data-i18n': 'panel.props' }), this.el.props),
      h('section', { class: 'valid-section' }, h('div', { class: 'panel-title' }, h('span', { 'data-i18n': 'panel.validation' }), ' ', this.el.validHeader), this.el.valid),
    );
    this.el.status.append(this.el.statusHint, this.el.statusCursor, this.el.statusSel, this.el.statusSave, h('span', { class: 'muted' }, `alfa ${__APP_VERSION__}`));
    this.el.view.append(this.el.hint);
    root.append(h('div', { class: 'app' }, this.el.toolbar, h('aside', { class: 'left' }, this.el.tabs, this.el.left), this.el.view, right, this.el.status));

    this.viewport = new Viewport(this.el.view);
    this.minimap = new Minimap(() => this.doc, this.viewport, t('minimap.hint'));
    this.el.view.append(this.minimap.el);
    this.gizmo = new Gizmo(this.viewport, () => this.doc, () => this.objects);
    this.models.onChange = () => this.objects?.sync();
    this.stamps.onChange = () => {
      if (this.doc) this.stateChanged();
    };
    this.viewport.onTick((time, dt) => {
      this.terrain?.tick(time);
      this.panWithKeys(dt);
      if (this.doc) this.minimap.tick();
      this.objects?.tick(this.viewport.camera);
      this.tools?.[this.state.tool].tick?.(dt);
    });
    this.bindPointer();
    this.bindKeys();
    onLangChange(() => this.renderAll());
  }

  /** Start: zapis roboczy z przeglądarki albo przykładowy schemat z nową mapą. */
  async start(): Promise<void> {
    const saved = await loadAutosave();
    let restored = false;
    if (saved) {
      try {
        const schema = parseSchema(saved.schemaRaw);
        const map = parseMap(saved.mapJson);
        for (const [name, data] of Object.entries(saved.models ?? {})) this.models.addFile(name, data);
        for (const [name, data] of Object.entries(saved.stamps ?? {})) await this.stamps.addFile(name, data).catch(() => null);
        this.schemaRaw = saved.schemaRaw;
        this.fileName = saved.fileName;
        this.init(schema, map);
        this.savedAt = saved.savedAt;
        toast(t('toast.restored', { time: new Date(saved.savedAt).toLocaleString(getLang()) }));
        restored = true;
      } catch (e) {
        console.warn('Nie udało się przywrócić zapisu roboczego', e);
      }
    }
    if (!restored) {
      const schema = parseSchema(exampleSchemaRaw);
      const d = schema.mapDefaults;
      this.init(schema, createMap(schema, { name: t('newMap.defaultName'), size: d.size, resolution: d.resolution, height: d.height }));
    }
  }

  private init(schema: Schema, map: MapData): void {
    if (!this.doc) {
      this.doc = new EditorDoc(schema, map);
      this.objects = new ObjectsView(this.doc, this.models);
      this.viewport.root.add(this.objects.group);
      this.tools = { select: new SelectTool(this), sculpt: new SculptTool(this), paint: new PaintTool(this), place: new PlaceTool(this), stamp: new StampTool(this), lasso: new LassoTool(this) };
      this.bindDoc();
      this.onMapReplaced();
    } else this.doc.setMap(map, schema);
  }

  private bindDoc(): void {
    const d = this.doc;
    const validate = debounce(() => this.validate(), 300);
    const autosave = debounce(() => this.autosave(), 1500);
    d.on('map', () => this.onMapReplaced());
    d.on('objects', () => {
      this.minimap.invalidate();
      this.objects.sync();
      this.gizmo.refresh();
      this.renderLists();
      validate();
    });
    d.on('selection', () => {
      this.objects.updateSelection();
      this.gizmo.refresh();
      this.renderLists();
      this.refreshHint();
    });
    d.on('terrain', (p) => {
      const { rect, kind } = p as { rect: { i0: number; j0: number; i1: number; j1: number }; kind: 'heights' | 'layers' | 'all' };
      this.terrain.update(rect, kind);
      this.minimap.invalidate();
    });
    d.on('settings', () => {
      this.terrain.updateWaterLevel();
      this.terrain.setSlopeOverlay(this.state.slopeOverlay && this.doc.map.settings.slope.enabled);
      this.renderLeft();
      this.renderLists();
    });
    d.on('history', () => {
      this.renderToolbar();
      autosave();
    });
  }

  private onMapReplaced(): void {
    if (this.terrain) {
      this.viewport.root.remove(this.terrain.group);
      this.terrain.dispose();
    }
    this.terrain = new TerrainMesh(this.doc.map, this.doc.schema);
    this.viewport.root.add(this.terrain.group);
    if (!this.doc.schema.terrainLayers.some((l) => l.id === this.state.paintLayer)) this.state.paintLayer = this.doc.schema.terrainLayers[1]?.id ?? this.doc.schema.terrainLayers[0].id;
    if (this.state.placeType && !this.doc.schema.objectTypes.some((x) => x.id === this.state.placeType)) this.state.placeType = null;
    const [w, dd] = this.doc.map.settings.size;
    this.state.brush.radius = Math.max(1, Math.round(Math.max(w, dd) / 16));
    this.objects.sync(true);
    this.minimap.invalidate();
    this.viewport.frameMap(this.doc.map.settings.size, heightAt(this.doc.map, w / 2, dd / 2));
    if (this.gameView) this.toggleGameView();
    this.setTool('select');
    this.applyViewState();
    this.validate();
    this.renderAll();
  }

  // ---------------- Ctx ----------------

  setTool(tool: ToolId): void {
    const prev = this.tools[this.state.tool];
    if (prev && this.state.tool !== tool) prev.deactivate?.();
    const same = this.state.tool === tool;
    this.state.tool = tool;
    if (!same || tool === 'place') this.tools[tool].activate?.();
    if (tool === 'sculpt' || tool === 'paint' || tool === 'stamp') this.leftTab = 'terrain';
    if (tool === 'place') this.leftTab = 'objects';
    this.stateChanged();
  }

  refreshBrush(): void {
    this.tools[this.state.tool].refreshCursor?.();
  }

  stateChanged(): void {
    this.tools[this.state.tool].refreshCursor?.();
    this.applyViewState();
    this.renderToolbar();
    this.renderLeft();
    this.refreshHint();
  }

  private applyViewState(): void {
    this.terrain.setGrid(this.state.snap ? this.state.gridStep : 0);
    this.gizmo.setSnap(this.state.snap, this.state.gridStep);
    this.terrain.setSlopeOverlay(this.state.slopeOverlay && this.doc.map.settings.slope.enabled);
  }

  refreshHint(): void {
    const text = this.tools[this.state.tool].hint();
    this.el.hint.textContent = text;
    this.el.statusHint.textContent = text;
  }

  terrainHit(e: { clientX: number; clientY: number }): Vec3 | null {
    if (this.lastHit && this.lastHit.x === e.clientX && this.lastHit.y === e.clientY) return this.lastHit.hit;
    const ray = this.viewport.rayFromEvent(e);
    const hit = raycastTerrain(this.doc.map, [ray.origin.x, ray.origin.y, ray.origin.z], [ray.direction.x, ray.direction.y, ray.direction.z]);
    this.lastHit = { x: e.clientX, y: e.clientY, hit };
    return hit;
  }

  snap(v: Vec3): Vec3 {
    if (!this.state.snap) return [...v];
    const s = this.state.gridStep;
    return [Math.round(v[0] / s) * s, v[1], Math.round(v[2] / s) * s];
  }

  toast(msg: string, kind: 'info' | 'error' = 'info'): void {
    toast(msg, kind);
  }

  // ---------------- Wejście ----------------

  private bindPointer(): void {
    const c = this.viewport.renderer.domElement;
    c.addEventListener('pointerdown', (e) => {
      c.focus();
      this.lastHit = null;
      if (this.held.has(' ')) return;
      this.tools[this.state.tool].down?.(e);
    });
    c.addEventListener('pointermove', (e) => {
      this.lastHit = null;
      this.tools[this.state.tool].move?.(e);
      const hit = this.terrainHit(e);
      this.el.statusCursor.textContent = hit ? t('status.cursor', { x: hit[0].toFixed(2), z: hit[2].toFixed(2), h: hit[1].toFixed(2) }) : '';
    });
    window.addEventListener('pointerup', (e) => this.tools[this.state.tool].up?.(e));
    c.addEventListener('dblclick', (e) => this.tools[this.state.tool].dblclick?.(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerleave', () => {
      if (this.state.tool === 'sculpt' || this.state.tool === 'paint' || this.state.tool === 'stamp') this.terrain.setBrush(0, 0, 1, false);
    });
  }

  /** Strzałki przesuwają kamerę (z Shiftem szybciej). */
  private panWithKeys(dt: number): void {
    if (!this.held.size) return;
    const right = (this.held.has('ArrowRight') ? 1 : 0) - (this.held.has('ArrowLeft') ? 1 : 0);
    const fwd = (this.held.has('ArrowUp') ? 1 : 0) - (this.held.has('ArrowDown') ? 1 : 0);
    if (right || fwd) this.viewport.panScreen(right, fwd, dt, this.held.has('Shift'));
  }

  /** [ ] rozmiar, Shift + [ ] siła, „,” „.” obrót pędzla (po kodzie klawisza – działa w każdym układzie klawiatury). */
  private brushKey(e: KeyboardEvent): boolean {
    const b = this.state.brush;
    switch (e.code) {
      case 'BracketLeft':
      case 'BracketRight': {
        const up = e.code === 'BracketRight';
        if (e.shiftKey) b.strength = Math.min(1, Math.max(0.05, Math.round((b.strength + (up ? 0.05 : -0.05)) * 100) / 100));
        else b.radius = up ? Math.round(b.radius * 1.25 * 2) / 2 + 0.5 : Math.max(0.5, Math.round(b.radius * 0.8 * 2) / 2);
        this.stateChanged();
        this.toast(e.shiftKey ? t('toast.brushStrength', { v: b.strength }) : t('toast.brushSize', { v: b.radius }));
        return true;
      }
      case 'Comma':
      case 'Period': {
        const step = e.shiftKey ? 5 : 15;
        b.angle = (((b.angle ?? 0) + (e.code === 'Period' ? step : -step)) % 360 + 360) % 360;
        this.stateChanged();
        return true;
      }
    }
    return false;
  }

  private setSpace(on: boolean): void {
    if (on) this.held.add(' ');
    else this.held.delete(' ');
    this.viewport.setSpacePan(on);
    this.gizmo.controls.enabled = !on;
  }

  private bindKeys(): void {
    const ARROWS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
    window.addEventListener('keyup', (e) => {
      this.held.delete(e.key);
      if (e.key === 'Shift') this.held.delete('Shift');
      if (e.key === ' ') this.setSpace(false);
    });
    window.addEventListener('blur', () => {
      this.held.clear();
      this.setSpace(false);
    });
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal-overlay')) return;
      const target = e.target instanceof HTMLElement ? e.target : document.body;
      const typing = target.matches('input:not([type=checkbox]):not([type=range]), textarea, select');
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (e.key === 'Shift') this.held.add('Shift');
      if (!typing && !mod && (ARROWS.includes(e.key) || e.key === ' ')) {
        e.preventDefault();
        if (e.key === ' ') this.setSpace(true);
        else this.held.add(e.key);
        return;
      }
      if (mod && key === 's') {
        e.preventDefault();
        void this.saveMap(e.shiftKey);
        return;
      }
      if (mod && key === 'o') {
        e.preventDefault();
        void this.openMap();
        return;
      }
      if (typing) {
        if (e.key === 'Escape') target.blur();
        return;
      }
      if (this.tools[this.state.tool].key?.(e)) {
        e.preventDefault();
        return;
      }
      const s = this.state;
      const handled = (() => {
        if (!mod && this.brushKey(e)) return true;
        if (mod) {
          switch (key) {
            case 'z':
              e.shiftKey ? this.doc.redo() : this.doc.undo();
              return true;
            case 'y':
              this.doc.redo();
              return true;
            case 'c':
              this.copy();
              return true;
            case 'v':
              this.paste();
              return true;
            case 'd':
              this.actions.duplicate();
              return true;
            case 'a':
              this.doc.select(this.doc.map.objects.filter((o) => this.doc.isPickable(o)).map((o) => o.id));
              return true;
            case 'g':
              this.actions.group();
              return true;
          }
          return false;
        }
        switch (key) {
          case 'q':
            this.setTool('select');
            return true;
          case 'w':
            this.setTransform('translate');
            return true;
          case 'e':
            this.setTransform('rotate');
            return true;
          case 'r':
            this.setTransform('scale');
            return true;
          case 'b':
            this.setTool('sculpt');
            return true;
          case 'p':
            this.setTool('paint');
            return true;
          case '1':
          case '2':
          case '3':
          case '4':
          case '5':
            s.heightTool = (['raise', 'lower', 'smooth', 'flatten', 'noise'] as const)[Number(key) - 1];
            this.setTool('sculpt');
            return true;
          case 't':
            this.setTool('stamp');
            return true;
          case 'delete':
          case 'backspace':
            this.actions.remove();
            return true;
          case 'escape':
            if (s.tool !== 'select') this.setTool('select');
            else this.doc.select([]);
            return true;
          case 'h':
            this.actions.toggleHidden(this.doc.selection);
            return true;
          case 'l':
            if (e.shiftKey) this.actions.toggleLocked(this.doc.selection);
            else this.setTool('lasso');
            return true;
          case 'k':
            s.placeType = COLLISION_LINE;
            this.setTool('place');
            return true;
          case 'g':
            this.actions.ground();
            return true;
          case 'f':
            this.focusSelection();
            return true;
          case 'home':
            this.frameMap();
            return true;
          case 'x':
            s.snap = !s.snap;
            this.stateChanged();
            return true;
          case 'c':
            this.toggleGameView();
            return true;
          case 'f1':
          case '?':
            void helpDialog();
            return true;
        }
        return false;
      })();
      if (handled) e.preventDefault();
    });
  }

  private setTransform(mode: TransformMode): void {
    this.state.transformMode = mode;
    this.gizmo.setMode(mode);
    this.setTool('select');
  }

  private toggleGameView(): void {
    this.gameView = !this.gameView;
    this.viewport.setMode(this.gameView ? 'game' : 'free', this.doc.schema.camera);
    this.objects.setGameView(this.gameView);
    this.renderToolbar();
  }

  private frameMap(): void {
    const [w, d] = this.doc.map.settings.size;
    if (this.gameView) this.viewport.lookAtPoint(w / 2, heightAt(this.doc.map, w / 2, d / 2), d / 2);
    else this.viewport.frameMap([w, d], heightAt(this.doc.map, w / 2, d / 2));
  }

  /** Kamera na całe zaznaczenie (środek i promień obejmujący wszystkie obiekty); bez zaznaczenia – cała mapa. */
  private focusSelection(): void {
    const sel = this.doc.selectedObjects();
    if (!sel.length) return this.frameMap();
    const pts = sel.flatMap((o) => (o.points.length ? o.points : [o.position]));
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (const p of pts) for (let k = 0; k < 3; k++) (min[k] = Math.min(min[k], p[k])), (max[k] = Math.max(max[k], p[k]));
    const c: Vec3 = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2];
    const size = Math.max(...sel.filter((o) => !o.points.length).map((o) => Math.max(...o.scale) * 2), 2);
    this.viewport.focus(c, Math.hypot(max[0] - min[0], max[2] - min[2]) / 2 + size);
  }

  // ---------------- Akcje ----------------

  private copy(): void {
    this.clipboard = this.doc.selectedObjects().map(cloneObject);
    if (this.clipboard.length) toast(t('toast.copied', { n: this.clipboard.length }));
  }

  private paste(): void {
    if (!this.clipboard.length) return;
    // wklej w miejscu kursora (albo obok oryginału)
    const c: Vec3 = [0, 0, 0];
    for (const o of this.clipboard) {
      const p = objectCenter(o);
      for (let k = 0; k < 3; k++) c[k] += p[k] / this.clipboard.length;
    }
    const hit = this.lastHit?.hit;
    const off: Vec3 = hit ? [hit[0] - c[0], 0, hit[2] - c[2]] : [this.state.gridStep, 0, this.state.gridStep];
    const s = this.snap([c[0] + off[0], 0, c[2] + off[2]]);
    this.doc.pasteObjects(this.clipboard, [s[0] - c[0], 0, s[2] - c[2]]);
  }

  actions: Actions = {
    duplicate: () => {
      const sel = this.doc.selectedObjects();
      if (!sel.length) return;
      const step = this.state.snap ? this.state.gridStep : 1;
      this.doc.pasteObjects(sel, [step, 0, step]);
    },
    remove: () => {
      if (this.doc.selection.length) this.doc.removeObjects(this.doc.selection);
    },
    ground: () => {
      const m = this.doc.map;
      this.doc.updateObjects(this.doc.selection, (o) => {
        o.position[1] = heightAt(m, o.position[0], o.position[2]);
        o.points = o.points.map((p) => [p[0], heightAt(m, p[0], p[2]), p[2]]);
      }, 'ground');
    },
    group: () => {
      if (this.doc.selection.length) this.doc.groupObjects(this.doc.selection, t('list.groupName', { n: this.doc.map.groups.length + 1 }));
    },
    ungroup: (id) => this.doc.ungroup(id),
    focusObject: (id) => {
      const o = this.doc.getObject(id);
      if (!o) return;
      if (!this.doc.selection.includes(id)) this.doc.select([id]);
      this.viewport.focus(objectCenter(o));
    },
    toggleHidden: (ids) => {
      const objs = ids.map((id) => this.doc.getObject(id)).filter((o): o is MapObject => !!o);
      if (!objs.length) return;
      const hide = objs.some((o) => !o.hidden);
      this.doc.updateObjects(ids, (o) => (o.hidden = hide), 'hide');
    },
    toggleLocked: (ids) => {
      const objs = ids.map((id) => this.doc.getObject(id)).filter((o): o is MapObject => !!o);
      if (!objs.length) return;
      const lock = objs.some((o) => !o.locked);
      this.doc.updateObjects(ids, (o) => (o.locked = lock), 'lock');
    },
  };

  // ---------------- Pliki ----------------

  private async confirmDiscard(): Promise<boolean> {
    if (this.doc.changes === 0) return true;
    return confirmBox(t('dlg.unsavedTitle'), t('dlg.unsavedText'), t('dlg.continue'));
  }

  async newMap(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    const d = this.doc.schema.mapDefaults;
    const v = await newMapDialog({ name: t('newMap.defaultName'), width: d.size[0], depth: d.size[1], resolution: d.resolution, height: d.height });
    if (!v) return;
    this.fileHandle = undefined;
    this.fileName = undefined;
    this.doc.setMap(createMap(this.doc.schema, { name: v.name, size: [v.width, v.depth], resolution: v.resolution, height: v.height }));
    this.autosave();
  }

  async openMap(): Promise<void> {
    if (!(await this.confirmDiscard())) return;
    let f;
    try {
      f = await openJsonFile();
    } catch (e) {
      return alertBox(t('dlg.error'), String(e));
    }
    if (!f) return;
    let map: MapData;
    try {
      map = parseMap(f.text);
    } catch (e) {
      return alertBox(t('dlg.openFailed'), e instanceof MapFormatError ? e.message : String(e));
    }
    if (map.schema.id && map.schema.id !== this.doc.schema.id) {
      const ok = await confirmBox(t('dlg.schemaMismatchTitle'), t('dlg.schemaMismatch', { map: map.schema.id, schema: this.doc.schema.id }), t('dlg.openAnyway'));
      if (!ok) return;
    }
    this.fileHandle = f.handle;
    this.fileName = f.name;
    this.doc.setMap(map);
    this.autosave();
    toast(t('toast.opened', { name: f.name }));
  }

  /**
   * Dane dla gry wyliczane przy zapisie: kształty kolizji, maska nieprzechodniości (strome zbocza
   * i wszystkie kolizje) oraz powierzchnie chodliwe.
   */
  private derived(): MapDerived {
    const m = this.doc.map;
    const walkable = collectWalkable(this.doc.schema, m, (typeId) => {
      const ty = this.doc.schema.objectTypes.find((x) => x.id === typeId);
      return ty?.look.model ? this.models.walkableTriangles(ty.look.model) : null;
    });
    const collision = collectCollision(this.doc.schema, m);
    let blocked = m.settings.slope.enabled ? computeSlopeMask(m) : undefined;
    if (collision.length) blocked = rasterizeCollision(m, collision, blocked);
    return { ...(blocked ? { blocked } : {}), ...(walkable.length ? { walkable } : {}), ...(collision.length ? { collision } : {}) };
  }

  async saveMap(saveAs = false): Promise<void> {
    const errors = this.issues.filter((i) => i.level === 'error').length;
    if (errors) toast(t('toast.savedWithErrors', { n: errors }), 'error');
    const text = mapToJson(this.doc.map, this.derived(), __APP_VERSION__);
    const slug = (this.doc.map.settings.name || 'mapa').toLowerCase().replace(/[^a-z0-9ąćęłńóśźż_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'mapa';
    try {
      const r = await saveTextFile(text, this.fileName ?? `${slug}.json`, saveAs ? undefined : this.fileHandle);
      if (!r) return;
      this.fileHandle = r.handle;
      this.fileName = r.name;
      this.doc.changes = 0;
      this.renderToolbar();
      toast(hasFileSystemAccess ? t('toast.saved', { name: r.name }) : t('toast.downloaded', { name: r.name }));
      this.autosave();
    } catch (e) {
      void alertBox(t('dlg.error'), String(e));
    }
  }

  async loadSchemaFile(): Promise<void> {
    const f = await openJsonFile().catch((e) => (void alertBox(t('dlg.error'), String(e)), null));
    if (!f) return;
    let raw: unknown;
    try {
      raw = JSON.parse(f.text);
    } catch (e) {
      return alertBox(t('dlg.schemaFailed'), String(e));
    }
    this.applySchema(raw, f.name);
  }

  private applySchema(raw: unknown, name: string): void {
    let schema: Schema;
    try {
      schema = parseSchema(raw);
    } catch (e) {
      void alertBox(t('dlg.schemaFailed'), e instanceof SchemaError ? e.problems.join('\n') : String(e));
      return;
    }
    this.schemaRaw = raw;
    this.doc.map.schema = { id: schema.id, version: schema.version };
    this.doc.setMap(this.doc.map, schema);
    this.autosave();
    toast(t('toast.schemaLoaded', { name: locText(schema.name, getLang(), name) }));
    void confirmBox(t('dlg.schemaLoadedTitle'), t('dlg.schemaLoadedText'), t('menu.newMap')).then((ok) => { if (ok) void this.newMap(); });
  }

  /** Import modeli w dowolnym obsługiwanym formacie; każdy zamieniany na .glb. */
  async loadModels(): Promise<void> {
    const files = await openBinaryFiles(MODEL_ACCEPT);
    if (!files.length) return;
    toast(t('models.converting'));
    const { models, problems } = await importModelFiles(files);
    for (const m of models) this.models.addFile(m.name, m.glb);
    if (models.length) this.autosave();
    if (!problems.length) {
      toast(t('toast.modelsLoaded', { n: models.length }));
      return;
    }
    const lines = problems.map((p) => {
      switch (p.code) {
        case 'missing':
          return t('models.missing', { file: p.file, names: p.missing.join(', ') });
        case 'failed':
          return t('models.failed', { file: p.file, detail: p.detail });
        case 'unused':
          return t('models.unused', { file: p.file });
        case 'noModel':
          return t('models.noModel');
      }
    });
    void alertBox(t('models.title'), h('div', {}, h('p', {}, t('models.intro', { n: models.length })), h('ul', {}, ...lines.map((l) => h('li', {}, l)))));
  }

  /** Wszystkie wczytane modele jako .glb w jednym archiwum – w tym formacie trafiają do gry. */
  downloadModels(): void {
    const list = [...this.models.fileData].map(([name, data]) => ({ name, data }));
    if (!list.length) return toast(t('models.none'), 'error');
    downloadBlob(new Blob([zipModels(list) as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), 'modele.zip');
  }

  private async autosave(): Promise<void> {
    try {
      const models: Record<string, ArrayBuffer> = {};
      for (const [k, v] of this.models.fileData) models[k] = v;
      const savedAt = Date.now();
      await writeAutosave({ schemaRaw: this.schemaRaw, mapJson: mapToJson(this.doc.map), savedAt, models, stamps: this.stamps.custom(), fileName: this.fileName });
      this.savedAt = savedAt;
      this.renderStatus();
    } catch (e) {
      console.warn('Zapis roboczy nie powiódł się', e);
      this.el.statusSave.textContent = t('status.autosaveFailed');
    }
  }

  private validate(): void {
    this.issues = runValidation(this);
    renderValidation(this.el.valid, this, this.issues, this.el.validHeader);
    renderProps(this.el.props, this, this.issues, this.actions);
  }

  // ---------------- Rysowanie interfejsu ----------------

  private renderAll(): void {
    document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((el) => (el.textContent = t(el.dataset.i18n!)));
    this.minimap.setTitle(t('minimap.hint'));
    this.renderToolbar();
    this.renderLeft();
    this.renderLists();
    renderValidation(this.el.valid, this, this.issues, this.el.validHeader);
    this.refreshHint();
    this.renderStatus();
  }

  private renderStatus(): void {
    const n = this.doc.selection.length;
    this.el.statusSel.textContent = n ? t('status.selected', { n }) : t('status.objects', { n: this.doc.map.objects.length });
    this.el.statusSave.textContent = this.savedAt ? t('status.autosaved', { time: new Date(this.savedAt).toLocaleTimeString(getLang(), { hour: '2-digit', minute: '2-digit', second: '2-digit' }) }) : '';
  }

  private renderLists(): void {
    renderProps(this.el.props, this, this.issues, this.actions);
    if (this.leftTab === 'list') this.renderLeft();
    this.renderStatus();
  }

  private renderLeft(): void {
    clear(this.el.tabs);
    for (const tab of ['objects', 'terrain', 'list'] as LeftTab[])
      this.el.tabs.append(
        h('button', { class: this.leftTab === tab ? 'active' : '', onclick: () => ((this.leftTab = tab), this.renderLeft()) }, t(`tab.${tab}`)),
      );
    if (this.leftTab === 'objects') renderPalette(this.el.left, this);
    else if (this.leftTab === 'terrain') renderTerrainPanel(this.el.left, this);
    else renderObjectList(this.el.left, this, this.listState, this.actions, () => this.renderLeft());
  }

  private renderToolbar(): void {
    const s = this.state;
    const tb = this.el.toolbar;
    clear(tb);
    const btn = (label: string, title: string, onclick: () => void, active = false, disabled = false) =>
      h('button', { class: active ? 'active' : '', title, onclick, disabled }, label);
    const menu = (label: string, items: Array<[string, string, () => void] | null>) => {
      const d = h('details', { class: 'menu' }, h('summary', {}, label));
      const list = h('div', { class: 'menu-list' });
      for (const it of items) {
        if (!it) list.append(h('hr'));
        else
          list.append(
            h('button', {
              onclick: () => {
                d.open = false;
                it[2]();
              },
            }, h('span', {}, it[0]), h('kbd', {}, it[1])),
          );
      }
      d.append(list);
      d.addEventListener('toggle', () => {
        if (d.open) setTimeout(() => document.addEventListener('click', () => (d.open = false), { once: true }), 0);
      });
      return d;
    };
    const title = (this.doc.map.settings.name || t('newMap.defaultName')) + (this.doc.changes ? ' •' : '');
    tb.append(
      h('span', { class: 'brand', title: t('app.title') }, t('app.title')),
      menu(t('menu.file'), [
        [t('menu.newMap'), '', () => void this.newMap()],
        [t('menu.open'), 'Ctrl+O', () => void this.openMap()],
        [t('menu.save'), 'Ctrl+S', () => void this.saveMap()],
        [t('menu.saveAs'), 'Ctrl+Shift+S', () => void this.saveMap(true)],
        null,
        [t('menu.loadSchema'), '', () => void this.loadSchemaFile()],
        [t('menu.exampleSchema'), '', () => this.applySchema(structuredClone(exampleSchemaRaw), 'przyklad')],
        [t('menu.loadModels'), '', () => void this.loadModels()],
        [t('menu.downloadModels'), '', () => this.downloadModels()],
      ]),
      h('span', { class: 'sep' }),
      btn('↶', `${t('tb.undo')} (Ctrl+Z)`, () => this.doc.undo(), false, !this.doc.history.canUndo),
      btn('↷', `${t('tb.redo')} (Ctrl+Y)`, () => this.doc.redo(), false, !this.doc.history.canRedo),
      h('span', { class: 'sep' }),
      btn(t('tb.select'), `${t('tb.selectHint')} (Q)`, () => this.setTool('select'), s.tool === 'select' && false),
      btn(t('tb.move'), `${t('tb.moveHint')} (W)`, () => this.setTransform('translate'), s.tool === 'select' && s.transformMode === 'translate'),
      btn(t('tb.rotate'), `${t('tb.rotateHint')} (E)`, () => this.setTransform('rotate'), s.tool === 'select' && s.transformMode === 'rotate'),
      btn(t('tb.scale'), `${t('tb.scaleHint')} (R)`, () => this.setTransform('scale'), s.tool === 'select' && s.transformMode === 'scale'),
      h('span', { class: 'sep' }),
      btn(t('tb.sculpt'), `${t('tb.sculptHint')} (B)`, () => this.setTool('sculpt'), s.tool === 'sculpt'),
      btn(t('tb.paint'), `${t('tb.paintHint')} (P)`, () => this.setTool('paint'), s.tool === 'paint'),
      h('span', { class: 'sep' }),
      btn(t('tb.grid'), `${t('tb.gridHint')} (X)`, () => ((s.snap = !s.snap), this.stateChanged()), s.snap),
      h('input', {
        class: 'grid-step',
        type: 'number',
        min: 0.1,
        step: 0.1,
        value: s.gridStep,
        title: t('tb.gridStep'),
        onchange: (e: Event) => {
          s.gridStep = Math.max(0.1, Number((e.target as HTMLInputElement).value) || 1);
          this.stateChanged();
        },
      }),
      btn(t('tb.gameView'), `${t('tb.gameViewHint')} (C)`, () => this.toggleGameView(), this.gameView),
      h('span', { class: 'grow' }),
      h('span', { class: 'doc-title', title: this.fileName ?? '' }, title),
      h(
        'select',
        { class: 'lang', title: t('tb.language'), onchange: (e: Event) => setLang((e.target as HTMLSelectElement).value as Lang) },
        ...LANGS.map((l) => h('option', { value: l, selected: l === getLang() }, l.toUpperCase())),
      ),
      btn('?', `${t('tb.help')} (F1)`, () => void helpDialog()),
    );
  }
}
