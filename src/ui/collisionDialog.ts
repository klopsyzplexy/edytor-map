// Okno „Obrys kolizji” modelu z biblioteki: podgląd z góry (przekrój modelu na wysokości postaci i obrys),
// suwak poziomu szczegółu, ręczna poprawka wierzchołków i własny, narysowany kształt.
// Obliczenia w core/modelCollision.ts; tutaj tylko płótno i obsługa myszy.
import {
  DEFAULT_DETAIL,
  insertVertex,
  nearestEdge,
  nearestVertex,
  outlineStats,
  removeVertex,
  sliceBand,
  type ModelCollision,
  type Outline,
  type Pt,
  type VertexRef,
} from '../core/modelCollision';
import { t } from '../i18n';
import { modal } from './dialogs';
import { h } from './dom';
import { formatNum } from './units';

export interface CollisionDialogInput {
  /** Nazwa modelu (do tytułu). */
  name: string;
  /** Trójkąty modelu w jego układzie (x, y, z × 3). */
  tris: Float32Array;
  /** Pasmo przekroju w układzie modelu (od podstawy do wysokości postaci). */
  band: [number, number];
  /** Metry na jednostkę modelu (skala bazowa / przelicznik świata) – do podziałki. */
  metersPerUnit: number;
  /** Promień postaci w jednostkach modelu (kółko dla porównania). */
  playerRadius: number;
  /** Obecne ustawienia obrysu. */
  current: ModelCollision | undefined;
  /** Obrys z kształtu modelu dla poziomu szczegółu. */
  auto: (detail: number) => Outline;
}

type Mode = 'model' | 'edited' | 'drawn';
const W = 640;
const H = 360;
const HANDLE = 6;

