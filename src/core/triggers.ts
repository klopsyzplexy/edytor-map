// Zachowania typów w trybie gry (ze schematu, uniwersalne): przejścia i strefy z komunikatem.
// Czyste funkcje, bez DOM i Three.js (testy w tests/triggers.test.ts).
//
// - przejście (`behavior.type = "teleport"`): wejście postaci w obiekt przenosi ją do obiektu wskazanego
//   właściwością `target`. Obiekt docelowy, który sam jest przejściem, nie odsyła postaci z powrotem: przejście
//   działa ponownie dopiero, gdy postać z niego wyjdzie;
// - strefa z komunikatem (`behavior.type = "message"`): wejście i wyjście pokazuje tekst z właściwości `text`.
import { convexHull, distToSegment, objectFootprints, pointInPolygon, solidFootprint, type ModelBoundsProvider, type ModelOutlineProvider } from './collision';
import { objectCenter, type MapData, type MapObject, type Vec3 } from './map';
import { round } from './math';
import { getType, type Schema } from './schema';

export interface Trigger {
  objectId: string;
  kind: 'teleport' | 'message';
  /** Obrys na ziemi (x, z): strefa – jej wielokąt, punkt i bryła – obrys widziany z góry. */
  shape: Array<[number, number]>;
  /** Przejście: id obiektu docelowego (null – brak celu). */
  target: string | null;
  /** Strefa z komunikatem: tekst (pusty – nazwa obiektu). */
  text: string;
}

/** Wszystkie przejścia i strefy z komunikatem w mapie. */
export function buildTriggers(schema: Schema, map: MapData, bounds?: ModelBoundsProvider, outline?: ModelOutlineProvider): Trigger[] {
  const out: Trigger[] = [];
  for (const o of map.objects) {
    const t = getType(schema, o.type);
    const b = t?.behavior;
    if (!t || !b) continue;
    let shape: Array<[number, number]>;
    if (t.kind === 'zone') shape = o.points.map((p) => [round(p[0]), round(p[2])]);
    else if (t.kind === 'path') continue;
    else {
      // obrys z kształtu modelu (wszystkie części razem – otoczka) albo kształt bryły
      const fp = objectFootprints(schema, t, o, map, bounds, outline).polygons;
      shape = fp.length === 1 ? fp[0] : fp.length ? convexHull(fp.flat()) : solidFootprint(t, o, bounds, schema, map);
    }
    if (shape.length < 3) continue;
    if (b.type === 'teleport') {
      const v = o.props[b.target];
      const target = typeof v === 'string' && v && map.objects.some((x) => x.id === v) ? v : null;
      out.push({ objectId: o.id, kind: 'teleport', shape, target, text: '' });
    } else {
      const v = o.props[b.text];
      const text = v === null || v === undefined || v === '' ? o.name : String(v);
      out.push({ objectId: o.id, kind: 'message', shape, target: null, text });
    }
  }
  return out;
}

/**
 * Czy postać (koło o promieniu `r`) jest w wyzwalaczu. Przejście działa już przy dotknięciu (obiekt może mieć
 * kolizję, więc postać nie wejdzie do środka), strefa z komunikatem – gdy środek postaci jest w strefie.
 */
export function inTrigger(tr: Trigger, x: number, z: number, r: number): boolean {
  if (pointInPolygon(x, z, tr.shape)) return true;
  if (tr.kind !== 'teleport') return false;
  const s = tr.shape;
  const reach = r + 0.05;
  for (let k = 0; k < s.length; k++) {
    const a = s[k];
    const b = s[(k + 1) % s.length];
    if (distToSegment(x, z, a[0], a[1], b[0], b[1]) <= reach) return true;
  }
  return false;
}

/** Punkt docelowy przejścia: położenie obiektu (strefa, ścieżka – środek wierzchołków). */
export function targetPoint(map: MapData, targetId: string): Vec3 | null {
  const o: MapObject | undefined = map.objects.find((x) => x.id === targetId);
  return o ? objectCenter(o) : null;
}

export type TriggerEvent =
  | { type: 'teleport'; trigger: Trigger; to: Vec3 }
  | { type: 'noTarget'; trigger: Trigger }
  | { type: 'enter'; trigger: Trigger }
  | { type: 'leave'; trigger: Trigger };

/** Wyzwalacze, w których postać stoi (zdarzenia przy zmianie). */
export class TriggerState {
  inside = new Set<string>();

  constructor(
    private triggers: Trigger[],
    private map: MapData,
  ) {}

  /**
   * Ruch postaci do (x, z). Zwraca zdarzenia: wejście i wyjście ze stref z komunikatem, przejście do celu
   * (najwyżej jedno) albo przejście bez celu. `arrived` – postać właśnie przeniesiona przez przejście: przejścia
   * w miejscu docelowym są zapamiętane bez działania (zadziałają po wyjściu i ponownym wejściu).
   */
  update(x: number, z: number, r: number, arrived = false): TriggerEvent[] {
    const ev: TriggerEvent[] = [];
    let jumped = false;
    for (const tr of this.triggers) {
      const now = inTrigger(tr, x, z, r);
      const was = this.inside.has(tr.objectId);
      if (now === was) continue;
      if (now) this.inside.add(tr.objectId);
      else this.inside.delete(tr.objectId);
      if (tr.kind === 'message') ev.push({ type: now ? 'enter' : 'leave', trigger: tr });
      else if (now && !arrived && !jumped) {
        const to = tr.target ? targetPoint(this.map, tr.target) : null;
        if (to) {
          ev.push({ type: 'teleport', trigger: tr, to });
          jumped = true;
        } else ev.push({ type: 'noTarget', trigger: tr });
      }
    }
    return ev;
  }

  /** Teksty stref z komunikatem, w których stoi postać. */
  messages(): Trigger[] {
    return this.triggers.filter((t) => t.kind === 'message' && this.inside.has(t.objectId));
  }
}

/** Strefy (każdego typu poza kolizjami rysowanymi), w których leży punkt – do panelu trybu gry. */
export function zonesAt(schema: Schema, map: MapData, x: number, z: number): MapObject[] {
  return map.objects.filter((o) => {
    if (o.type.startsWith('@') || o.points.length < 3) return false;
    const t = getType(schema, o.type);
    return t?.kind === 'zone' && pointInPolygon(x, z, o.points.map((p) => [p[0], p[2]] as [number, number]));
  });
}
