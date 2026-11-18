// Edytor: łączy dokument, widok 3D, narzędzia, panele, pliki i zapis roboczy.
import exampleSchemaRaw from '../examples/schemat-przyklad.json';
import type { Ctx, EditorState, ToolId, TransformMode } from './context';
import { EditorDoc } from './core/doc';
import { mapToJson, MapFormatError, parseMap, type MapDerived } from './core/format';
import { cloneObject, createMap, heightAt, modelKey, objectCenter, type MapData, type MapGroup, type MapObject, type Vec3 } from './core/map';
import { locText, parseSchema, SchemaError, type ScaleCategory, type Schema } from './core/schema';
import { guessCategory } from './core/scaleNormalize';
import { RESIZE_WARN_POINTS, resizedResolution, resizeMap } from './core/resize';
import { collectCollision, COLLISION_LINE, computeBlockedMask } from './core/collision';
import { changeObjectType, modelRef, usedModels } from './core/objectModel';
import { DECORATION } from './core/builtinTypes';
import { createObject } from './core/map';
import { setPlayerModel, setTypeModel } from './core/schemaEdit';
import { fileStem } from './core/modelFiles';
import { Thumbnails } from './render/thumbnails';
import { isProjectZip, packProject, unpackProject } from './storage/project';
import { MODEL_DRAG_TYPE, renderLibrary, type LibraryState } from './ui/library';
import { raycastTerrain } from './core/terrain';
import type { Issue } from './core/validate';
import { collectWalkable } from './core/walkable';
import { getLang, hasKey, LANGS, onLangChange, setLang, t, type Lang } from './i18n';
import { MODEL_ACCEPT } from './core/modelFiles';
import { Gizmo } from './render/gizmo';
import { Minimap } from './render/minimap';
import { importModelFiles, zipModels } from './render/modelImport';
import { ModelLibrary } from './render/models';
import { ObjectsView } from './render/objectsView';
import { PlayMode } from './render/playMode';
import { Mannequin } from './render/mannequin';
import { applyVariation, DEFAULT_VARIATION } from './core/variation';
import { findStart } from './core/play';
import { TerrainMesh } from './render/terrainMesh';
import { Viewport } from './render/viewport';
import { loadAutosave, writeAutosave } from './storage/autosave';
import { downloadBlob, hasFileSystemAccess, openBinaryFiles, openJsonFile, openMapFile, saveTextFile, type FsHandle } from './storage/files';
import { StampLibrary } from './tools/stamps';
import { LassoTool, PaintTool, PlaceTool, SculptTool, SelectTool, StampTool, type Tool } from './tools/tools';
import { alertBox, chooseBox, confirmBox, helpDialog, modelDialog, newMapDialog, normalizeDialog, promptBox, resizeDialog, toast, type NormalizeRow } from './ui/dialogs';
import { clear, debounce, h } from './ui/dom';
import { KEY, tip, type KeyId } from './ui/shortcuts';
import { formatMeters, formatNum } from './ui/units';
import { renderObjectList, renderPalette, renderProps, renderTerrainPanel, renderValidation, runValidation, type Actions, type ListState } from './ui/panels';

type LeftTab = 'objects' | 'terrain' | 'list' | 'library';