/** Wynik: nowe ustawienia (undefined – obrys z modelu z domyślnym szczegółem) albo null (anulowano). */
export async function collisionDialog(d: CollisionDialogInput): Promise<{ collision: ModelCollision | undefined } | null> {
  let detail = d.current?.detail ?? DEFAULT_DETAIL;
  let mode: Mode = d.current?.polygons?.length ? (d.current.source === 'drawn' ? 'drawn' : 'edited') : 'model';
  let polys: Outline = d.current?.polygons?.map((p) => p.map((q) => [...q] as Pt)) ?? [];
  /** Narysowany wielokąt w trakcie (jeszcze niezamknięty). */
  let open: Pt[] = [];
  let selected: VertexRef | null = null;
  let drag: VertexRef | null = null;

  // ---------- widok: dopasowanie modelu do płótna ----------
  const all: Pt[] = [];
  for (let k = 0; k + 2 < d.tris.length; k += 3) all.push([d.tris[k], d.tris[k + 2]]);
  const pieces = sliceBand(d.tris, d.band[0], d.band[1]);
  let x0 = Infinity;
  let x1 = -Infinity;
  let z0 = Infinity;
  let z1 = -Infinity;
  for (const [x, z] of all) {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    z0 = Math.min(z0, z);
    z1 = Math.max(z1, z);
  }
  if (!Number.isFinite(x0)) (x0 = -1), (x1 = 1), (z0 = -1), (z1 = 1);
  const scale = Math.min((W - 60) / Math.max(x1 - x0, 1e-3), (H - 60) / Math.max(z1 - z0, 1e-3));
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const toScreen = ([x, z]: Pt): Pt => [W / 2 + (x - cx) * scale, H / 2 + (z - cz) * scale];
  const r4 = (v: number) => Math.round(v * 1e4) / 1e4;
  const toModel = (sx: number, sy: number): Pt => [r4(cx + (sx - W / 2) / scale), r4(cz + (sy - H / 2) / scale)];

  const canvas = h('canvas', { width: W, height: H, class: 'collision-canvas' }) as HTMLCanvasElement;
  const g = canvas.getContext('2d')!;
  // tło (cały model z góry i przekrój) rysujemy raz
  const bg = document.createElement('canvas');
  bg.width = W;
  bg.height = H;
  {
    const b = bg.getContext('2d')!;
    const css = getComputedStyle(document.documentElement);
    b.fillStyle = css.getPropertyValue('--bg').trim() || '#1b1e24';
    b.fillRect(0, 0, W, H);
    // podziałka: kratka o „ładnej” długości w metrach
    const target = 60 / scale;
    const meters = target * d.metersPerUnit;
    const step = [0.1, 0.2, 0.25, 0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((s) => s >= meters) ?? 100;
    const unit = step / (d.metersPerUnit || 1);
    b.strokeStyle = '#ffffff14';
    b.lineWidth = 1;
    for (let gx = Math.floor(toModel(0, 0)[0] / unit) * unit; toScreen([gx, 0])[0] < W; gx += unit) {
      const sx = Math.round(toScreen([gx, 0])[0]) + 0.5;
      b.beginPath();
      b.moveTo(sx, 0);
      b.lineTo(sx, H);
      b.stroke();
    }
    for (let gz = Math.floor(toModel(0, 0)[1] / unit) * unit; toScreen([0, gz])[1] < H; gz += unit) {
      const sy = Math.round(toScreen([0, gz])[1]) + 0.5;
      b.beginPath();
      b.moveTo(0, sy);
      b.lineTo(W, sy);
      b.stroke();
    }
    const tri = (color: string, src: Pt[][]) => {
      b.fillStyle = color;
      b.strokeStyle = color;
      for (const p of src) {
        b.beginPath();
        p.forEach((q, i) => {
          const [sx, sy] = toScreen(q);
          if (i) b.lineTo(sx, sy);
          else b.moveTo(sx, sy);
        });
        b.closePath();
        b.fill();
        b.stroke();
      }
    };
    // cały model (blado) i przekrój na wysokości postaci (jaśniej)
    const full: Pt[][] = [];
    for (let k = 0; k + 2 < all.length; k += 3) full.push([all[k], all[k + 1], all[k + 2]]);
    tri('#8a93a522', full);
    tri('#c8ced9aa', pieces);
    // postać dla porównania (lewy dolny róg)
    const r = d.playerRadius * scale;
    if (r > 2) {
      b.strokeStyle = '#4f9cffcc';
      b.setLineDash([4, 3]);
      b.lineWidth = 2;
      b.beginPath();
      b.arc(8 + r, H - 8 - r, r, 0, Math.PI * 2);
      b.stroke();
      b.setLineDash([]);
    }
    b.fillStyle = '#c8ced9';
    b.font = '12px sans-serif';
    b.fillText(t('coll.grid', { m: formatNum(step) }), W - 120, H - 10);
  }

  const outline = (): Outline => (mode === 'model' ? d.auto(detail) : polys);

  const redraw = () => {
    g.drawImage(bg, 0, 0);
    const o = outline();
    g.lineWidth = 2;
    for (const p of o) {
      g.beginPath();
      p.forEach((q, i) => {
        const [sx, sy] = toScreen(q);
        if (i) g.lineTo(sx, sy);
        else g.moveTo(sx, sy);
      });
      g.closePath();
      g.fillStyle = '#e040fb44';
      g.strokeStyle = '#e040fb';
      g.fill();
      g.stroke();
    }
    if (mode !== 'model') {
      o.forEach((p, pi) =>
        p.forEach((q, i) => {
          const [sx, sy] = toScreen(q);
          const sel = selected?.poly === pi && selected.idx === i;
          g.fillStyle = sel ? '#ff4040' : '#ffffff';
          g.fillRect(sx - HANDLE / 2, sy - HANDLE / 2, HANDLE, HANDLE);
        }),
      );
      if (open.length) {
        g.strokeStyle = '#ffd000';
        g.beginPath();
        open.forEach((q, i) => {
          const [sx, sy] = toScreen(q);
          if (i) g.lineTo(sx, sy);
          else g.moveTo(sx, sy);
        });
        g.stroke();
        for (const q of open) {
          const [sx, sy] = toScreen(q);
          g.fillStyle = '#ffd000';
          g.fillRect(sx - HANDLE / 2, sy - HANDLE / 2, HANDLE, HANDLE);
        }
      }
    }
    const s = outlineStats(o);
    stats.textContent = s.parts ? t('coll.stats', { parts: s.parts, n: s.vertices }) : t('coll.empty');
  };

  // ---------- sterowanie ----------
  const stats = h('span', { class: 'muted small' });
  const detailInput = h('input', { type: 'range', min: 0, max: 1, step: 0.05, value: detail, class: 'grow' }) as HTMLInputElement;
  const detailValue = h('span', { class: 'small' }, formatNum(detail));
  detailInput.addEventListener('input', () => {
    detail = Number(detailInput.value);
    detailValue.textContent = formatNum(detail);
    redraw();
  });
  const hint = h('p', { class: 'muted small' });
  const radios = (['model', 'edited', 'drawn'] as Mode[]).map((m) =>
    h('label', { class: 'check' }, h('input', { type: 'radio', name: 'coll-mode', value: m, checked: mode === m, onchange: () => setMode(m) }), ' ', t(`coll.mode.${m}`)),
  );
  const fromModelBtn = h('button', { onclick: () => ((polys = d.auto(detail).map((p) => p.map((q) => [...q] as Pt))), (selected = null), redraw()) }, t('coll.fromModel'));
  const clearBtn = h('button', { onclick: () => ((polys = []), (open = []), (selected = null), redraw()) }, t('coll.clear'));
  const closeBtn = h('button', { onclick: () => closeOpen() }, t('coll.closeShape'));
  const delBtn = h('button', { onclick: () => deleteSelected() }, t('coll.deleteVertex'));
  const tools = h('div', { class: 'list-buttons' }, fromModelBtn, clearBtn, closeBtn, delBtn);

  const setMode = (m: Mode) => {
    if (m !== mode) {
      // poprawka zaczyna się od obrysu z modelu, rysowanie (z widoku obrysu z modelu) – od pustego płótna
      if (m === 'edited' && !polys.length) polys = d.auto(detail).map((p) => p.map((q) => [...q] as Pt));
      if (m === 'drawn' && mode === 'model') polys = [];
    }
    mode = m;
    open = [];
    selected = null;
    hint.textContent = t(`coll.hint.${m}`);
    tools.style.display = m === 'model' ? 'none' : '';
    closeBtn.style.display = m === 'drawn' ? '' : 'none';
    redraw();
  };

  const closeOpen = () => {
    if (open.length >= 3) polys = [...polys, open];
    open = [];
    redraw();
  };
  const deleteSelected = () => {
    if (!selected) return;
    polys = removeVertex(polys, selected);
    selected = null;
    redraw();
  };

  const pos = (e: MouseEvent): [number, number] => {
    const r = canvas.getBoundingClientRect();
    return [((e.clientX - r.left) * W) / r.width, ((e.clientY - r.top) * H) / r.height];
  };
  const pickR = (HANDLE + 4) / scale;
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  canvas.addEventListener('mousedown', (e) => {
    if (mode === 'model') return;
    const p = toModel(...pos(e));
    const v = nearestVertex(polys, p, pickR);
    if (e.button === 2) {
      // prawy przycisk – usuń wierzchołek
      if (v) {
        polys = removeVertex(polys, v);
        selected = null;
        redraw();
      }
      return;
    }
    if (v) {
      selected = v;
      drag = v;
      redraw();
      return;
    }
    if (mode === 'drawn') {
      // klik przy pierwszym punkcie zamyka kształt
      if (open.length >= 3 && Math.hypot(open[0][0] - p[0], open[0][1] - p[1]) <= pickR) closeOpen();
      else open.push(p);
      redraw();
    }
  });
  canvas.addEventListener('dblclick', (e) => {
    if (mode === 'model') return;
    const p = toModel(...pos(e));
    if (nearestVertex(polys, p, pickR)) return;
    const edge = nearestEdge(polys, p, pickR * 1.5);
    if (edge) {
      polys = insertVertex(polys, edge, p);
      selected = { poly: edge.poly, idx: edge.idx + 1 };
      redraw();
    }
  });
  const onMove = (e: MouseEvent) => {
    if (!drag) return;
    const p = toModel(...pos(e));
    polys = polys.map((poly, pi) => (pi === drag!.poly ? poly.map((q, i) => (i === drag!.idx ? p : q)) : poly));
    redraw();
  };
  const onUp = () => (drag = null);
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'Delete' || e.key === 'Backspace') && selected && !(e.target instanceof HTMLInputElement)) {
      e.preventDefault();
      deleteSelected();
    }
  };
  window.addEventListener('mousemove', onMove);
  window.addEventListener('mouseup', onUp);
  document.addEventListener('keydown', onKey);

  const body = h(
    'div',
    { class: 'form collision-dialog' },
    h('p', { class: 'muted small' }, t('coll.intro')),
    canvas,
    h('div', { class: 'row-inline' }, ...radios),
    h('div', { class: 'row-inline' }, h('span', { class: 'small' }, t('coll.detail')), detailInput, detailValue),
    h('div', { class: 'row-inline' }, stats),
    tools,
    hint,
  );
  setMode(mode);
  const v = await modal(t('coll.title', { name: d.name.replace(/\.glb$/i, '') }), body, [
    { label: t('btn.cancel'), value: 'no' },
    { label: t('coll.reset'), value: 'reset' },
    { label: t('coll.save'), primary: true, value: 'ok' },
  ], true);
  window.removeEventListener('mousemove', onMove);
  window.removeEventListener('mouseup', onUp);
  document.removeEventListener('keydown', onKey);
  if (v === 'reset') return { collision: undefined };
  if (v !== 'ok') return null;
  if (mode === 'model' || !polys.length) return { collision: detail === DEFAULT_DETAIL ? undefined : { detail } };
  return { collision: { detail, polygons: polys, source: mode === 'drawn' ? 'drawn' : 'edited' } };
}
