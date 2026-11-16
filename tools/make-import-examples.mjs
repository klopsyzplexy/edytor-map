// Tworzy pliki do ręcznego testu importu modeli w docs/przyklady-importu/ (nie trafiają do zbudowanej strony).
// Każdy plik nazywa się „kladka”, więc po wczytaniu zastępuje model „Kładka (model)” z przykładowego schematu:
// OBJ – skrzynka w szachownicę (tekstura), glTF – zielona skrzynka, FBX – czerwona skrzynka.
// Uruchomienie: node tools/make-import-examples.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const root = new URL('../docs/przyklady-importu/', import.meta.url);
const dir = (d) => {
  const u = new URL(`${d}/`, root);
  mkdirSync(u, { recursive: true });
  return u;
};

// --- PNG RGB (szachownica) ---
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const chunk = (type, data) => {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
};
function checker(n = 64) {
  const raw = Buffer.alloc(n * (n * 3 + 1));
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const on = (Math.floor(x / 8) + Math.floor(y / 8)) % 2 === 0;
      raw.set(on ? [230, 180, 60] : [120, 70, 30], y * (n * 3 + 1) + 1 + x * 3);
    }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(n, 0);
  ihdr.writeUInt32BE(n, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

// --- skrzynka 4 × 1 × 2 (jak kładka), podstawa na y = 0 ---
const W = 2, H = 1, D = 1;
const faces = [
  [[0, 1, 0], [[-W, H, -D], [-W, H, D], [W, H, D], [W, H, -D]]],
  [[0, -1, 0], [[-W, 0, D], [-W, 0, -D], [W, 0, -D], [W, 0, D]]],
  [[1, 0, 0], [[W, 0, -D], [W, H, -D], [W, H, D], [W, 0, D]]],
  [[-1, 0, 0], [[-W, 0, D], [-W, H, D], [-W, H, -D], [-W, 0, -D]]],
  [[0, 0, 1], [[W, 0, D], [W, H, D], [-W, H, D], [-W, 0, D]]],
  [[0, 0, -1], [[-W, 0, -D], [-W, H, -D], [W, H, -D], [W, 0, -D]]],
];
const uv = [[0, 0], [0, 1], [1, 1], [1, 0]];

// OBJ + MTL + tekstura
{
  const d = dir('obj');
  let obj = '# Skrzynka testowa\nmtllib kladka.mtl\n';
  for (const [, vs] of faces) for (const v of vs) obj += `v ${v.join(' ')}\n`;
  for (const t of uv) obj += `vt ${t.join(' ')}\n`;
  for (const [n] of faces) obj += `vn ${n.join(' ')}\n`;
  obj += 'usemtl drewno\n';
  faces.forEach((_, f) => {
    const b = f * 4 + 1;
    obj += `f ${[0, 1, 2, 3].map((k) => `${b + k}/${k + 1}/${f + 1}`).join(' ')}\n`;
  });
  writeFileSync(new URL('kladka.obj', d), obj);
  writeFileSync(new URL('kladka.mtl', d), 'newmtl drewno\nKd 1 1 1\nNs 20\nmap_Kd tekstury/drewno.png\n');
  writeFileSync(new URL('drewno.png', d), checker());
}

// glTF + osobny .bin
{
  const d = dir('gltf');
  const pos = [], nor = [], idx = [];
  faces.forEach(([n, vs], f) => {
    for (const v of vs) pos.push(...v), nor.push(...n);
    idx.push(f * 4, f * 4 + 1, f * 4 + 2, f * 4, f * 4 + 2, f * 4 + 3);
  });
  const p = Buffer.from(new Float32Array(pos).buffer);
  const nn = Buffer.from(new Float32Array(nor).buffer);
  const ii = Buffer.from(new Uint16Array(idx).buffer);
  const bin = Buffer.concat([p, nn, ii]);
  writeFileSync(new URL('kladka.bin', d), bin);
  const gltf = {
    asset: { version: '2.0', generator: 'edytor-map tools/make-import-examples.mjs' },
    buffers: [{ uri: 'kladka.bin', byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: p.length },
      { buffer: 0, byteOffset: p.length, byteLength: nn.length },
      { buffer: 0, byteOffset: p.length + nn.length, byteLength: ii.length },
    ],
    accessors: [
      { bufferView: 0, componentType: 5126, count: pos.length / 3, type: 'VEC3', min: [-W, 0, -D], max: [W, H, D] },
      { bufferView: 1, componentType: 5126, count: nor.length / 3, type: 'VEC3' },
      { bufferView: 2, componentType: 5123, count: idx.length, type: 'SCALAR' },
    ],
    materials: [{ name: 'zielony', pbrMetallicRoughness: { baseColorFactor: [0.2, 0.75, 0.3, 1], metallicFactor: 0, roughnessFactor: 0.8 } }],
    meshes: [{ name: 'walkable_skrzynka', primitives: [{ attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 }] }],
    nodes: [{ mesh: 0, name: 'skrzynka' }],
    scenes: [{ nodes: [0] }],
    scene: 0,
  };
  writeFileSync(new URL('kladka.gltf', d), JSON.stringify(gltf, null, 1));
}

// FBX (ASCII 7.3)
{
  const d = dir('fbx');
  const verts = faces.flatMap(([, vs]) => vs.flat());
  const poly = faces.flatMap((_, f) => [f * 4, f * 4 + 1, f * 4 + 2, -(f * 4 + 3) - 1]);
  const fbx = `; FBX 7.3.0 project file
FBXHeaderExtension:  {
	FBXHeaderVersion: 1003
	FBXVersion: 7300
}
GlobalSettings:  {
	Version: 1000
	Properties70:  {
		P: "UpAxis", "int", "Integer", "",1
		P: "UnitScaleFactor", "double", "Number", "",1
	}
}
Objects:  {
	Geometry: 100, "Geometry::skrzynka", "Mesh" {
		Vertices: *${verts.length} {
			a: ${verts.join(',')}
		}
		PolygonVertexIndex: *${poly.length} {
			a: ${poly.join(',')}
		}
		GeometryVersion: 124
	}
	Model: 200, "Model::skrzynka", "Mesh" {
		Version: 232
		Properties70:  {
		}
	}
	Material: 300, "Material::czerwony", "" {
		Version: 102
		ShadingModel: "phong"
		Properties70:  {
			P: "DiffuseColor", "Color", "", "A",0.85,0.2,0.15
		}
	}
}
Connections:  {
	C: "OO",100,200
	C: "OO",300,200
	C: "OO",200,0
}
`;
  writeFileSync(new URL('kladka.fbx', d), fbx);
}
// ZIP (bez kompresji) z kompletem OBJ – test wczytywania archiwum
{
  const files = ['kladka.obj', 'kladka.mtl', 'drewno.png'].map((n) => [`kladka/${n}`, readFileSync(new URL(`obj/${n}`, root))]);
  const local = [];
  const central = [];
  let offset = 0;
  for (const [name, data] of files) {
    const nb = Buffer.from(name);
    const h = Buffer.alloc(30);
    h.writeUInt32LE(0x04034b50, 0);
    h.writeUInt16LE(20, 4);
    h.writeUInt32LE(crc32(data), 14);
    h.writeUInt32LE(data.length, 18);
    h.writeUInt32LE(data.length, 22);
    h.writeUInt16LE(nb.length, 26);
    local.push(h, nb, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(20, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt32LE(crc32(data), 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(nb.length, 28);
    c.writeUInt32LE(offset, 42);
    central.push(c, nb);
    offset += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  writeFileSync(new URL('kladka-obj.zip', root), Buffer.concat([...local, cd, end]));
}
console.log('docs/przyklady-importu/: obj/, gltf/, fbx/, kladka-obj.zip');
