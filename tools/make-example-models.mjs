// Tworzy przykładowe modele do biblioteki i trybu gry:
//  - examples/modele/postac.glb – prosta postać (1,8 m, przodem do +Z) z animacjami „stoi” i „idzie”,
//  - examples/modele/beczka.glb – beczka (dekoracja z kolizją),
//  - examples/modele/skrzynia.glb – skrzynia z górną ścianą „walkable_top” (można na niej stanąć),
//  - examples/modele/skaly.glb – dwie nieregularne skały (dwie części, druga obrócona w węźle),
//  - examples/modele/plot.glb – płot w kształcie litery L (słupki i żerdzie, obrys wklęsły),
//  - examples/modele/drzewo.glb – drzewo: cienki pień, szeroka korona nad głową postaci,
//  - examples/modele/lampa.glb – lampa z własną, niewidoczną siatką kolizji „UCX_lampa”.
// Uruchomienie: node tools/make-example-models.mjs
import { writeFileSync } from 'node:fs';

/** Prostopadłościan o środku (cx, cy, cz) i wymiarach (sx, sy, sz). */
function box(cx, cy, cz, sx, sy, sz) {
  const x = sx / 2, y = sy / 2, z = sz / 2;
  const faces = [
    [[1, 0, 0], [[x, -y, -z], [x, y, -z], [x, y, z], [x, -y, z]]],
    [[-1, 0, 0], [[-x, -y, z], [-x, y, z], [-x, y, -z], [-x, -y, -z]]],
    [[0, 1, 0], [[-x, y, -z], [-x, y, z], [x, y, z], [x, y, -z]]],
    [[0, -1, 0], [[-x, -y, z], [-x, -y, -z], [x, -y, -z], [x, -y, z]]],
    [[0, 0, 1], [[x, -y, z], [x, y, z], [-x, y, z], [-x, -y, z]]],
    [[0, 0, -1], [[-x, -y, -z], [-x, y, -z], [x, y, -z], [x, -y, -z]]],
  ];
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, vs], f) => {
    for (const v of vs) { pos.push(v[0] + cx, v[1] + cy, v[2] + cz); nor.push(...n); }
    const b = f * 4;
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  });
  return { pos, nor, idx };
}

/** Walec (beczka) z lekkim wybrzuszeniem: `seg` boków, `rings` pierścieni. */
function barrel(r, h, seg = 20, rings = 6) {
  const pos = [], nor = [], idx = [];
  for (let k = 0; k <= rings; k++) {
    const t = k / rings;
    const rr = r * (0.88 + 0.12 * Math.sin(Math.PI * t));
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * rr, t * h, Math.sin(a) * rr);
      nor.push(Math.cos(a), 0, Math.sin(a));
    }
  }
  for (let k = 0; k < rings; k++) for (let s = 0; s < seg; s++) {
    const a = k * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, b, a + 1, a + 1, b, b + 1);
  }
  // denka
  for (const [y, ny] of [[0, -1], [h, 1]]) {
    const c = pos.length / 3;
    pos.push(0, y, 0); nor.push(0, ny, 0);
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      pos.push(Math.cos(a) * r * 0.88, y, Math.sin(a) * r * 0.88); nor.push(0, ny, 0);
    }
    for (let s = 0; s < seg; s++) ny > 0 ? idx.push(c, c + s + 2, c + s + 1) : idx.push(c, c + s + 1, c + s + 2);
  }
  return { pos, nor, idx };
}

function merge(...gs) {
  const out = { pos: [], nor: [], idx: [] };
  for (const g of gs) {
    const base = out.pos.length / 3;
    out.pos.push(...g.pos); out.nor.push(...g.nor); out.idx.push(...g.idx.map((i) => i + base));
  }
  return out;
}

