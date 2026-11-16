// Kodowanie tablic liczb do base64 (zawsze little-endian, niezależnie od komputera).

function bytesToBase64(bytes: Uint8Array): string {
  let s = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) s += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(s);
}

function base64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

export function encodeU8(a: Uint8Array): string {
  return bytesToBase64(a);
}

export function decodeU8(b64: string): Uint8Array {
  return base64ToBytes(b64);
}

export function encodeF32(a: Float32Array): string {
  const bytes = new Uint8Array(a.length * 4);
  const dv = new DataView(bytes.buffer);
  for (let i = 0; i < a.length; i++) dv.setFloat32(i * 4, a[i], true);
  return bytesToBase64(bytes);
}

export function decodeF32(b64: string): Float32Array {
  const bytes = base64ToBytes(b64);
  if (bytes.length % 4 !== 0) throw new Error('Uszkodzone dane Float32 (długość nie jest wielokrotnością 4).');
  const dv = new DataView(bytes.buffer);
  const out = new Float32Array(bytes.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = dv.getFloat32(i * 4, true);
  return out;
}
