// Wspólny kontekst edytora dla narzędzi i paneli.
import type { EditorDoc } from './core/doc';
import type { MapObject, Vec3 } from './core/map';
import type { Brush, HeightTool } from './core/terrain';
import type { Gizmo } from './render/gizmo';
import type { ModelLibrary } from './render/models';
import type { ObjectsView } from './render/objectsView';
import type { TerrainMesh } from './render/terrainMesh';
import type { Viewport } from './render/viewport';
import type { StampLibrary } from './tools/stamps';

export type ToolId = 'select' | 'sculpt' | 'paint' | 'place' | 'stamp';
export type TransformMode = 'translate' | 'rotate' | 'scale';

export interface EditorState {
  tool: ToolId;
  transformMode: TransformMode;
  heightTool: HeightTool;
  brush: Brush;
  paintLayer: string;
  /** Stempel: wybrany obraz, wysokość (o ile podnosi biel) i czy szary 50% oznacza „bez zmian”. */
  stamp: { id: string; height: number; midZero: boolean };
  placeType: string | null;
  snap: boolean;
  gridStep: number;
  showGrid: boolean;
  slopeOverlay: boolean;
}

export interface Ctx {
  doc: EditorDoc;
  viewport: Viewport;
  terrain: TerrainMesh;
  objects: ObjectsView;
  models: ModelLibrary;
  stamps: StampLibrary;
  gizmo: Gizmo;
  state: EditorState;
  clipboard: MapObject[];
  setTool(tool: ToolId): void;
  /** Powiadamia panele o zmianie stanu edytora (narzędzie, pędzel…). */
  stateChanged(): void;
  refreshHint(): void;
  /** Odświeża tylko kursor pędzla (bez przerysowania paneli – np. w trakcie przeciągania suwaka). */
  refreshBrush(): void;
  terrainHit(e: { clientX: number; clientY: number }): Vec3 | null;
  snap(v: Vec3): Vec3;
  toast(msg: string, kind?: 'info' | 'error'): void;
}
