// Tworzy przykładową dużą mapę do sprawdzania płynności (tryb gry, klatki na sekundę):
// docs/przyklady-map/duza-mapa.zip – projekt edytora (mapa 512 × 512 m, siatka 513 × 513, schemat przykładowy,
// modele z examples/modele). Otwórz go w edytorze: „Plik → Otwórz mapę…” albo upuść plik na okno.
// Uruchomienie: node tools/make-big-map.mjs
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { zipSync } from 'three/addons/libs/fflate.module.js';

const SIZE = 512;
const N = 513;
const cell = SIZE / (N - 1);
const schema = JSON.parse(readFileSync(new URL('../examples/schemat-przyklad.json', import.meta.url), 'utf8'));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// powtarzalny generator liczb losowych
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);

// szum wartości (gładki) do wzgórz
const hash = (i, j) => {
  const s = Math.sin(i * 127.1 + j * 311.7) * 43758.5453;
  return s - Math.floor(s);
};
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, z) {
  const i = Math.floor(x), j = Math.floor(z);
  const fx = smooth(x - i), fz = smooth(z - j);
  const a = hash(i, j), b = hash(i + 1, j), c = hash(i, j + 1), d = hash(i + 1, j + 1);
  return (a * (1 - fx) + b * fx) * (1 - fz) + (c * (1 - fx) + d * fx) * fz;
}
const fbm = (x, z) => noise(x, z) * 0.55 + noise(x * 2.1, z * 2.1) * 0.28 + noise(x * 4.3, z * 4.3) * 0.12 + noise(x * 9, z * 9) * 0.05;

// rzeka: łagodna sinusoida wzdłuż z
const riverX = (z) => SIZE * 0.5 + Math.sin(z / 70) * 60 + Math.sin(z / 23) * 10;
const riverDist = (x, z) => Math.abs(x - riverX(z));

const heights = new Float32Array(N * N);
const layerIds = schema.terrainLayers.map((l) => l.id);
const layers = Object.fromEntries(layerIds.map((id) => [id, new Uint8Array(N * N)]));
for (let j = 0; j < N; j++)
  for (let i = 0; i < N; i++) {
    const x = i * cell, z = j * cell, k = j * N + i;
    let h = fbm(x / 90, z / 90) * 26 - 4;
    // góry na północnym wschodzie (strome zbocza)
    const m = Math.max(0, 1 - Math.hypot(x - 420, z - 90) / 110);
    h += m * m * 55 * (0.7 + fbm(x / 20, z / 20) * 0.6);
    // dolina rzeki
    const rd = riverDist(x, z);
    const valley = Math.min(1, rd / 40);
    h = h * smooth(valley) + (-1.5) * (1 - smooth(valley));
    heights[k] = h;
    const w = (id, v) => (layers[id][k] = Math.max(layers[id][k], v));
    if (rd < 9) w('gleboka-woda', 255);
    else if (rd < 14) w('woda', 255);
    else if (rd < 20) w('piasek', 255);
    else w('trawa', 255);
    if (m > 0.45) w('skala', Math.min(255, Math.round((m - 0.45) * 600)));
  }
// droga ze wschodu na zachód
for (let i = 0; i < N; i++) {
  const x = i * cell;
  const zc = SIZE * 0.62 + Math.sin(x / 50) * 18;
  for (let j = 0; j < N; j++) {
    const z = j * cell;
    if (Math.abs(z - zc) < 3 && riverDist(x, z) > 14) layers.droga[j * N + i] = 255;
  }
}

const b64 = (u8) => Buffer.from(u8.buffer, u8.byteOffset, u8.byteLength).toString('base64');
const heightAt = (x, z) => {
  const fx = Math.min(Math.max(x / cell, 0), N - 1), fz = Math.min(Math.max(z / cell, 0), N - 1);
  const i = Math.min(Math.floor(fx), N - 2), j = Math.min(Math.floor(fz), N - 2);
  const tx = fx - i, tz = fz - j;
  const g = (a, b) => heights[b * N + a];
  return (g(i, j) * (1 - tx) + g(i + 1, j) * tx) * (1 - tz) + (g(i, j + 1) * (1 - tx) + g(i + 1, j + 1) * tx) * tz;
};
const r4 = (v) => Math.round(v * 10000) / 10000;