/** Zapisuje plik .glb: `parts` – siatki (nazwa, kolor, geometria), `nodes` – drzewo węzłów, `animations` – klipy. */
function writeGlb(file, { parts, nodes, roots, animations = [] }) {
  const chunks = [];
  let offset = 0;
  const bufferViews = [], accessors = [], meshes = [], materials = [];
  const addView = (arr, target) => {
    const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
    const pad = (4 - (bytes.length % 4)) % 4;
    chunks.push(bytes, Buffer.alloc(pad));
    bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, ...(target ? { target } : {}) });
    offset += bytes.length + pad;
    return bufferViews.length - 1;
  };
  const accessor = (arr, type, componentType, extra = {}, target) => {
    accessors.push({ bufferView: addView(arr, target), componentType, count: arr.length / { SCALAR: 1, VEC3: 3, VEC4: 4 }[type], type, ...extra });
    return accessors.length - 1;
  };
  parts.forEach((p, i) => {
    const pos = new Float32Array(p.geo.pos);
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let k = 0; k < pos.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], pos[k + a]); max[a] = Math.max(max[a], pos[k + a]); }
    const ap = accessor(pos, 'VEC3', 5126, { min, max }, 34962);
    const an = accessor(new Float32Array(p.geo.nor), 'VEC3', 5126, {}, 34962);
    const ai = accessor(new Uint16Array(p.geo.idx), 'SCALAR', 5123, {}, 34963);
    materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: p.color, metallicFactor: 0, roughnessFactor: 0.85 } });
    meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: ap, NORMAL: an }, indices: ai, material: i }] });
  });
  const anims = animations.map((a) => {
    const samplers = [], channels = [];
    for (const c of a.channels) {
      const input = accessor(new Float32Array(c.times), 'SCALAR', 5126, { min: [Math.min(...c.times)], max: [Math.max(...c.times)] });
      const output = accessor(new Float32Array(c.values.flat()), c.path === 'rotation' ? 'VEC4' : 'VEC3', 5126);
      samplers.push({ input, output, interpolation: 'LINEAR' });
      channels.push({ sampler: samplers.length - 1, target: { node: c.node, path: c.path } });
    }
    return { name: a.name, samplers, channels };
  });
  const bin = Buffer.concat(chunks);
  const gltf = {
    asset: { version: '2.0', generator: 'edytor-map/tools/make-example-models.mjs' },
    scene: 0,
    scenes: [{ nodes: roots }],
    nodes, meshes, materials, accessors, bufferViews,
    ...(anims.length ? { animations: anims } : {}),
    buffers: [{ byteLength: bin.length }],
  };
  let json = Buffer.from(JSON.stringify(gltf));
  json = Buffer.concat([json, Buffer.alloc((4 - (json.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + json.length + 8 + bin.length, 8);
  const jh = Buffer.alloc(8); jh.writeUInt32LE(json.length, 0); jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8); bh.writeUInt32LE(bin.length, 0); bh.writeUInt32LE(0x004e4942, 4);
  writeFileSync(new URL(`../examples/modele/${file}`, import.meta.url), Buffer.concat([header, jh, json, bh, bin]));
  console.log(`Zapisano examples/modele/${file}`);
}

/** Kwaternion obrotu wokół osi X o kąt w stopniach. */
const qx = (deg) => [Math.sin((deg * Math.PI) / 360), 0, 0, Math.cos((deg * Math.PI) / 360)];

// ---------- postać ----------
// Węzły kończyn mają punkt obrotu w biodrze / barku; siatka zwisa w dół od tego punktu.
const skin = [0.93, 0.76, 0.6, 1], shirt = [0.2, 0.45, 0.8, 1], pants = [0.25, 0.25, 0.32, 1];
const parts = [
  { name: 'tulow', color: shirt, geo: box(0, 0, 0, 0.5, 0.6, 0.28) },
  { name: 'glowa', color: skin, geo: merge(box(0, 0, 0, 0.3, 0.32, 0.3), box(-0.07, 0.04, 0.155, 0.06, 0.06, 0.02), box(0.07, 0.04, 0.155, 0.06, 0.06, 0.02)) },
  { name: 'noga', color: pants, geo: merge(box(0, -0.42, 0, 0.18, 0.84, 0.2), box(0, -0.81, 0.06, 0.18, 0.08, 0.3)) },
  { name: 'reka', color: shirt, geo: merge(box(0, -0.28, 0, 0.13, 0.56, 0.14), box(0, -0.6, 0, 0.11, 0.1, 0.12)) },
];
// 0 korzeń, 1 tułów, 2 głowa, 3 noga L, 4 noga P, 5 ręka L, 6 ręka P
const nodes = [
  { name: 'postac', children: [1] },
  { name: 'tulow', mesh: 0, translation: [0, 1.15, 0], children: [2, 3, 4, 5, 6] },
  { name: 'glowa', mesh: 1, translation: [0, 0.48, 0] },
  { name: 'noga_l', mesh: 2, translation: [-0.13, -0.3, 0] },
  { name: 'noga_p', mesh: 2, translation: [0.13, -0.3, 0] },
  { name: 'reka_l', mesh: 3, translation: [-0.33, 0.27, 0] },
  { name: 'reka_p', mesh: 3, translation: [0.33, 0.27, 0] },
];
const steps = 9;
const cycle = (dur, fn) => {
  const times = [], values = [];
  for (let k = 0; k <= steps; k++) {
    const t = (k / steps) * dur;
    times.push(t);
    values.push(fn((k / steps) * Math.PI * 2));
  }
  return { times, values };
};
const walkDur = 0.8, idleDur = 2.4;
const swing = (amp, phase) => cycle(walkDur, (a) => qx(Math.sin(a + phase) * amp));
const animations = [
  {
    name: 'idzie',
    channels: [
      { node: 3, path: 'rotation', ...swing(32, 0) },
      { node: 4, path: 'rotation', ...swing(32, Math.PI) },
      { node: 5, path: 'rotation', ...swing(26, Math.PI) },
      { node: 6, path: 'rotation', ...swing(26, 0) },
      { node: 1, path: 'translation', ...cycle(walkDur, (a) => [0, 1.15 + Math.abs(Math.sin(a)) * 0.05, 0]) },
    ],
  },
  {
    name: 'stoi',
    channels: [
      { node: 1, path: 'translation', ...cycle(idleDur, (a) => [0, 1.15 + Math.sin(a) * 0.012, 0]) },
      { node: 5, path: 'rotation', ...cycle(idleDur, (a) => qx(Math.sin(a) * 3)) },
      { node: 6, path: 'rotation', ...cycle(idleDur, (a) => qx(-Math.sin(a) * 3)) },
      { node: 3, path: 'rotation', ...cycle(idleDur, () => qx(0)) },
      { node: 4, path: 'rotation', ...cycle(idleDur, () => qx(0)) },
    ],
  },
];
writeGlb('postac.glb', { parts, nodes, roots: [0], animations });

// ---------- beczka ----------
const wood = [0.55, 0.34, 0.16, 1], hoop = [0.3, 0.3, 0.32, 1];
writeGlb('beczka.glb', {
  parts: [
    { name: 'beczka', color: wood, geo: barrel(0.4, 1.0) },
    { name: 'obrecze', color: hoop, geo: merge(barrel(0.415, 0.06, 20, 1), ...[0.3, 0.64].map((y) => { const g = barrel(0.44, 0.06, 20, 1); g.pos = g.pos.map((v, i) => (i % 3 === 1 ? v + y : v)); return g; })) },
  ],
  nodes: [{ name: 'beczka', mesh: 0 }, { name: 'obrecze', mesh: 1, translation: [0, 0.12, 0] }],
  roots: [0, 1],
});

// ---------- skrzynia (górą można chodzić) ----------
const crate = [0.66, 0.5, 0.3, 1], plank = [0.45, 0.32, 0.18, 1];
writeGlb('skrzynia.glb', {
  parts: [
    { name: 'skrzynia', color: crate, geo: merge(box(0, 0.35, 0, 1.2, 0.7, 1.2), box(0, 0.35, 0.605, 1.1, 0.12, 0.02), box(0, 0.35, -0.605, 1.1, 0.12, 0.02)) },
    { name: 'walkable_top', color: plank, geo: box(0, 0.71, 0, 1.2, 0.02, 1.2) },
  ],
  nodes: [{ name: 'skrzynia', mesh: 0 }, { name: 'walkable_top', mesh: 1 }],
  roots: [0, 1],
});

// ---------- skały (dwie części) ----------
/** Nieregularna bryła: kula `seg` × `rings` z promieniem zmienianym falami, spłaszczona, podstawa na y = 0. */
function rock(rx, ry, rz, seed, seg = 18, rings = 10) {
  const pos = [], nor = [], idx = [];
  for (let k = 0; k <= rings; k++) {
    const b = (k / rings) * Math.PI; // 0 = góra, π = dół
    for (let s = 0; s <= seg; s++) {
      const a = (s / seg) * Math.PI * 2;
      const wobble = 1 + 0.16 * Math.sin(3 * a + seed) * Math.sin(b) + 0.1 * Math.cos(5 * a + seed * 2) * Math.sin(b);
      const x = Math.cos(a) * Math.sin(b) * rx * wobble;
      const z = Math.sin(a) * Math.sin(b) * rz * wobble;
      const y = Math.max(0, (Math.cos(b) * 0.5 + 0.5) * ry * 1.15 - ry * 0.15);
      pos.push(x, y, z);
      const l = Math.hypot(x, y - ry / 2, z) || 1;
      nor.push(x / l, (y - ry / 2) / l, z / l);
    }
  }
  for (let k = 0; k < rings; k++) for (let s = 0; s < seg; s++) {
    const a = k * (seg + 1) + s, b = a + seg + 1;
    idx.push(a, a + 1, b, a + 1, b + 1, b);
  }
  return { pos, nor, idx };
}
const stone = [0.52, 0.5, 0.47, 1];
/** Kwaternion obrotu wokół osi Y o kąt w stopniach. */
const qy = (deg) => [0, Math.sin((deg * Math.PI) / 360), 0, Math.cos((deg * Math.PI) / 360)];
writeGlb('skaly.glb', {
  parts: [
    { name: 'skala_duza', color: stone, geo: rock(1.3, 1.5, 0.9, 0.7) },
    { name: 'skala_mala', color: stone, geo: rock(0.75, 0.9, 0.45, 2.1) },
  ],
  nodes: [
    { name: 'skaly', children: [1, 2] },
    { name: 'skala_duza', mesh: 0, translation: [-0.9, 0, 0] },
    { name: 'skala_mala', mesh: 1, translation: [1.5, 0, 0.6], rotation: qy(35) },
  ],
  roots: [0],
});

// ---------- płot w kształcie L ----------
const fenceWood = [0.6, 0.45, 0.28, 1];
const fence = [];
// odcinek wzdłuż X: od (0, 0) do (4, 0); odcinek wzdłuż Z: od (0, 0) do (0, 2,5)
for (let x = 0; x <= 4; x += 1) fence.push(box(x, 0.55, 0, 0.12, 1.1, 0.12));
for (let z = 1; z <= 2.5; z += 0.75) fence.push(box(0, 0.55, z, 0.12, 1.1, 0.12));
for (const y of [0.4, 0.85]) fence.push(box(2, y, 0, 4.1, 0.1, 0.05), box(0, y, 1.25, 0.05, 0.1, 2.6));
writeGlb('plot.glb', {
  parts: [{ name: 'plot', color: fenceWood, geo: merge(...fence) }],
  nodes: [{ name: 'plot', mesh: 0 }],
  roots: [0],
});

// ---------- drzewo: pień przeszkadza, korona jest nad głową ----------
const bark = [0.42, 0.3, 0.2, 1], leaves = [0.25, 0.55, 0.25, 1];
const trunk = barrel(0.22, 2.6, 12, 2);
const crown = rock(1.6, 1.8, 1.6, 1.3);
crown.pos = crown.pos.map((v, i) => (i % 3 === 1 ? v + 2.2 : v));
writeGlb('drzewo.glb', {
  parts: [
    { name: 'pien', color: bark, geo: trunk },
    { name: 'korona', color: leaves, geo: crown },
  ],
  nodes: [{ name: 'pien', mesh: 0 }, { name: 'korona', mesh: 1 }],
  roots: [0, 1],
});

// ---------- lampa z własną siatką kolizji (UCX_lampa – niewidoczna, edytor bierze z niej obrys) ----------
const iron = [0.2, 0.22, 0.25, 1], glass = [1, 0.92, 0.6, 1], hidden = [1, 0, 1, 1];
writeGlb('lampa.glb', {
  parts: [
    { name: 'lampa', color: iron, geo: merge(barrel(0.32, 0.25, 16, 1), barrel(0.07, 3, 10, 2), box(0.6, 2.95, 0, 1.2, 0.06, 0.06)) },
    { name: 'klosz', color: glass, geo: box(1.1, 2.75, 0, 0.3, 0.35, 0.3) },
    { name: 'UCX_lampa', color: hidden, geo: box(0, 1, 0, 0.5, 2, 0.5) },
  ],
  nodes: [{ name: 'lampa', mesh: 0 }, { name: 'klosz', mesh: 1 }, { name: 'UCX_lampa', mesh: 2 }],
  roots: [0, 1, 2],
});
