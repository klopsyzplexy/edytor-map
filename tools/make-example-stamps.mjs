// Tworzy przykładowe stemple wysokości (szare obrazy PNG 128 × 128) w examples/stemple/.
// Uruchomienie: node tools/make-example-stamps.mjs
// Jasny piksel = wyżej. Stemple „krater” i „wąwóz” używają szarości 50% jako „bez zmian” (patrz src/tools/stamps.ts).
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const N = 128;
const out = new URL('../examples/stemple/', import.meta.url);

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
/** PNG w skali szarości (8 bitów) z funkcji f(u, v) ∈ [0, 1], u, v ∈ [−1, 1]. */
function png(f) {
  const raw = Buffer.alloc(N * (N + 1));
  for (let y = 0; y < N; y++) {
    raw[y * (N + 1)] = 0;
    for (let x = 0; x < N; x++) {
      const v = f((x / (N - 1)) * 2 - 1, (y / (N - 1)) * 2 - 1);
      raw[y * (N + 1) + 1 + x] = Math.round(Math.min(1, Math.max(0, v)) * 255);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(N, 0);
  ihdr.writeUInt32BE(N, 4);
  ihdr[8] = 8; // bity na kanał
  ihdr[9] = 0; // skala szarości
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0))]);
}

// powtarzalny szum wartości
function hash(i, j) {
  let h = (i * 374761393 + j * 668265263) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function noise(x, y) {
  const i = Math.floor(x), j = Math.floor(y);
  const tx = x - i, ty = y - j;
  const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
  const a = hash(i, j) * (1 - sx) + hash(i + 1, j) * sx;
  const b = hash(i, j + 1) * (1 - sx) + hash(i + 1, j + 1) * sx;
  return a * (1 - sy) + b * sy;
}
const fbm = (x, y) => noise(x, y) * 0.5 + noise(x * 2.1, y * 2.1) * 0.3 + noise(x * 4.3, y * 4.3) * 0.2;
const smooth = (e0, e1, x) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

const stamps = {
  // góra: szczyt z nierównymi zboczami, zero na brzegu
  gora: (u, v) => {
    const r = Math.hypot(u, v) * (0.85 + fbm(u * 3 + 7, v * 3 + 3) * 0.3);
    return Math.pow(Math.max(0, 1 - r), 1.7) * (0.85 + fbm(u * 6, v * 6) * 0.15);
  },
  // krater: wał dookoła i niecka poniżej terenu (50% = bez zmian)
  krater: (u, v) => {
    const r = Math.hypot(u, v);
    const rim = Math.exp(-(((r - 0.62) / 0.13) ** 2)) * 0.38;
    const bowl = (1 - smooth(0.25, 0.62, r)) * 0.3;
    return (0.5 + rim - bowl) * (1 - smooth(0.85, 1, r)) + 0.5 * smooth(0.85, 1, r);
  },
  // wąwóz: wydłużona dolina wzdłuż osi X, lekko kręta (50% = bez zmian)
  wawoz: (u, v) => {
    const c = Math.sin(u * 2.4) * 0.12;
    const depth = Math.exp(-(((v - c) / 0.2) ** 2)) * (1 - smooth(0.7, 1, Math.abs(u)));
    return 0.5 - depth * 0.45;
  },
  // płaskowyż: płaski szczyt ze stromymi brzegami
  plaskowyz: (u, v) => {
    const r = Math.hypot(u, v) * (0.92 + fbm(u * 4 + 1, v * 4 + 9) * 0.16);
    return 1 - smooth(0.5, 0.8, r);
  },
};

for (const [name, f] of Object.entries(stamps)) {
  writeFileSync(new URL(`${name}.png`, out), png(f));
  console.log(`examples/stemple/${name}.png`);
}