export class App implements Ctx {
  doc!: EditorDoc;
  viewport: Viewport;
  terrain!: TerrainMesh;
  objects!: ObjectsView;
  models = new ModelLibrary();
  stamps = new StampLibrary();
  gizmo: Gizmo;
  clipboard: MapObject[] = [];
  /** Grupy skopiowane w całości razem z obiektami (wklejenie odtwarza ich strukturę). */
  private clipboardGroups: MapGroup[] = [];
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
    variation: { ...DEFAULT_VARIATION },
    snap: false,
    gridStep: 1,
    showGrid: false,
    slopeOverlay: true,
  };

  private fileHandle: FsHandle | undefined;
  private fileName: string | undefined;
  private tools!: Record<ToolId, Tool>;
  private leftTab: LeftTab = 'objects';
  private listState: ListState = { query: '', type: '', collapsed: new Set() };
  private libraryState: LibraryState = { query: '', collapsed: new Set() };
  private thumbs = new Thumbnails(this.models);
  private issues: Issue[] = [];
  private lastHit: { x: number; y: number; hit: Vec3 | null } | null = null;
  private savedAt: number | null = null;
  private gameView = false;
  private minimap: Minimap;
  /** Wciśnięte strzałki (przesuwanie kamery) i spacja (przesuwanie myszą). */
  private held = new Set<string>();
  /** Tryb „zagraj tę mapę”. */
  private play: PlayMode;
  /** Manekin postaci (M). */
  private mannequin: Mannequin;

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
    this.mannequin = new Mannequin(() => this.doc, this.models, () => this.objects);
    this.viewport.root.add(this.mannequin.group);
    this.play = new PlayMode(this, this.el.view, (game, guides) => this.objects.setGameView(game || this.gameView, guides, !game), () => this.afterPlay());
    const libChanged = debounce(() => {
      if (this.leftTab === 'library' && this.doc) this.renderLeft();
    }, 120);
    this.models.onChange = () => {
      this.objects?.sync();
      libChanged();
    };
    this.stamps.onChange = () => {
      if (this.doc) this.stateChanged();
    };
    this.viewport.onTick((time, dt) => {
      this.terrain?.tick(time);
      if (this.play.active) this.play.tick(dt);
      else {
        this.panWithKeys(dt);
        this.tools?.[this.state.tool].tick?.(dt);
      }
      if (this.doc) this.minimap.tick();
      if (this.doc && !this.play.active) this.mannequin.tick();
      this.objects?.tick(this.viewport.camera);
    });
    this.bindPointer();
    this.bindKeys();
    this.bindDrop();
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
        this.models.applyLibraryJson(saved.library);
        this.fileName = saved.fileName;
        this.init(schema, map, saved.schemaRaw);
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
      this.init(schema, createMap(schema, { name: t('newMap.defaultName'), size: d.size, resolution: d.resolution, height: d.height }), structuredClone(exampleSchemaRaw));
    }
  }

  private init(schema: Schema, map: MapData, schemaRaw: unknown): void {
    if (!this.doc) {
      this.doc = new EditorDoc(schema, map, schemaRaw);
      this.doc.modelDefaults = (ref) => ({ baseScale: this.models.baseScaleOf(ref), collision: this.models.collisionOf(ref) });
      this.objects = new ObjectsView(this.doc, this.models);
      this.viewport.root.add(this.objects.group);
      this.tools = { select: new SelectTool(this), sculpt: new SculptTool(this), paint: new PaintTool(this), place: new PlaceTool(this), stamp: new StampTool(this), lasso: new LassoTool(this) };
      this.bindDoc();
      this.onMapReplaced();
    } else this.doc.setMap(map, schema, schemaRaw);
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
    // zmiana schematu z interfejsu (model typu, model postaci): przerysuj obiekty i panele
    d.on('schema', () => {
      this.objects.sync(true);
      this.renderAll();
      validate();
    });
  }

  private onMapReplaced(): void {
    if (this.play?.active) this.play.stop();
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
    const text = this.play.active ? t('play.controls') : this.tools[this.state.tool].hint();
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
      if (this.play.active) return this.play.pointerDown(e);
      if (this.held.has(' ')) return;
      this.tools[this.state.tool].down?.(e);
    });
    c.addEventListener('pointermove', (e) => {
      this.lastHit = null;
      if (this.play.active) this.play.pointerMove(e);
      else this.tools[this.state.tool].move?.(e);
      const hit = this.terrainHit(e);
      this.mannequin.cursor = hit;
      this.el.statusCursor.textContent = hit ? t('status.cursor', { x: hit[0].toFixed(2), z: hit[2].toFixed(2), h: hit[1].toFixed(2) }) : '';
    });
    window.addEventListener('pointerup', (e) => (this.play.active ? this.play.pointerUp(e) : this.tools[this.state.tool].up?.(e)));
    c.addEventListener('dblclick', (e) => !this.play.active && this.tools[this.state.tool].dblclick?.(e));
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    c.addEventListener('pointerleave', () => {
      this.mannequin.cursor = null;
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
      if (this.play.active) this.play.key(e, false);
      this.held.delete(e.key);
      if (e.key === 'Shift') this.held.delete('Shift');
      if (e.key === ' ') this.setSpace(false);
    });
    window.addEventListener('blur', () => {
      this.play.blur();
      this.held.clear();
      this.setSpace(false);
    });
    window.addEventListener('keydown', (e) => {
      if (document.querySelector('.modal-overlay')) return;
      // F5 – zagraj od startu, Shift + F5 – spod kursora (także ponownie w trybie gry); nie odświeża strony
      if (e.key === 'F5' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        this.startPlay(e.shiftKey);
        return;
      }
      if (this.play.active) {
        // w trybie gry działają tylko klawisze gry; mapa się nie zmienia
        if (e.key === 'Escape') this.play.stop();
        else if (!this.play.key(e, true) && !e.ctrlKey && !e.metaKey) return;
        // Ctrl + … (cofnij, zapisz, wklej…) nie działa w trybie gry
        e.preventDefault();
        return;
      }
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
              if (e.shiftKey) this.actions.ungroupSelection();
              else this.actions.group();
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
            if (e.shiftKey) this.showAll();
            else this.actions.toggleHidden(this.doc.selection);
            return true;
          case 'l':
            if (e.shiftKey) this.actions.toggleLocked(this.doc.selection);
            else this.setTool('lasso');
            return true;
          case 'k':
            this.drawCollisionLine();
            return true;
          case 'o':
            this.placeLast();
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
          case 'v':
            this.toggleGameView();
            return true;
          case 'm':
            this.toggleMannequin();
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

  /** Mapa → Zmień rozmiar…: rozszerz albo rozciągnij (jeden krok cofania). */
  private async resizeMap(): Promise<void> {
    const map = this.doc.map;
    const L = (x: Parameters<typeof locText>[0], fb: string) => locText(x, getLang(), fb);
    const o = await resizeDialog({
      size: map.settings.size,
      pointsFor: (w, d) => Math.max(...resizedResolution(map, w, d)),
      gridFor: (w, d, p) => resizedResolution(map, w, d, p),
      warnPoints: RESIZE_WARN_POINTS,
      layers: this.doc.schema.terrainLayers.map((l) => ({ id: l.id, name: L(l.name, l.id) })),
      fillHeight: this.doc.schema.mapDefaults.height,
    });
    if (!o) return;
    const n = map.objects.length;
    this.doc.resize(resizeMap(this.doc.schema, map, o));
    toast(t('toast.resized', { w: formatNum(o.width), d: formatNum(o.depth), n }));
  }

  /** M: manekin postaci przy kursorze i obok zaznaczenia. */
  private toggleMannequin(): void {
    toast(this.mannequin.toggle() ? t('toast.mannequinOn', { h: formatMeters(this.doc.schema.player.height / this.doc.schema.scale.unitsPerMeter) }) : t('toast.mannequinOff'));
    this.renderToolbar();
  }

  /** O: wstawianie ostatniego typu z palety (bez wyboru – zakładka Obiekty). */
  private placeLast(): void {
    const s = this.state;
    const last = s.lastPaletteType && this.doc.schema.objectTypes.some((x) => x.id === s.lastPaletteType) ? s.lastPaletteType : null;
    if (!last) {
      this.leftTab = 'objects';
      this.renderLeft();
      toast(t('toast.pickType'));
      return;
    }
    s.placeType = last;
    this.setTool('place');
  }

  private drawCollisionLine(): void {
    this.state.placeType = COLLISION_LINE;
    this.setTool('place');
  }

  /** Shift + H: pokazuje wszystkie ukryte obiekty i grupy (jeden krok cofania). */
  private showAll(): void {
    const d = this.doc;
    if (!d.map.objects.some((o) => o.hidden) && !d.map.groups.some((g) => g.hidden)) return;
    d.transact('show-all', () => {
      for (const o of d.map.objects) o.hidden = false;
      for (const g of d.map.groups) g.hidden = false;
    });
  }

  private setTransform(mode: TransformMode): void {
    this.state.transformMode = mode;
    this.gizmo.setMode(mode);
    this.setTool('select');
  }

  /** Tryb gry: start z obiektu startowego albo spod kursora. */
  startPlay(atCursor: boolean): void {
    const map = this.doc.map;
    let at: Vec3 | null = null;
    if (atCursor) {
      const hit = this.lastHit?.hit;
      if (!hit) return toast(t('play.noCursor'), 'error');
      at = [hit[0], NaN, hit[2]];
    } else {
      at = findStart(this.doc.schema, map);
      if (!at) {
        const ty = this.doc.schema.player.startType;
        toast(ty ? t('play.noStartObject', { type: ty }) : t('play.noStartType'));
        at = [map.settings.size[0] / 2, NaN, map.settings.size[1] / 2];
      }
    }
    if (!this.play.active) {
      this.setTool('select');
      this.gizmo.enabled = false;
      this.gizmo.refresh();
      this.el.view.parentElement?.classList.add('playing');
    }
    this.play.start(at);
    this.renderToolbar();
    this.refreshHint();
  }

  private afterPlay(): void {
    this.el.view.parentElement?.classList.remove('playing');
    this.gizmo.enabled = true;
    this.gizmo.refresh();
    this.applyViewState();
    this.renderToolbar();
    this.refreshHint();
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
    this.clipboardGroups = this.doc.fullGroups(this.doc.selection).map((g) => ({ ...g }));
    if (this.clipboard.length) toast(t('toast.copied', { n: this.clipboard.length }));
  }

  /** Grupy zaznaczone w całości, bez tych, które leżą w innej takiej grupie. */
  private topFullGroups(ids: string[]): MapGroup[] {
    const full = this.doc.fullGroups(ids);
    const fullIds = new Set(full.map((g) => g.id));
    return full.filter((g) => !this.doc.groupChain(g.parent).some((p) => fullIds.has(p.id)));
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
    this.doc.pasteObjects(this.clipboard, [s[0] - c[0], 0, s[2] - c[2]], this.clipboardGroups);
  }

  actions: Actions = {
    duplicate: () => {
      const sel = this.doc.selectedObjects();
      if (!sel.length) return;
      const step = this.state.snap ? this.state.gridStep : 1;
      this.doc.pasteObjects(sel, [step, 0, step], this.doc.fullGroups(this.doc.selection));
    },
    duplicateGroup: (id) => {
      const ids = this.doc.groupObjectIds(id);
      const objs = ids.map((x) => this.doc.getObject(x)!).filter(Boolean);
      const groups = [...this.doc.groupDescendants(id)].map((g) => this.doc.getGroup(g)!).filter(Boolean);
      const step = this.state.snap ? this.state.gridStep : 1;
      if (objs.length) this.doc.pasteObjects(objs, [step, 0, step], groups);
    },
    newGroup: () => {
      this.doc.groupObjects([], t('list.groupName', { n: this.doc.map.groups.length + 1 }), []);
      this.leftTab = 'list';
      this.renderLeft();
    },
    ungroupSelection: () => {
      const top = this.topFullGroups(this.doc.selection);
      if (top.length) {
        for (const g of top) this.doc.ungroup(g.id);
        return;
      }
      // brak całych grup – wyjmij zaznaczone obiekty poziom wyżej
      const objs = this.doc.selectedObjects().filter((o) => o.group);
      for (const o of objs) this.doc.moveToGroup([o.id], [], this.doc.getGroup(o.group)?.parent ?? null);
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
      if (!this.doc.selection.length) return;
      // całe zaznaczone grupy trafiają do nowej grupy jako podgrupy, a reszta obiektów – bezpośrednio
      const top = this.topFullGroups(this.doc.selection);
      const inTop = new Set(top.flatMap((g) => this.doc.groupObjectIds(g.id)));
      const loose = this.doc.selection.filter((id) => !inTop.has(id));
      this.doc.groupObjects(loose, t('list.groupName', { n: this.doc.map.groups.length + 1 }), top.map((g) => g.id));
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
    changeType: (ids, typeId) => {
      try {
        this.doc.updateObjects(ids.filter((id) => !this.doc.getObject(id)?.points.length), (o) => changeObjectType(this.doc.schema, o, typeId), 'change-type');
      } catch (e) {
        toast(String((e as Error).message), 'error');
      }
    },
    setObjectModel: (ids, model) => this.doc.updateObjects(ids, (o) => (model ? (o.model = model) : delete o.model), 'model'),
    editTypeModel: (typeId) => void this.editTypeModel(typeId),
    setBaseScale: (ref, v) => {
      this.doc.setModelBaseScale(ref, v);
      this.models.setBaseScale(ref, v);
    },
    toggleLocked: (ids) => {
      const objs = ids.map((id) => this.doc.getObject(id)).filter((o): o is MapObject => !!o);
      if (!objs.length) return;
      const lock = objs.some((o) => !o.locked);
      this.doc.updateObjects(ids, (o) => (o.locked = lock), 'lock');
    },
  };

  // ---------------- Biblioteka modeli ----------------

  /** Dekoracja z modelem z biblioteki w punkcie mapy (jeden krok cofania). */
  private addDecoration(name: string, at: Vec3): void {
    const d = this.doc;
    const o = createObject(d.schema, d.map, DECORATION, this.snap(at));
    o.model = modelRef(name);
    o.name = `${fileStem(name)}-${d.map.objects.filter((x) => x.model && fileStem(x.model) === fileStem(name)).length + 1}`;
    applyVariation(o, this.state.variation);
    d.transact('add', () => d.map.objects.push(o), [o.id]);
  }

  /** Okno „Model typu”: model z biblioteki i jego ułożenie, zapisywane w schemacie (cofnij/ponów). */
  async editTypeModel(typeId: string, model?: string): Promise<void> {
    const ty = this.doc.schema.objectTypes.find((x) => x.id === typeId);
    if (!ty) return;
    const name = locText(ty.name, getLang(), ty.id);
    const sameAsNow = !model || fileStem(model) === fileStem(ty.look.model ?? '');
    const r = await modelDialog(
      t('modelDlg.typeTitle', { name }),
      t('modelDlg.typeIntro', { name }),
      this.models.fileNames.map(modelRef),
      { model: model ? modelRef(model) : ty.look.model, transform: sameAsNow ? ty.look.modelTransform : { offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      t('modelDlg.noneType'),
    );
    if (!r) return;
    this.tryEditSchema('type-model', (raw) => setTypeModel(raw, typeId, r.model, r.transform));
  }

  /** Okno „Model postaci” (sekcja player w schemacie). */
  async editPlayerModel(model?: string): Promise<void> {
    const pl = this.doc.schema.player;
    const sameAsNow = !model || fileStem(model) === fileStem(pl.model ?? '');
    const r = await modelDialog(
      t('modelDlg.playerTitle'),
      t('modelDlg.playerIntro'),
      this.models.fileNames.map(modelRef),
      { model: model ? modelRef(model) : pl.model, transform: sameAsNow ? pl.modelTransform : { offset: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1] } },
      t('modelDlg.nonePlayer'),
    );
    if (!r) return;
    this.tryEditSchema('player-model', (raw) => setPlayerModel(raw, r.model, r.transform));
  }

  private tryEditSchema(label: string, fn: (raw: unknown) => unknown): void {
    try {
      this.doc.editSchema(label, fn);
      toast(t('toast.schemaChanged'));
    } catch (e) {
      void alertBox(t('dlg.schemaFailed'), e instanceof SchemaError ? e.problems.join('\n') : String(e));
    }
  }

  private libraryActions = {
    importFiles: () => void this.loadModels(),
    loadExamples: () => void this.loadExampleModels(),
    place: (name: string) => {
      const c = this.viewport.controls.target;
      this.addDecoration(name, [c.x, heightAt(this.doc.map, c.x, c.z), c.z]);
    },
    useAs: async (name: string) => {
      const types = this.doc.schema.objectTypes.filter((x) => x.kind === 'point' || x.kind === 'solid');
      const role = await chooseBox(t('lib.useAsTitle', { name }), t('lib.useAsText'), [
        { value: '@player', label: t('lib.rolePlayerLong') },
        ...types.map((x) => ({ value: x.id, label: `${locText(x.name, getLang(), x.id)}${x.look.model ? ` (${fileStem(x.look.model)})` : ''}`, group: t('lib.roleTypes') })),
      ]);
      if (!role) return;
      if (role === '@player') await this.editPlayerModel(name);
      else await this.editTypeModel(role, name);
    },
    normalize: (name: string) => void this.normalizeModels([name]),
    setFolder: async (name: string) => {
      const folders = [...new Set(this.models.folders.values())].sort();
      const v = await promptBox(t('lib.folderTitle', { name }), t('lib.folderLabel'), this.models.folders.get(name) ?? '', folders.length ? t('lib.folderExisting', { list: folders.join(', ') }) : t('lib.folderHint'));
      if (v === null) return;
      this.models.setFolder(name, v);
      void this.autosave();
    },
    remove: async (name: string) => {
      const used = this.doc.map.objects.filter((o) => o.model && fileStem(o.model) === fileStem(name)).length;
      if (!(await confirmBox(t('lib.removeTitle'), t('lib.removeText', { name, n: used }), t('lib.remove')))) return;
      this.models.remove(name);
      void this.autosave();
    },
  };

  /** Przykładowe modele z repozytorium (leżą obok edytora w katalogu modele/). */
  private async loadExampleModels(): Promise<void> {
    const names = ['kladka.glb', 'postac.glb', 'beczka.glb', 'skrzynia.glb', 'skaly.glb', 'plot.glb', 'drzewo.glb'];
    let n = 0;
    for (const name of names) {
      try {
        const r = await fetch(`modele/${name}`);
        if (!r.ok) continue;
        this.models.addFile(name, await r.arrayBuffer());
        if (!this.models.folders.has(name)) this.models.setFolder(name, t('lib.examplesFolder'));
        n++;
      } catch {
        /* brak pliku – pomijamy */
      }
    }
    toast(t('toast.modelsLoaded', { n }));
    void this.autosave();
  }

  /** Przeciąganie: model z biblioteki na widok (dekoracja), pliki z dysku na okno (import modeli lub projekt). */
  private bindDrop(): void {
    const c = this.viewport.renderer.domElement;
    const overlay = h('div', { class: 'drop-overlay' }, t('lib.dropFiles'));
    let depth = 0;
    const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes('Files');
    c.addEventListener('dragover', (e) => {
      if (!e.dataTransfer || ![...e.dataTransfer.types].includes(MODEL_DRAG_TYPE) || this.play.active) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
      const hit = this.terrainHit(e);
      if (hit) this.terrain.setBrush(hit[0], hit[2], 0.6, true, 0xb48ce0);
    });
    c.addEventListener('dragleave', () => this.terrain.setBrush(0, 0, 1, false));
    c.addEventListener('drop', (e) => {
      const name = e.dataTransfer?.getData(MODEL_DRAG_TYPE);
      if (!name || this.play.active) return;
      e.preventDefault();
      e.stopPropagation();
      this.terrain.setBrush(0, 0, 1, false);
      this.lastHit = null;
      const hit = this.terrainHit(e);
      if (hit) this.addDecoration(name, hit);
    });
    window.addEventListener('dragenter', (e) => {
      if (!hasFiles(e) || this.play.active) return;
      depth++;
      document.body.append(overlay);
    });
    window.addEventListener('dragleave', (e) => {
      if (!hasFiles(e)) return;
      if (--depth <= 0) (depth = 0), overlay.remove();
    });
    window.addEventListener('dragover', (e) => {
      if (hasFiles(e)) e.preventDefault();
    });
    window.addEventListener('drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      depth = 0;
      overlay.remove();
      if (this.play.active) return;
      const files = [...(e.dataTransfer?.files ?? [])];
      void Promise.all(files.map(async (f) => ({ name: f.name, data: await f.arrayBuffer() }))).then((list) => this.importDropped(list));
    });
  }

  private async importDropped(list: Array<{ name: string; data: ArrayBuffer }>): Promise<void> {
    const project = list.find((f) => /\.zip$/i.test(f.name) && isProjectZip(f.data));
    if (project) return this.openProject(project.name, project.data);
    const map = list.find((f) => /\.json$/i.test(f.name));
    if (map && list.length === 1) return void alertBox(t('lib.title'), t('lib.dropJson'));
    await this.importModels(list.filter((f) => !/\.json$/i.test(f.name)));
    this.leftTab = 'library';
    this.renderLeft();
  }

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
      f = await openMapFile();
    } catch (e) {
      return alertBox(t('dlg.error'), String(e));
    }
    if (!f) return;
    if (f.data) return this.openProject(f.name, f.data, true);
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

  /** Projekt .zip: mapa, schemat, foldery biblioteki i modele (z „Eksportuj projekt”). */
  async openProject(name: string, data: ArrayBuffer, confirmed = false): Promise<void> {
    if (!confirmed && !(await this.confirmDiscard())) return;
    let p, map: MapData, schema: Schema;
    try {
      p = unpackProject(data);
      map = parseMap(p.mapJson);
      schema = p.schemaRaw !== undefined ? parseSchema(p.schemaRaw) : this.doc.schema;
    } catch (e) {
      return alertBox(t('dlg.openFailed'), e instanceof MapFormatError ? e.message : e instanceof SchemaError ? e.problems.join('\n') : String(e));
    }
    for (const m of p.models) this.models.addFile(m.name, m.data);
    this.models.applyLibraryJson(p.library);
    this.fileHandle = undefined;
    this.fileName = name.replace(/\.zip$/i, '.json');
    this.doc.setMap(map, schema, p.schemaRaw !== undefined ? p.schemaRaw : this.doc.schemaRaw);
    void this.autosave();
    toast(t('toast.projectOpened', { name, n: p.models.length }));
  }

  /** Projekt w jednym .zip: mapa (z danymi dla gry), schemat, foldery biblioteki i wszystkie modele .glb. */
  exportProject(): void {
    const errors = this.issues.filter((i) => i.level === 'error').length;
    if (errors) toast(t('toast.savedWithErrors', { n: errors }), 'error');
    const zip = packProject({
      mapJson: mapToJson(this.doc.map, this.derived(), __APP_VERSION__),
      schemaRaw: this.doc.schemaRaw,
      library: this.models.libraryJson(),
      models: [...this.models.fileData].map(([name, data]) => ({ name, data })),
    });
    downloadBlob(new Blob([zip as Uint8Array<ArrayBuffer>], { type: 'application/zip' }), `${this.slug()}.zip`);
    toast(t('toast.projectExported', { n: this.models.fileData.size }));
  }

  /** Schemat ze zmianami zrobionymi w edytorze (np. przypisane modele) – do podmiany w grze. */
  downloadSchema(): void {
    const id = this.doc.schema.id || 'schemat';
    downloadBlob(new Blob([JSON.stringify(this.doc.schemaRaw, null, 2) + '\n'], { type: 'application/json' }), `${id}.schemat.json`);
  }

  private slug(): string {
    return (this.doc.map.settings.name || 'mapa').toLowerCase().replace(/[^a-z0-9ąćęłńóśźż_-]+/gi, '-').replace(/^-+|-+$/g, '') || 'mapa';
  }

  /**
   * Dane dla gry wyliczane przy zapisie: kształty kolizji, maska nieprzechodniości (strome zbocza
   * i wszystkie kolizje) oraz powierzchnie chodliwe.
   */
  private derived(): MapDerived {
    const m = this.doc.map;
    const walkable = collectWalkable(this.doc.schema, m, (ref) => this.models.walkableTriangles(ref));
    const collision = collectCollision(this.doc.schema, m, (ref) => this.models.bounds(ref), this.models.outlineProvider);
    const blocked = computeBlockedMask(this.doc.schema, m, collision);
    const models = usedModels(this.doc.schema, m.objects);
    return { ...(blocked ? { blocked } : {}), ...(walkable.length ? { walkable } : {}), ...(collision.length ? { collision } : {}), ...(models.length ? { models } : {}) };
  }

  async saveMap(saveAs = false): Promise<void> {
    const errors = this.issues.filter((i) => i.level === 'error').length;
    if (errors) toast(t('toast.savedWithErrors', { n: errors }), 'error');
    const text = mapToJson(this.doc.map, this.derived(), __APP_VERSION__);
    const slug = this.slug();
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
    this.doc.map.schema = { id: schema.id, version: schema.version };
    this.doc.setMap(this.doc.map, schema, raw);
    this.autosave();
    toast(t('toast.schemaLoaded', { name: locText(schema.name, getLang(), name) }));
    void confirmBox(t('dlg.schemaLoadedTitle'), t('dlg.schemaLoadedText'), t('menu.newMap')).then((ok) => { if (ok) void this.newMap(); });
  }

  /** Import modeli w dowolnym obsługiwanym formacie; każdy zamieniany na .glb. */
  async loadModels(): Promise<void> {
    const files = await openBinaryFiles(MODEL_ACCEPT);
    if (!files.length) return;
    await this.importModels(files);
  }

  private async importModels(files: Array<{ name: string; data: ArrayBuffer }>): Promise<void> {
    if (!files.length) return;
    toast(t('models.converting'));
    const { models, problems } = await importModelFiles(files);
    for (const m of models) this.models.addFile(m.name, m.glb);
    if (models.length) this.autosave();
    if (!problems.length) {
      toast(t('toast.modelsLoaded', { n: models.length }));
      if (models.length) await this.normalizeModels(models.map((m) => m.name));
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
    await alertBox(t('models.title'), h('div', {}, h('p', {}, t('models.intro', { n: models.length })), h('ul', {}, ...lines.map((l) => h('li', {}, l)))));
    if (models.length) await this.normalizeModels(models.map((m) => m.name));
  }

  /** Nazwa kategorii modeli: ze schematu albo z tłumaczeń (kategorie domyślne). */
  private categoryName = (c: ScaleCategory): string => (c.name ? locText(c.name, getLang(), c.id) : hasKey(`scaleCategory.${c.id}`) ? t(`scaleCategory.${c.id}`) : c.id);

  /**
   * Normalizacja skali: mierzy modele i proponuje skalę bazową według kategorii. Wynik trafia do biblioteki
   * (domyślna skala nowych obiektów) i do mapy – dla modeli, których mapa już używa (jeden krok cofania).
   */
  private async normalizeModels(names: string[]): Promise<void> {
    const sc = this.doc.schema.scale;
    const rows: NormalizeRow[] = [];
    for (const name of names) {
      const box = await this.models.measure(modelRef(name));
      const size: Vec3 | null = box ? [box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]] : null;
      const known = modelKey(this.doc.map, name);
      const baseScale = known ? this.doc.map.models[known].baseScale : (this.models.baseScaleOf(name) ?? 1);
      const category = this.models.categories.get(`${fileStem(name)}.glb`) ?? guessCategory(fileStem(name), sc.categories, (c) => [this.categoryName(c)]) ?? '';
      rows.push({ name, size, category, baseScale });
    }
    if (!rows.length) return;
    const res = await normalizeDialog(rows, sc, this.categoryName);
    if (!res) return;
    const used = new Set([...usedModels(this.doc.schema, this.doc.map.objects), this.doc.schema.player.model ?? ''].map((r) => fileStem(r)));
    const forMap: Array<[string, number]> = [];
    for (const r of res) {
      this.models.setBaseScale(r.name, r.baseScale, r.category);
      if (used.has(fileStem(r.name)) || modelKey(this.doc.map, r.name)) forMap.push([modelKey(this.doc.map, r.name) ?? modelRef(r.name), r.baseScale]);
    }
    if (forMap.length) this.doc.setModelBaseScales(forMap);
    void this.autosave();
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
      await writeAutosave({ schemaRaw: this.doc.schemaRaw, mapJson: mapToJson(this.doc.map), savedAt, models, stamps: this.stamps.custom(), library: this.models.libraryJson(), fileName: this.fileName });
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
    for (const tab of ['objects', 'terrain', 'list', 'library'] as LeftTab[])
      this.el.tabs.append(
        h('button', { class: this.leftTab === tab ? 'active' : '', title: t(`tab.${tab}`), onclick: () => ((this.leftTab = tab), this.renderLeft()) }, t(`tab.${tab}`)),
      );
    if (this.leftTab === 'objects') renderPalette(this.el.left, this);
    else if (this.leftTab === 'terrain') renderTerrainPanel(this.el.left, this);
    else if (this.leftTab === 'library') renderLibrary(this.el.left, this, this.thumbs, this.libraryState, this.libraryActions, () => this.renderLeft());
    else renderObjectList(this.el.left, this, this.listState, this.actions, () => this.renderLeft());
  }

  private renderToolbar(): void {
    const s = this.state;
    const tb = this.el.toolbar;
    clear(tb);
    /** Przycisk paska; `key` – skrót pokazany w dymku i małą literą w rogu. */
    const btn = (label: string, title: string, onclick: () => void, active = false, disabled = false, key?: KeyId) =>
      h(
        'button',
        { class: `${active ? 'active' : ''}${key && KEY[key].length === 1 ? ' has-key' : ''}`, title: key ? tip(title, key) : title, onclick, disabled },
        label,
        key && KEY[key].length === 1 ? h('span', { class: 'key' }, KEY[key]) : null,
      );
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
    if (this.play.active) {
      // w trybie gry tylko wyjście i ponowny start – mapa się nie zmienia
      tb.append(
        h('span', { class: 'brand' }, t('app.title')),
        h('button', { class: 'active', title: t('play.exitHint'), onclick: () => this.play.stop() }, t('play.exit')),
        h('button', { title: tip(t('play.restartHint'), 'play'), onclick: () => this.startPlay(false) }, t('play.restart')),
        h('span', { class: 'muted small' }, t('play.toolbarHint')),
        h('span', { class: 'grow' }),
        h('span', { class: 'doc-title' }, title),
      );
      return;
    }
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
        [t('menu.downloadSchema'), '', () => this.downloadSchema()],
        null,
        [t('menu.loadModels'), '', () => void this.loadModels()],
        [t('menu.downloadModels'), '', () => this.downloadModels()],
        [t('menu.exportProject'), '', () => this.exportProject()],
      ]),
      menu(t('menu.map'), [[t('menu.resize'), '', () => void this.resizeMap()]]),
      h('span', { class: 'sep' }),
      btn('↶', t('tb.undo'), () => this.doc.undo(), false, !this.doc.history.canUndo, 'undo'),
      btn('↷', t('tb.redo'), () => this.doc.redo(), false, !this.doc.history.canRedo, 'redo'),
      h('span', { class: 'sep' }),
      btn(t('tb.select'), t('tb.selectHint'), () => this.setTool('select'), false, false, 'select'),
      btn(t('tb.move'), t('tb.moveHint'), () => this.setTransform('translate'), s.tool === 'select' && s.transformMode === 'translate', false, 'translate'),
      btn(t('tb.rotate'), t('tb.rotateHint'), () => this.setTransform('rotate'), s.tool === 'select' && s.transformMode === 'rotate', false, 'rotate'),
      btn(t('tb.scale'), t('tb.scaleHint'), () => this.setTransform('scale'), s.tool === 'select' && s.transformMode === 'scale', false, 'scale'),
      h('span', { class: 'sep' }),
      btn(t('tb.sculpt'), `${t('tb.sculptHint')} (${KEY.heightTools}, ${KEY.sculpt})`, () => this.setTool('sculpt'), s.tool === 'sculpt'),
      btn(t('tb.stamp'), t('tb.stampHint'), () => this.setTool('stamp'), s.tool === 'stamp', false, 'stamp'),
      btn(t('tb.paint'), t('tb.paintHint'), () => this.setTool('paint'), s.tool === 'paint', false, 'paint'),
      h('span', { class: 'sep' }),
      btn(t('tb.place'), t('tb.placeHint'), () => this.placeLast(), s.tool === 'place' && s.placeType !== COLLISION_LINE, false, 'place'),
      btn(t('tb.lasso'), t('tb.lassoHint'), () => this.setTool('lasso'), s.tool === 'lasso', false, 'lasso'),
      btn(t('tb.line'), t('tb.lineHint'), () => this.drawCollisionLine(), s.tool === 'place' && s.placeType === COLLISION_LINE, false, 'line'),
      h('span', { class: 'sep' }),
      btn(t('tb.grid'), t('tb.gridHint'), () => ((s.snap = !s.snap), this.stateChanged()), s.snap, false, 'grid'),
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
      btn(t('tb.gameView'), t('tb.gameViewHint'), () => this.toggleGameView(), this.gameView, false, 'gameView'),
      btn(t('tb.mannequin'), t('tb.mannequinHint'), () => this.toggleMannequin(), this.mannequin.enabled, false, 'mannequin'),
      h('button', { class: 'play-btn', title: `${t('tb.playHint')} (${KEY.play}; ${KEY.playCursor} – ${t('tb.playCursor')})`, onclick: () => this.startPlay(false) }, t('tb.play')),
      h('span', { class: 'grow' }),
      h('span', { class: 'doc-title', title: this.fileName ?? '' }, title),
      h(
        'select',
        { class: 'lang', title: t('tb.language'), onchange: (e: Event) => setLang((e.target as HTMLSelectElement).value as Lang) },
        ...LANGS.map((l) => h('option', { value: l, selected: l === getLang() }, l.toUpperCase())),
      ),
      btn('?', `${t('tb.help')} (?, F1)`, () => void helpDialog()),
    );
  }
}
