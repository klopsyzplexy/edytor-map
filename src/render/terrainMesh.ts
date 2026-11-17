// Siatka terenu: wysokości, mieszanie warstw (shader), woda, maska stromych zboczy, kursor pędzla, siatka pomocnicza.
import * as THREE from 'three';
import { cellSize, type MapData } from '../core/map';
import { MAX_TERRAIN_LAYERS, type Schema } from '../core/schema';
import { slopeAt, type BrushShape, type HeightStamp, type Rect } from '../core/terrain';

/** Kształt kursora pędzla: kształty pędzli i stempel (kwadrat z podglądem obrazu). */
export type CursorShape = BrushShape | 'stamp';
const SHAPE_ID: Record<CursorShape, number> = { circle: 0, square: 1, diamond: 2, stamp: 3 };

const N = MAX_TERRAIN_LAYERS;

function layerFragment(): string {
  // Bez indeksowania tablic samplerów: osobna linia na każdą warstwę.
  let s = '';
  for (let k = 0; k < N; k++) {
    const w = k < 4 ? `wa.${'xyzw'[k]}` : `wb.${'xyzw'[k - 4]}`;
    s += `{ float w = ${w}; vec3 c = uHasTex[${k}] > 0.5 ? texture2D(uTex${k}, vWorld.xz / uTexScale[${k}]).rgb : uColors[${k}];
      c = mix(c, c * vec3(0.55, 0.7, 0.85), uWater[${k}]); col += c * w; total += w; }\n`;
  }
  return s;
}

const terrainVertex = /* glsl */ `
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vNormal = normal;
    vWorld = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }`;

const terrainFragment = /* glsl */ `
  uniform sampler2D uWeightsA;
  uniform sampler2D uWeightsB;
  uniform sampler2D uBlocked;
  uniform vec2 uGridN;
  uniform vec3 uColors[${N}];
  uniform float uHasTex[${N}];
  uniform float uWater[${N}];
  uniform float uTexScale[${N}];
  ${Array.from({ length: N }, (_, k) => `uniform sampler2D uTex${k};`).join('\n')}
  uniform vec3 uLightDir;
  uniform float uSlopeOn;
  uniform vec4 uBrush; // x, z, promień, widoczność
  uniform vec3 uBrushColor;
  uniform vec3 uBrushShape; // kształt (0 koło, 1 kwadrat, 2 romb, 3 stempel), obrót w radianach, promień wewnętrzny (0–1)
  uniform sampler2D uStamp;
  uniform float uStampMid;
  uniform float uGridStep;
  uniform vec2 uSize;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying vec2 vUv;
  void main() {
    vec2 tc = (vUv * (uGridN - 1.0) + 0.5) / uGridN;
    vec4 wa = texture2D(uWeightsA, tc);
    vec4 wb = texture2D(uWeightsB, tc);
    vec3 col = vec3(0.0);
    float total = 0.0;
    ${layerFragment()}
    col = total > 0.001 ? col / total : uColors[0];
    vec3 n = normalize(vNormal);
    float light = 0.42 + 0.68 * max(dot(n, normalize(uLightDir)), 0.0);
    col *= light;
    if (uSlopeOn > 0.5) {
      float b = texture2D(uBlocked, tc).r;
      col = mix(col, vec3(0.95, 0.12, 0.1), b * 0.6);
    }
    if (uGridStep > 0.0) {
      vec2 g = abs(fract(vWorld.xz / uGridStep - 0.5) - 0.5) / fwidth(vWorld.xz / uGridStep);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      col = mix(col, vec3(1.0), line * 0.18);
    }
    // obrys mapy
    vec2 e = min(vWorld.xz, uSize - vWorld.xz) / fwidth(vWorld.xz);
    col = mix(col, vec3(1.0, 0.9, 0.3), (1.0 - min(min(e.x, e.y) / 2.0, 1.0)) * 0.8);
    if (uBrush.w > 0.5) {
      // ta sama konwencja obrotu co brushLocal() w core/terrain.ts
      vec2 dl = vWorld.xz - uBrush.xy;
      float ca = cos(uBrushShape.y);
      float sa = sin(uBrushShape.y);
      vec2 p = vec2(dl.x * ca + dl.y * sa, -dl.x * sa + dl.y * ca);
      float shape = uBrushShape.x;
      float d = shape < 0.5 ? length(p) : shape < 1.5 || shape > 2.5 ? max(abs(p.x), abs(p.y)) : abs(p.x) + abs(p.y);
      float fw = fwidth(d) * 1.5;
      float ring = 1.0 - smoothstep(0.0, fw, abs(d - uBrush.z));
      float inner = shape > 2.5 ? 0.0 : 1.0 - smoothstep(0.0, fw, abs(d - uBrush.z * max(uBrushShape.z, 0.02)));
      col = mix(col, uBrushColor, max(ring, inner * 0.35));
      if (shape > 2.5 && d < uBrush.z) {
        // podgląd stempla: jasne – podniesie, ciemne (przy 50% = zero) – obniży
        float v = texture2D(uStamp, p / (2.0 * uBrush.z) + 0.5).r;
        float signedV = uStampMid > 0.5 ? v * 2.0 - 1.0 : v;
        col = mix(col, signedV >= 0.0 ? vec3(1.0, 0.95, 0.7) : vec3(0.3, 0.55, 1.0), min(abs(signedV), 1.0) * 0.6);
        // strzałka kierunku „góra obrazu”
        if (abs(p.x) < fw * 1.2 && p.y < 0.0 && p.y > -uBrush.z) col = mix(col, uBrushColor, 0.6);
      }
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }`;

