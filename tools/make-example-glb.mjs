// Tworzy przykładowy model examples/modele/kladka.glb (kładka z pomostem „walkable” i dwiema poręczami).
// Uruchomienie: node tools/make-example-glb.mjs
import { writeFileSync } from 'node:fs';

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
  return { pos: new Float32Array(pos), nor: new Float32Array(nor), idx: new Uint16Array(idx) };
}

const parts = [
  { name: 'walkable_deck', color: [0.55, 0.35, 0.18, 1], geo: box(0, 0.9, 0, 2.2, 0.2, 7) },
  { name: 'rail_left', color: [0.35, 0.22, 0.1, 1], geo: box(-1.05, 1.45, 0, 0.1, 0.9, 7) },
  { name: 'rail_right', color: [0.35, 0.22, 0.1, 1], geo: box(1.05, 1.45, 0, 0.1, 0.9, 7) },
  { name: 'post_a', color: [0.35, 0.22, 0.1, 1], geo: box(0, 0.4, -3, 0.4, 0.8, 0.4) },
  { name: 'post_b', color: [0.35, 0.22, 0.1, 1], geo: box(0, 0.4, 3, 0.4, 0.8, 0.4) },
];

const chunks = [];
let offset = 0;
const bufferViews = [], accessors = [], meshes = [], nodes = [], materials = [];
function addView(arr, target) {
  const bytes = Buffer.from(arr.buffer, arr.byteOffset, arr.byteLength);
  const pad = (4 - (bytes.length % 4)) % 4;
  chunks.push(bytes, Buffer.alloc(pad));
  bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
  offset += bytes.length + pad;
  return bufferViews.length - 1;
}
parts.forEach((p, i) => {
  const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
  for (let k = 0; k < p.geo.pos.length; k += 3) for (let a = 0; a < 3; a++) { min[a] = Math.min(min[a], p.geo.pos[k + a]); max[a] = Math.max(max[a], p.geo.pos[k + a]); }
  const vp = addView(p.geo.pos, 34962), vn = addView(p.geo.nor, 34962), vi = addView(p.geo.idx, 34963);
  accessors.push({ bufferView: vp, componentType: 5126, count: p.geo.pos.length / 3, type: 'VEC3', min, max });
  accessors.push({ bufferView: vn, componentType: 5126, count: p.geo.nor.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: vi, componentType: 5123, count: p.geo.idx.length, type: 'SCALAR' });
  materials.push({ name: p.name, pbrMetallicRoughness: { baseColorFactor: p.color, metallicFactor: 0, roughnessFactor: 0.9 } });
  meshes.push({ name: p.name, primitives: [{ attributes: { POSITION: i * 3, NORMAL: i * 3 + 1 }, indices: i * 3 + 2, material: i }] });
  nodes.push({ name: p.name, mesh: i });
});
const bin = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'edytor-map/tools/make-example-glb.mjs' },
  scene: 0,
  scenes: [{ nodes: nodes.map((_, i) => i) }],
  nodes, meshes, materials, accessors, bufferViews,
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
writeFileSync(new URL('../examples/modele/kladka.glb', import.meta.url), Buffer.concat([header, jh, json, bh, bin]));
console.log('Zapisano examples/modele/kladka.glb');