const objects = [];
let id = 0;
const obj = (type, x, z, extra = {}) => {
  const o = { id: `o${++id}`, type, name: `${type.replace(/^@/, '')}-${id}`, group: null, hidden: false, locked: false, position: [r4(x), r4(heightAt(x, z)), r4(z)], rotation: [0, 0, 0], scale: [1, 1, 1], props: {}, ...extra };
  objects.push(o);
  return o;
};
const dryLand = (x, z) => riverDist(x, z) > 22;

obj('start', SIZE * 0.3, SIZE * 0.62);
// las: 3000 drzew
const groups = [{ id: 'g-las', name: 'Las', parent: null, hidden: false, locked: false }, { id: 'g-dek', name: 'Dekoracje', parent: null, hidden: false, locked: false }, { id: 'g-kol', name: 'Kolizje', parent: null, hidden: false, locked: false }];
for (let n = 0; n < 3000; ) {
  const x = 8 + rnd() * (SIZE - 16), z = 8 + rnd() * (SIZE - 16);
  if (!dryLand(x, z) || Math.abs(z - (SIZE * 0.62 + Math.sin(x / 50) * 18)) < 6) continue;
  const s = 0.7 + rnd() * 0.8;
  obj('drzewo', x, z, { group: 'g-las', rotation: [0, r4(rnd() * 360), 0], scale: [r4(s), r4(s), r4(s)] });
  n++;
}
// kamienie i dekoracje z modelami
for (let n = 0; n < 400; n++) {
  const x = 8 + rnd() * (SIZE - 16), z = 8 + rnd() * (SIZE - 16);
  if (!dryLand(x, z)) continue;
  obj('kamien', x, z, { group: 'g-dek', rotation: [0, r4(rnd() * 360), 0] });
}
for (let n = 0; n < 300; n++) {
  const x = 8 + rnd() * (SIZE - 16), z = 8 + rnd() * (SIZE - 16);
  if (!dryLand(x, z)) continue;
  const crate = n % 3 === 0;
  obj('@decoration', x, z, { group: 'g-dek', rotation: [0, r4(rnd() * 360), 0], props: { collision: true, walkable: crate }, model: crate ? 'modele/skrzynia.glb' : 'modele/beczka.glb' });
}
// mosty nad rzeką co ~60 m (most: 3 × 0,3 × 8, skalowany na długość przejścia)
for (let z = 40; z < SIZE - 40; z += 60) {
  const x = riverX(z);
  const span = 36;
  const y = Math.max(heightAt(x - span / 2, z), heightAt(x + span / 2, z)) - 0.25;
  objects.push({ id: `o${++id}`, type: 'most', name: `most-${id}`, group: null, hidden: false, locked: false, position: [r4(x), r4(y), r4(z)], rotation: [0, 90, 0], scale: [1, 1, r4(span / 8)], props: {} });
}
// kolizje: lasso wokół skał, linie wzdłuż brzegów klifów, ściany
for (let n = 0; n < 40; n++) {
  const cx = 30 + rnd() * (SIZE - 60), cz = 30 + rnd() * (SIZE - 60);
  if (!dryLand(cx, cz)) continue;
  const pts = [];
  const r = 3 + rnd() * 5;
  for (let k = 0; k < 10; k++) {
    const a = (k / 10) * Math.PI * 2;
    const rr = r * (0.7 + rnd() * 0.5);
    const x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
    pts.push([r4(x), r4(heightAt(x, z)), r4(z)]);
  }
  objects.push({ id: `o${++id}`, type: '@collision-zone', name: `collision-zone-${id}`, group: 'g-kol', hidden: false, locked: false, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], points: pts, props: {} });
}
for (let n = 0; n < 40; n++) {
  const x0 = 20 + rnd() * (SIZE - 40), z0 = 20 + rnd() * (SIZE - 40);
  const pts = [];
  for (let k = 0; k < 5; k++) {
    const x = Math.min(SIZE - 1, x0 + k * 4), z = Math.min(SIZE - 1, z0 + Math.sin(k) * 3);
    pts.push([r4(x), r4(heightAt(x, z)), r4(z)]);
  }
  objects.push({ id: `o${++id}`, type: '@collision-line', name: `collision-line-${id}`, group: 'g-kol', hidden: false, locked: false, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], points: pts, props: { width: 1 } });
}
for (let n = 0; n < 60; n++) {
  const x = 10 + rnd() * (SIZE - 20), z = 10 + rnd() * (SIZE - 20);
  if (!dryLand(x, z)) continue;
  obj('sciana', x, z, { group: 'g-kol', rotation: [0, r4(rnd() * 180), 0], scale: [r4(1 + rnd() * 2), 1, 1] });
}
// rozgrywka: generatory z obszarami, trasy
for (let n = 0; n < 50; n++) {
  const x = 20 + rnd() * (SIZE - 40), z = 20 + rnd() * (SIZE - 40);
  if (!dryLand(x, z)) continue;
  const zone = { id: `o${++id}`, type: 'obszar', name: `obszar-${id}`, group: null, hidden: false, locked: false, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], points: [[x - 8, 0, z - 8], [x + 8, 0, z - 8], [x + 8, 0, z + 8], [x - 8, 0, z + 8]].map(([a, , b]) => [r4(a), r4(heightAt(a, b)), r4(b)]), props: { nazwa: `Obszar ${n + 1}` } };
  objects.push(zone);
  obj('generator', x, z, { props: { nazwa: `Gniazdo ${n + 1}`, liczba: 3, rodzaj: n % 10 === 0 ? 'boss' : 'zwykly', aktywny: true, kolor: '#ffcc00', obszar: zone.id } });
}
for (let n = 0; n < 10; n++) {
  const pts = [];
  const x0 = 30 + rnd() * (SIZE - 160), z0 = 30 + rnd() * (SIZE - 60);
  for (let k = 0; k < 8; k++) {
    const x = x0 + k * 15, z = z0 + Math.sin(k * 0.8) * 10;
    pts.push([r4(x), r4(heightAt(x, z)), r4(z)]);
  }
  objects.push({ id: `o${++id}`, type: 'trasa', name: `trasa-${id}`, group: null, hidden: false, locked: false, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], points: pts, props: { predkosc: 2, petla: false } });
}

