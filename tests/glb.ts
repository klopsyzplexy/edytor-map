// Mały czytnik .glb do testów: trójkąty wszystkich siatek w układzie pliku modelu (z przekształceniami węzłów).
import { readFileSync } from 'node:fs';

type M4 = number[];

function compose(t: number[] = [0, 0, 0], q: number[] = [0, 0, 0, 1], s: number[] = [1, 1, 1]): M4 {
  const [x, y, z, w] = q;
  const [sx, sy, sz] = s;
  // macierz kolumnowa 4×4 (jak w glTF)
  return [
    (1 - 2 * (y * y + z * z)) * sx, 2 * (x * y + z * w) * sx, 2 * (x * z - y * w) * sx, 0,
    2 * (x * y - z * w) * sy, (1 - 2 * (x * x + z * z)) * sy, 2 * (y * z + x * w) * sy, 0,
    2 * (x * z + y * w) * sz, 2 * (y * z - x * w) * sz, (1 - 2 * (x * x + y * y)) * sz, 0,
    t[0], t[1], t[2], 1,
  ];
}

function mul(a: M4, b: M4): M4 {
  const o = new Array(16).fill(0);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) o[c * 4 + r] += a[k * 4 + r] * b[c * 4 + k];
  return o;
}

export function glbTriangles(path: string): Float32Array {
  const buf = readFileSync(path);
  const jsonLen = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));
  const binStart = 20 + jsonLen + 8;
  const read = (acc: number): Float32Array | Uint16Array | Uint32Array => {
    const a = gltf.accessors[acc];
    const v = gltf.bufferViews[a.bufferView];
    const n = a.count * ({ SCALAR: 1, VEC3: 3, VEC4: 4 } as Record<string, number>)[a.type];
    const off = binStart + (v.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const ab = buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + n * (a.componentType === 5123 ? 2 : 4));
    return a.componentType === 5126 ? new Float32Array(ab) : a.componentType === 5123 ? new Uint16Array(ab) : new Uint32Array(ab);
  };
  const out: number[] = [];
  const visit = (ni: number, parent: M4) => {
    const n = gltf.nodes[ni];
    const m = mul(parent, n.matrix ?? compose(n.translation, n.rotation, n.scale));
    if (n.mesh !== undefined)
      for (const p of gltf.meshes[n.mesh].primitives) {
        const pos = read(p.attributes.POSITION);
        const idx = p.indices !== undefined ? read(p.indices) : null;
        const count = idx ? idx.length : pos.length / 3;
        for (let k = 0; k < count; k++) {
          const i = idx ? idx[k] : k;
          const [x, y, z] = [pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2]];
          out.push(m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]);
        }
      }
    for (const c of n.children ?? []) visit(c, m);
  };
  for (const r of gltf.scenes[gltf.scene ?? 0].nodes) visit(r, compose());
  return new Float32Array(out);
}
