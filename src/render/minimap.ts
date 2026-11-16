// Minimapa w rogu widoku: cała mapa z góry (kolory warstw i cieniowanie), obiekty jako kropki,
// czworokąt widoku kamery. Kliknięcie albo przeciągnięcie przenosi kamerę.
import type { EditorDoc } from '../core/doc';
import { heightAt, objectCenter } from '../core/map';
import { getType } from '../core/schema';
import type { Viewport } from './viewport';

const MAX_PX = 180;

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export class Minimap {
  readonly el: HTMLDivElement;
  private canvas: HTMLCanvasElement;
  private base: HTMLCanvasElement;
  private dirty = true;
  private dragging = false;
  private w = 1;
  private h = 1;

  constructor(
    private doc: () => EditorDoc,
    private viewport: Viewport,
    title: string,
  ) {
    this.el = document.createElement('div');
    this.el.className = 'minimap';
    this.el.title = title;
    this.canvas = document.createElement('canvas');
    this.base = document.createElement('canvas');
    this.el.appendChild(this.canvas);
    const go = (e: PointerEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const [mw, md] = this.doc().map.settings.size;
      const x = Math.min(Math.max(((e.clientX - r.left) / r.width) * mw, 0), mw);
      const z = Math.min(Math.max(((e.clientY - r.top) / r.height) * md, 0), md);
      this.viewport.lookAtPoint(x, heightAt(this.doc().map, x, z), z);
    };
    this.canvas.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      this.canvas.setPointerCapture(e.pointerId);
      go(e);
    });
    this.canvas.addEventListener('pointermove', (e) => this.dragging && go(e));
    this.canvas.addEventListener('pointerup', () => (this.dragging = false));
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  setTitle(title: string): void {
    this.el.title = title;
  }

  /** Teren lub obiekty się zmieniły – obraz tła zostanie przeliczony (nie częściej niż co klatkę). */
  invalidate(): void {
    this.dirty = true;
  }

  private rebuild(): void {
    this.dirty = false;
    const d = this.doc();
    const { map, schema } = d;
    const [mw, md] = map.settings.size;
    const s = MAX_PX / Math.max(mw, md);
    this.w = Math.max(16, Math.round(mw * s));
    this.h = Math.max(16, Math.round(md * s));
    for (const c of [this.canvas, this.base]) {
      c.width = this.w;
      c.height = this.h;
    }
    const g = this.base.getContext('2d')!;
    const img = g.createImageData(this.w, this.h);
    const { nx, nz, heights, layers } = map.terrain;
    const cols = schema.terrainLayers.map((l) => ({ w: layers[l.id], c: hexRgb(l.color) })).filter((l) => l.w);
    const [cx, cz] = [mw / (nx - 1), md / (nz - 1)];
    for (let py = 0; py < this.h; py++)
      for (let px = 0; px < this.w; px++) {
        const i = Math.min(nx - 1, Math.round(((px + 0.5) / this.w) * (nx - 1)));
        const j = Math.min(nz - 1, Math.round(((py + 0.5) / this.h) * (nz - 1)));
        const k = j * nx + i;
        let r = 0;
        let gg = 0;
        let b = 0;
        let tot = 0;
        for (const l of cols) {
          const wt = l.w[k];
          r += l.c[0] * wt;
          gg += l.c[1] * wt;
          b += l.c[2] * wt;
          tot += wt;
        }
        if (tot > 0) {
          r /= tot;
          gg /= tot;
          b /= tot;
        } else [r, gg, b] = cols[0]?.c ?? [128, 128, 128];
        // cieniowanie od światła z lewej-góry
        const hl = heights[j * nx + Math.max(0, i - 1)];
        const hu = heights[Math.max(0, j - 1) * nx + i];
        const shade = Math.min(1.35, Math.max(0.55, 1 + ((heights[k] - hl) / cx + (heights[k] - hu) / cz) * 0.6));
        const o = (py * this.w + px) * 4;
        img.data[o] = r * shade;
        img.data[o + 1] = gg * shade;
        img.data[o + 2] = b * shade;
        img.data[o + 3] = 255;
      }
    g.putImageData(img, 0, 0);
    // obiekty
    for (const o of map.objects) {
      if (!d.isVisible(o)) continue;
      const t = getType(schema, o.type);
      g.fillStyle = t?.look.color ?? '#ff00ff';
      g.strokeStyle = g.fillStyle;
      if (o.points.length >= 2) {
        g.beginPath();
        o.points.forEach((p, n) => (n ? g.lineTo((p[0] / mw) * this.w, (p[2] / md) * this.h) : g.moveTo((p[0] / mw) * this.w, (p[2] / md) * this.h)));
        if (t?.kind === 'zone' || o.type.startsWith('@')) g.closePath();
        g.lineWidth = 1;
        g.stroke();
      } else {
        const c = objectCenter(o);
        g.fillRect((c[0] / mw) * this.w - 1.5, (c[2] / md) * this.h - 1.5, 3, 3);
      }
    }
  }

  /** Rysowanie co klatkę: tło + czworokąt widoku. */
  tick(): void {
    if (this.el.offsetParent === null) return;
    if (this.dirty) this.rebuild();
    const g = this.canvas.getContext('2d')!;
    g.clearRect(0, 0, this.w, this.h);
    g.drawImage(this.base, 0, 0);
    const [mw, md] = this.doc().map.settings.size;
    const fp = this.viewport.footprint();
    g.beginPath();
    fp.forEach(([x, z], n) => (n ? g.lineTo((x / mw) * this.w, (z / md) * this.h) : g.moveTo((x / mw) * this.w, (z / md) * this.h)));
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fill();
    g.strokeStyle = '#ffd000';
    g.lineWidth = 1.5;
    g.stroke();
    const t = this.viewport.controls.target;
    g.fillStyle = '#ffd000';
    g.fillRect((t.x / mw) * this.w - 2, (t.z / md) * this.h - 2, 4, 4);
  }
}