const map = {
  format: 'edytor-map',
  formatVersion: 5,
  editorVersion: pkg.version,
  schema: { id: schema.id, version: schema.version },
  settings: { name: 'Duża mapa (test płynności)', size: [SIZE, SIZE], resolution: [N, N], waterLevel: schema.mapDefaults.waterLevel, slope: { enabled: true, maxDeg: 40 } },
  terrain: { resolution: [N, N], encoding: 'base64', heights: b64(new Uint8Array(heights.buffer)), layers: Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, b64(v)])) },
  groups,
  objects,
  models: {},
};

const enc = new TextEncoder();
const modelsDir = new URL('../examples/modele/', import.meta.url);
const files = {
  'mapa.json': enc.encode(JSON.stringify(map)),
  'schemat.json': enc.encode(JSON.stringify(schema, null, 2)),
  'biblioteka.json': enc.encode(JSON.stringify({ models: readdirSync(modelsDir).map((f) => ({ file: f, folder: 'Przykłady' })) }, null, 2)),
};
for (const f of readdirSync(modelsDir)) files[`modele/${f}`] = new Uint8Array(readFileSync(new URL(f, modelsDir)));
const out = new URL('../docs/przyklady-map/', import.meta.url);
mkdirSync(out, { recursive: true });
writeFileSync(new URL('duza-mapa.zip', out), zipSync(files, { level: 9 }));
console.log(`Zapisano docs/przyklady-map/duza-mapa.zip: ${objects.length} obiektów, teren ${N} × ${N}`);