const waterVertex = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.y += sin(p.x * 0.9 + uTime * 1.6) * 0.04 + cos(p.z * 1.1 + uTime * 1.3) * 0.04;
    vWorld = p;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }`;

const waterFragment = /* glsl */ `
  uniform sampler2D uWeightsA;
  uniform sampler2D uWeightsB;
  uniform vec2 uGridN;
  uniform vec3 uColors[${N}];
  uniform float uWater[${N}];
  uniform float uTime;
  varying vec3 vWorld;
  varying vec2 vUv;
  void main() {
    vec2 tc = (vUv * (uGridN - 1.0) + 0.5) / uGridN;
    vec4 wa = texture2D(uWeightsA, tc);
    vec4 wb = texture2D(uWeightsB, tc);
    float w[${N}] = float[${N}](wa.x, wa.y, wa.z, wa.w, wb.x, wb.y, wb.z, wb.w);
    float amount = 0.0;
    float total = 0.0;
    vec3 col = vec3(0.0);
    for (int k = 0; k < ${N}; k++) {
      total += w[k];
      amount += w[k] * uWater[k];
      col += uColors[k] * w[k] * uWater[k];
    }
    if (amount < 0.001) discard;
    col /= amount;
    amount /= max(total, 0.001);
    float a = smoothstep(0.25, 0.55, amount);
    if (a < 0.01) discard;
    float waves = 0.5 * sin(vWorld.x * 1.3 + vWorld.z * 0.7 + uTime * 1.8) + 0.5 * sin(vWorld.z * 1.7 - vWorld.x * 0.4 - uTime * 1.3);
    col *= 1.05 + waves * 0.1;
    col = mix(col, vec3(0.82, 0.93, 1.0), smoothstep(0.55, 1.0, waves) * 0.3);
    gl_FragColor = vec4(col, a * 0.78);
    #include <colorspace_fragment>
  }`;

export class TerrainMesh {
  readonly group = new THREE.Group();
  readonly mesh: THREE.Mesh;
  private water: THREE.Mesh;
  private geom: THREE.BufferGeometry;
  private waterGeom: THREE.BufferGeometry;
  private weightsA: THREE.DataTexture;
  private weightsB: THREE.DataTexture;
  private blocked: THREE.DataTexture;
  private material: THREE.ShaderMaterial;
  private waterMat: THREE.ShaderMaterial;
  private loader = new THREE.TextureLoader();

  constructor(
    private map: MapData,
    private schema: Schema,
  ) {
    const { nx, nz } = map.terrain;
    const [sx, sz] = cellSize(map);
    const pos = new Float32Array(nx * nz * 3);
    const uv = new Float32Array(nx * nz * 2);
    for (let j = 0; j < nz; j++)
      for (let i = 0; i < nx; i++) {
        const k = j * nx + i;
        pos[k * 3] = i * sx;
        pos[k * 3 + 2] = j * sz;
        uv[k * 2] = i / (nx - 1);
        uv[k * 2 + 1] = j / (nz - 1);
      }
    const idx = new Uint32Array((nx - 1) * (nz - 1) * 6);
    let t = 0;
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        idx.set([a, c, b, b, c, d], t);
        t += 6;
      }
    const make = () => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos.slice(), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      return g;
    };
    this.geom = make();
    this.geom.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(nx * nz * 3), 3));
    this.waterGeom = make();

    const tex = (data: Uint8Array, format: THREE.PixelFormat) => {
      const tx = new THREE.DataTexture(data, nx, nz, format, THREE.UnsignedByteType);
      tx.magFilter = THREE.LinearFilter;
      tx.minFilter = THREE.LinearFilter;
      tx.needsUpdate = true;
      return tx;
    };
    this.weightsA = tex(new Uint8Array(nx * nz * 4), THREE.RGBAFormat);
    this.weightsB = tex(new Uint8Array(nx * nz * 4), THREE.RGBAFormat);
    this.blocked = tex(new Uint8Array(nx * nz), THREE.RedFormat);

    const common = {
      uWeightsA: { value: this.weightsA },
      uWeightsB: { value: this.weightsB },
      uGridN: { value: new THREE.Vector2(nx, nz) },
      uColors: { value: Array.from({ length: N }, () => new THREE.Color()) },
      uWater: { value: new Array(N).fill(0) },
    };
    const uniforms: Record<string, THREE.IUniform> = {
      ...common,
      uBlocked: { value: this.blocked },
      uHasTex: { value: new Array(N).fill(0) },
      uTexScale: { value: new Array(N).fill(4) },
      uLightDir: { value: new THREE.Vector3(0.45, 1, 0.3) },
      uSlopeOn: { value: 0 },
      uBrush: { value: new THREE.Vector4(0, 0, 1, 0) },
      uBrushColor: { value: new THREE.Color(1, 1, 1) },
      uBrushShape: { value: new THREE.Vector3(0, 0, 0.5) },
      uStamp: { value: null },
      uStampMid: { value: 0 },
      uGridStep: { value: 0 },
      uSize: { value: new THREE.Vector2(...map.settings.size) },
    };
    for (let k = 0; k < N; k++) uniforms[`uTex${k}`] = { value: null };
    this.material = new THREE.ShaderMaterial({ uniforms, vertexShader: terrainVertex, fragmentShader: terrainFragment });
    this.waterMat = new THREE.ShaderMaterial({
      uniforms: { ...common, uTime: { value: 0 } },
      vertexShader: waterVertex,
      fragmentShader: waterFragment,
      transparent: true,
      depthWrite: false,
    });
    this.mesh = new THREE.Mesh(this.geom, this.material);
    this.water = new THREE.Mesh(this.waterGeom, this.waterMat);
    this.water.renderOrder = 1;
    this.group.add(this.mesh, this.water);
    this.applySchema();
    this.updateAll();
  }

  /** Kolory, tekstury i flagi wody z warstw schematu. */
  applySchema(): void {
    const u = this.material.uniforms;
    this.schema.terrainLayers.forEach((l, k) => {
      (u.uColors.value as THREE.Color[])[k].set(l.color);
      (u.uWater.value as number[])[k] = l.water ? 1 : 0;
      (u.uTexScale.value as number[])[k] = l.textureScale;
      if (l.texture) {
        this.loader.load(l.texture, (tx) => {
          tx.wrapS = tx.wrapT = THREE.RepeatWrapping;
          tx.colorSpace = THREE.SRGBColorSpace;
          u[`uTex${k}`].value = tx;
          (u.uHasTex.value as number[])[k] = 1;
        });
      }
    });
  }

  updateAll(): void {
    const { nx, nz } = this.map.terrain;
    this.update({ i0: 0, j0: 0, i1: nx - 1, j1: nz - 1 }, 'all');
  }

  update(rect: Rect, kind: 'heights' | 'layers' | 'all'): void {
    if (kind !== 'layers') this.updateHeights(rect);
    if (kind !== 'heights') this.updateWeights();
  }

  private updateHeights(r: Rect): void {
    const { nx, nz, heights } = this.map.terrain;
    const [sx, sz] = cellSize(this.map);
    const pos = this.geom.getAttribute('position') as THREE.BufferAttribute;
    const nor = this.geom.getAttribute('normal') as THREE.BufferAttribute;
    const wpos = this.waterGeom.getAttribute('position') as THREE.BufferAttribute;
    const level = this.map.settings.waterLevel;
    const i0 = Math.max(0, r.i0 - 1);
    const i1 = Math.min(nx - 1, r.i1 + 1);
    const j0 = Math.max(0, r.j0 - 1);
    const j1 = Math.min(nz - 1, r.j1 + 1);
    for (let j = j0; j <= j1; j++)
      for (let i = i0; i <= i1; i++) {
        const k = j * nx + i;
        const h = heights[k];
        pos.array[k * 3 + 1] = h;
        wpos.array[k * 3 + 1] = Math.max(level, h + 0.03);
        const hl = heights[j * nx + Math.max(0, i - 1)];
        const hr = heights[j * nx + Math.min(nx - 1, i + 1)];
        const hd = heights[Math.max(0, j - 1) * nx + i];
        const hu = heights[Math.min(nz - 1, j + 1) * nx + i];
        const dx = (hr - hl) / ((Math.min(nx - 1, i + 1) - Math.max(0, i - 1)) * sx);
        const dz = (hu - hd) / ((Math.min(nz - 1, j + 1) - Math.max(0, j - 1)) * sz);
        const len = Math.hypot(dx, 1, dz);
        nor.array[k * 3] = -dx / len;
        nor.array[k * 3 + 1] = 1 / len;
        nor.array[k * 3 + 2] = -dz / len;
      }
    pos.needsUpdate = true;
    nor.needsUpdate = true;
    wpos.needsUpdate = true;
    this.geom.computeBoundingSphere();
    this.geom.computeBoundingBox();
    this.waterGeom.computeBoundingSphere();
    if (this.material.uniforms.uSlopeOn.value > 0.5) this.updateSlope({ i0, j0, i1, j1 });
  }

  private updateWeights(): void {
    const { nx, nz, layers } = this.map.terrain;
    const a = this.weightsA.image.data as Uint8Array;
    const b = this.weightsB.image.data as Uint8Array;
    a.fill(0);
    b.fill(0);
    this.schema.terrainLayers.forEach((l, k) => {
      const src = layers[l.id];
      if (!src) return;
      const dst = k < 4 ? a : b;
      const ch = k % 4;
      for (let p = 0; p < nx * nz; p++) dst[p * 4 + ch] = src[p];
    });
    this.weightsA.needsUpdate = true;
    this.weightsB.needsUpdate = true;
    this.updateWaterCells();
  }

  /** Powierzchnia wody tylko w oczkach, w których jest warstwa wodna (na dużej mapie to duża oszczędność). */
  private updateWaterCells(): void {
    const { nx, nz, layers } = this.map.terrain;
    const wet = this.schema.terrainLayers.filter((l) => l.water).map((l) => layers[l.id]).filter(Boolean);
    const flag = new Uint8Array(nx * nz);
    for (const a of wet) for (let k = 0; k < flag.length; k++) if (a[k]) flag[k] = 1;
    const isWet = (k: number) => flag[k] === 1;
    const idx: number[] = [];
    for (let j = 0; j < nz - 1; j++)
      for (let i = 0; i < nx - 1; i++) {
        const a = j * nx + i;
        const b = a + 1;
        const c = a + nx;
        const d = c + 1;
        if (isWet(a) || isWet(b) || isWet(c) || isWet(d)) idx.push(a, c, b, b, c, d);
      }
    this.waterGeom.setIndex(new THREE.BufferAttribute(new Uint32Array(idx), 1));
    this.water.visible = idx.length > 0;
  }

  /** Zmiana poziomu wody: przelicza wysokość powierzchni wody. */
  updateWaterLevel(): void {
    this.updateAll();
  }

  setSlopeOverlay(on: boolean): void {
    this.material.uniforms.uSlopeOn.value = on ? 1 : 0;
    if (on) {
      const { nx, nz } = this.map.terrain;
      this.updateSlope({ i0: 0, j0: 0, i1: nx - 1, j1: nz - 1 });
    }
  }

  /** Tryb gry: pokazuje na terenie podaną maskę nieprzechodniości (null – wyłącza). */
  setBlockedOverlay(mask: Uint8Array | null): void {
    this.material.uniforms.uSlopeOn.value = mask ? 1 : 0;
    if (!mask) return;
    (this.blocked.image.data as Uint8Array).set(mask);
    this.blocked.needsUpdate = true;
  }

  private updateSlope(r: Rect): void {
    const { nx } = this.map.terrain;
    const data = this.blocked.image.data as Uint8Array;
    const max = this.map.settings.slope.maxDeg;
    for (let j = r.j0; j <= r.j1; j++) for (let i = r.i0; i <= r.i1; i++) data[j * nx + i] = slopeAt(this.map, i, j) > max ? 255 : 0;
    this.blocked.needsUpdate = true;
  }

  setBrush(x: number, z: number, radius: number, visible: boolean, color = 0xffffff): void {
    (this.material.uniforms.uBrush.value as THREE.Vector4).set(x, z, radius, visible ? 1 : 0);
    (this.material.uniforms.uBrushColor.value as THREE.Color).set(color);
  }

  /** Kształt kursora pędzla: kształt, obrót w stopniach i miękkość (wewnętrzny okrąg). */
  setBrushShape(shape: CursorShape, angleDeg: number, softness: number): void {
    (this.material.uniforms.uBrushShape.value as THREE.Vector3).set(SHAPE_ID[shape], (angleDeg * Math.PI) / 180, 1 - softness);
  }

  private stampTex: THREE.DataTexture | null = null;
  private stampSrc: HeightStamp | null = null;

  /** Obraz stempla do podglądu pod kursorem. */
  setStamp(st: HeightStamp | null, midZero: boolean): void {
    this.material.uniforms.uStampMid.value = midZero ? 1 : 0;
    if (st === this.stampSrc) return;
    this.stampSrc = st;
    this.stampTex?.dispose();
    this.stampTex = null;
    if (st) {
      const bytes = new Uint8Array(st.w * st.h);
      for (let k = 0; k < bytes.length; k++) bytes[k] = Math.round(st.data[k] * 255);
      this.stampTex = new THREE.DataTexture(bytes, st.w, st.h, THREE.RedFormat, THREE.UnsignedByteType);
      this.stampTex.magFilter = this.stampTex.minFilter = THREE.LinearFilter;
      this.stampTex.needsUpdate = true;
    }
    this.material.uniforms.uStamp.value = this.stampTex;
  }

  setGrid(step: number): void {
    this.material.uniforms.uGridStep.value = step;
  }

  tick(time: number): void {
    this.waterMat.uniforms.uTime.value = time;
  }

  dispose(): void {
    this.geom.dispose();
    this.waterGeom.dispose();
    this.material.dispose();
    this.waterMat.dispose();
    this.weightsA.dispose();
    this.weightsB.dispose();
    this.blocked.dispose();
    this.stampTex?.dispose();
  }
}
