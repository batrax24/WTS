import * as THREE from 'three';
import { ObstacleMaterial } from '../types/wts';

/* ------------------------------------------------------------------ *
 * WTS · VISUAL ASSETS
 * Procedural PBR textures, atmospheric sky, reflection environment
 * and particle sprites. Everything is generated at runtime: no external
 * image downloads, so the game keeps working offline / in WebXR.
 * ------------------------------------------------------------------ */

export type GraphicsQuality = 'alta' | 'media' | 'baja';
export type SurfaceKind = ObstacleMaterial | 'asphalt' | 'facade' | 'fabric' | 'rust';

/* ----------------------------- helpers ---------------------------- */

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, min = 0, max = 1): number {
  return Math.min(max, Math.max(min, v));
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

/** Tileable fractal value-noise, returned as a Float32Array in [0,1]. */
function noiseField(size: number, grid: number, rng: () => number): Float32Array {
  const values = new Float32Array(grid * grid);
  for (let i = 0; i < values.length; i++) values[i] = rng();

  const out = new Float32Array(size * size);
  const scale = grid / size;
  for (let y = 0; y < size; y++) {
    const gy = y * scale;
    const y0 = Math.floor(gy);
    const fy = smooth(gy - y0);
    for (let x = 0; x < size; x++) {
      const gx = x * scale;
      const x0 = Math.floor(gx);
      const fx = smooth(gx - x0);
      const x1 = (x0 + 1) % grid;
      const y1 = (y0 + 1) % grid;
      const a = values[(y0 % grid) * grid + (x0 % grid)];
      const b = values[(y0 % grid) * grid + x1];
      const c = values[y1 * grid + (x0 % grid)];
      const d = values[y1 * grid + x1];
      out[y * size + x] =
        (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
    }
  }
  return out;
}

function fbm(size: number, seed: number): Float32Array {
  const rng = mulberry32(seed);
  const n1 = noiseField(size, 4, rng);
  const n2 = noiseField(size, 12, rng);
  const n3 = noiseField(size, 32, rng);
  const n4 = noiseField(size, 96, rng);
  const out = new Float32Array(size * size);
  for (let i = 0; i < out.length; i++) {
    out[i] = n1[i] * 0.45 + n2[i] * 0.29 + n3[i] * 0.18 + n4[i] * 0.08;
  }
  return out;
}

function makeCanvas(w: number, h = w): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
} {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D no disponible para generar texturas WTS');
  return { canvas, ctx };
}

function toTexture(
  canvas: HTMLCanvasElement,
  srgb: boolean,
  repeatX = 1,
  repeatY = 1
): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = 8;
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Draw a jagged crack polyline. */
function drawCrack(
  ctx: CanvasRenderingContext2D,
  rng: () => number,
  size: number,
  count: number,
  color: string,
  width: number
): void {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  for (let i = 0; i < count; i++) {
    let x = rng() * size;
    let y = rng() * size;
    let angle = rng() * Math.PI * 2;
    const segments = 3 + Math.floor(rng() * 7);
    ctx.lineWidth = width * (0.5 + rng());
    ctx.beginPath();
    ctx.moveTo(x, y);
    for (let s = 0; s < segments; s++) {
      angle += (rng() - 0.5) * 1.5;
      const step = size * (0.012 + rng() * 0.045);
      x += Math.cos(angle) * step;
      y += Math.sin(angle) * step;
      ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

interface TextureSet {
  color: THREE.CanvasTexture;
  bump: THREE.CanvasTexture;
  rough: THREE.CanvasTexture;
}

const SURFACE_SEED: Record<SurfaceKind, number> = {
  concrete: 11,
  brick: 23,
  wood: 37,
  steel: 41,
  asphalt: 53,
  facade: 67,
  fabric: 71,
  rust: 83,
};

const textureCache = new Map<SurfaceKind, TextureSet>();

/** Build (once per kind) the color / bump / roughness canvas textures. */
function buildTextureSet(kind: SurfaceKind): TextureSet {
  const cached = textureCache.get(kind);
  if (cached) return cached;

  const S = 256;
  const rng = mulberry32(SURFACE_SEED[kind]);
  const noise = fbm(S, SURFACE_SEED[kind]);

  const colorC = makeCanvas(S);
  const bumpC = makeCanvas(S);
  const roughC = makeCanvas(S);
  const colorImg = colorC.ctx.createImageData(S, S);
  const bumpImg = bumpC.ctx.createImageData(S, S);
  const roughImg = roughC.ctx.createImageData(S, S);

  const palettes: Record<SurfaceKind, [number, number, number]> = {
    concrete: [163, 166, 163],
    brick: [158, 91, 72],
    wood: [160, 121, 76],
    steel: [126, 139, 153],
    asphalt: [82, 87, 93],
    facade: [174, 168, 154],
    fabric: [49, 112, 82],
    rust: [132, 84, 58],
  };
  const [br, bg, bb] = palettes[kind];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      let n = noise[i];
      let pattern = 0;

      if (kind === 'brick') {
        const row = Math.floor(y / 32);
        const offset = row % 2 === 0 ? 0 : 30;
        const bx = (x + offset) % 60;
        const by = y % 32;
        const mortar = bx < 3 || by < 3 ? 1 : 0;
        pattern = mortar ? -0.35 : 0.08 * Math.sin(row * 2.3 + x * 0.09);
      } else if (kind === 'wood') {
        const grain = Math.sin(y * 0.9 + Math.sin(x * 0.035) * 3.5) * 0.5 + 0.5;
        pattern = (grain - 0.5) * 0.28 + (y % 64 < 2 ? -0.28 : 0);
      } else if (kind === 'steel') {
        pattern = Math.sin(x * 1.9 + noise[i] * 7) * 0.055;
      } else if (kind === 'fabric') {
        pattern = (x % 4 < 2 ? 0.04 : -0.04) + (y % 4 < 2 ? 0.04 : -0.04);
      } else if (kind === 'rust') {
        pattern = n > 0.62 ? 0.14 : -0.1;
      }

      n = clamp(n * 0.72 + 0.18 + pattern);
      const shade = 0.62 + n * 0.72;
      const p = i * 4;
      colorImg.data[p] = clamp(br * shade, 0, 255);
      colorImg.data[p + 1] = clamp(bg * shade, 0, 255);
      colorImg.data[p + 2] = clamp(bb * shade, 0, 255);
      colorImg.data[p + 3] = 255;

      const h = clamp(0.28 + n * 0.72) * 255;
      bumpImg.data[p] = h;
      bumpImg.data[p + 1] = h;
      bumpImg.data[p + 2] = h;
      bumpImg.data[p + 3] = 255;

      const r = clamp(0.72 + n * 0.28) * 255;
      roughImg.data[p] = r;
      roughImg.data[p + 1] = r;
      roughImg.data[p + 2] = r;
      roughImg.data[p + 3] = 255;
    }
  }
  colorC.ctx.putImageData(colorImg, 0, 0);
  bumpC.ctx.putImageData(bumpImg, 0, 0);
  roughC.ctx.putImageData(roughImg, 0, 0);

  // Painted / structural detail on top of the noise
  const c = colorC.ctx;
  const b = bumpC.ctx;
  const seed2 = SURFACE_SEED[kind];

  if (kind === 'concrete' || kind === 'facade' || kind === 'asphalt') {
    drawCrack(c, mulberry32(seed2 + 7), S, kind === 'asphalt' ? 8 : 5, 'rgba(24,26,29,0.55)', 1.1);
    drawCrack(b, mulberry32(seed2 + 7), S, kind === 'asphalt' ? 8 : 5, 'rgba(20,20,20,0.85)', 1.8);
    for (let i = 0; i < 26; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const rad = 8 + rng() * 32;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(28,30,32,${0.05 + rng() * 0.12})`);
      g.addColorStop(1, 'rgba(28,30,32,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // exposed aggregate
    for (let i = 0; i < 420; i++) {
      c.fillStyle = `rgba(${190 + rng() * 50},${185 + rng() * 50},${175 + rng() * 50},${0.05 + rng() * 0.16})`;
      c.fillRect(rng() * S, rng() * S, 1 + rng() * 2, 1 + rng() * 2);
    }
  }

  if (kind === 'brick') {
    drawCrack(c, mulberry32(seed2 + 3), S, 4, 'rgba(45,28,24,0.5)', 1.2);
    // chipped brick edges
    for (let i = 0; i < 90; i++) {
      c.fillStyle = `rgba(214,158,133,${0.05 + rng() * 0.18})`;
      c.fillRect(rng() * S, rng() * S, 2 + rng() * 5, 1 + rng() * 2);
    }
  }

  if (kind === 'wood') {
    for (let i = 0; i < 6; i++) {
      const x = rng() * S;
      const y = rng() * S;
      c.strokeStyle = 'rgba(64,42,25,0.45)';
      c.lineWidth = 1.6;
      c.beginPath();
      c.ellipse(x, y, 5 + rng() * 7, 2 + rng() * 3, rng(), 0, Math.PI * 2);
      c.stroke();
    }
    drawCrack(c, mulberry32(seed2 + 11), S, 5, 'rgba(58,38,22,0.4)', 0.9);
  }

  if (kind === 'steel' || kind === 'rust') {
    for (let i = 0; i < 34; i++) {
      const x = rng() * S;
      const y = rng() * S;
      const rad = 4 + rng() * 20;
      const g = c.createRadialGradient(x, y, 0, x, y, rad);
      g.addColorStop(0, `rgba(150,72,32,${0.16 + rng() * 0.28})`);
      g.addColorStop(1, 'rgba(150,72,32,0)');
      c.fillStyle = g;
      c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // rivets / bolts
    if (kind === 'steel') {
      c.strokeStyle = 'rgba(30,36,42,0.5)';
      c.lineWidth = 1.5;
      for (let y = 18; y < S; y += 64) {
        for (let x = 18; x < S; x += 64) {
          c.beginPath();
          c.arc(x, y, 3.2, 0, Math.PI * 2);
          c.stroke();
        }
      }
    }
  }

  if (kind === 'fabric') {
    c.strokeStyle = 'rgba(18,52,38,0.35)';
    c.lineWidth = 2;
    for (let x = 0; x < S; x += 32) {
      c.beginPath();
      c.moveTo(x, 0);
      c.lineTo(x, S);
      c.stroke();
    }
  }

  const set: TextureSet = {
    color: toTexture(colorC.canvas, true),
    bump: toTexture(bumpC.canvas, false),
    rough: toTexture(roughC.canvas, false),
  };
  textureCache.set(kind, set);
  return set;
}

function cloneWithRepeat(tex: THREE.Texture, rx: number, ry: number): THREE.Texture {
  const clone = tex.clone();
  clone.wrapS = THREE.RepeatWrapping;
  clone.wrapT = THREE.RepeatWrapping;
  clone.repeat.set(Math.max(0.15, rx), Math.max(0.15, ry));
  clone.anisotropy = 8;
  clone.needsUpdate = true;
  return clone;
}

/** Create a PBR surface material whose textures tile according to real size. */
export function createSurfaceMaterial(
  kind: SurfaceKind,
  repeatX = 1,
  repeatY = 1
): THREE.MeshStandardMaterial {
  const set = buildTextureSet(kind);
  const mat = new THREE.MeshStandardMaterial({
    map: cloneWithRepeat(set.color, repeatX, repeatY),
    bumpMap: cloneWithRepeat(set.bump, repeatX, repeatY),
    roughnessMap: cloneWithRepeat(set.rough, repeatX, repeatY),
    bumpScale: kind === 'brick' ? 0.055 : kind === 'steel' ? 0.012 : 0.032,
    roughness: kind === 'steel' ? 0.48 : kind === 'fabric' ? 0.86 : 0.92,
    metalness: kind === 'steel' ? 0.78 : kind === 'rust' ? 0.38 : 0.04,
    color: 0xffffff,
    envMapIntensity: kind === 'steel' ? 1.45 : 0.7,
  });
  return mat;
}

/* ------------------------- ground overlays ------------------------ */

/** Worn road paint, cracks, puddle stains and hazard marks (transparent). */
export function createGroundOverlayTexture(): THREE.CanvasTexture {
  const S = 1024;
  const { canvas, ctx } = makeCanvas(S);
  const rng = mulberry32(2027);
  ctx.clearRect(0, 0, S, S);

  // Faded lane divider (rotated with the avenue)
  ctx.save();
  ctx.globalAlpha = 0.34;
  ctx.fillStyle = '#d7d3bd';
  for (let y = -40; y < S + 40; y += 84) {
    ctx.fillRect(S * 0.495 + Math.sin(y * 0.01) * 8, y, 9, 48);
  }
  ctx.restore();

  // Worn crosswalk near the command base
  ctx.save();
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#e8e4d0';
  for (let i = 0; i < 9; i++) {
    ctx.fillRect(S * 0.24 + i * 62, S * 0.77, 34, 82);
  }
  ctx.restore();

  // Hazard chevrons around collapsed sectors
  ctx.save();
  ctx.globalAlpha = 0.18;
  ctx.strokeStyle = '#f5c451';
  ctx.lineWidth = 7;
  for (let i = 0; i < 7; i++) {
    ctx.beginPath();
    ctx.arc(S * 0.36, S * 0.42, 46 + i * 14, -0.4, 1.9);
    ctx.stroke();
  }
  ctx.restore();

  // Long meandering cracks
  drawCrack(ctx, mulberry32(991), S, 46, 'rgba(15,17,20,0.62)', 2.1);
  drawCrack(ctx, mulberry32(1991), S, 32, 'rgba(180,176,162,0.14)', 1);

  // Dust / damp patches
  for (let i = 0; i < 90; i++) {
    const x = rng() * S;
    const y = rng() * S;
    const r = 12 + rng() * 80;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    const dark = rng() > 0.45;
    g.addColorStop(0, dark ? 'rgba(18,22,27,0.30)' : 'rgba(163,148,120,0.20)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }

  // Survey / rescue grid markings
  ctx.save();
  ctx.globalAlpha = 0.12;
  ctx.strokeStyle = '#9fd8ff';
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 16]);
  for (let i = 1; i < 8; i++) {
    ctx.beginPath();
    ctx.moveTo((i * S) / 8, 0);
    ctx.lineTo((i * S) / 8, S);
    ctx.moveTo(0, (i * S) / 8);
    ctx.lineTo(S, (i * S) / 8);
    ctx.stroke();
  }
  ctx.restore();

  return toTexture(canvas, true);
}

/* ---------------------------- sprites ----------------------------- */

function radialTexture(
  size: number,
  stops: [number, string][]
): THREE.CanvasTexture {
  const { canvas, ctx } = makeCanvas(size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  stops.forEach(([p, c]) => g.addColorStop(p, c));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createDustTexture(): THREE.CanvasTexture {
  return radialTexture(64, [
    [0, 'rgba(255,248,229,1)'],
    [0.25, 'rgba(226,215,190,0.72)'],
    [0.65, 'rgba(190,180,160,0.18)'],
    [1, 'rgba(190,180,160,0)'],
  ]);
}

export function createGlowTexture(): THREE.CanvasTexture {
  return radialTexture(128, [
    [0, 'rgba(255,255,255,1)'],
    [0.12, 'rgba(255,240,205,0.85)'],
    [0.38, 'rgba(255,190,110,0.25)'],
    [1, 'rgba(255,170,80,0)'],
  ]);
}

export function createSmokeTexture(): THREE.CanvasTexture {
  const S = 128;
  const { canvas, ctx } = makeCanvas(S);
  const rng = mulberry32(777);
  ctx.clearRect(0, 0, S, S);
  for (let i = 0; i < 16; i++) {
    const x = S / 2 + (rng() - 0.5) * 46;
    const y = S / 2 + (rng() - 0.5) * 46;
    const r = 20 + rng() * 34;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(150,148,142,${0.05 + rng() * 0.1})`);
    g.addColorStop(1, 'rgba(120,120,118,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* -------------------------- sky & lighting ------------------------ */

const SKY_VERT = /* glsl */ `
  uniform float uYaw;
  varying vec3 vWorldDir;
  void main() {
    // Optional VR stick-turn yaw: rotate the procedural sky pattern so the
    // sun and clouds follow the world instead of staying glued to the visor.
    float c = cos(uYaw);
    float s = sin(uYaw);
    vWorldDir = vec3(
      c * position.x + s * position.z,
      position.y,
      -s * position.x + c * position.z
    );
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_Position.z = gl_Position.w; // force sky to far plane
  }
`;

const SKY_FRAG = /* glsl */ `
  precision highp float;
  varying vec3 vWorldDir;
  uniform float uTime;
  uniform vec3 uSunDir;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uHaze;
  uniform vec3 uSunColor;
  uniform vec3 uCloudColor;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),
               mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.02 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec3 dir = normalize(vWorldDir);
    float up = max(dir.y, 0.0);
    vec3 sky = mix(uHorizon, uZenith, pow(up, 0.62));

    // Warm dusty haze hugging the horizon
    sky = mix(sky, uHaze, exp(-abs(dir.y) * 8.5) * 0.38);

    // Sun disc, inner glow and broad atmospheric scattering
    float sd = max(dot(dir, normalize(uSunDir)), 0.0);
    sky += uSunColor * pow(sd, 1400.0) * 3.4;
    sky += uSunColor * pow(sd, 42.0) * 0.3;
    sky += uSunColor * pow(sd, 6.0) * 0.05;

    // Slow drifting high clouds
    vec2 cuv = dir.xz / max(dir.y + 0.22, 0.08);
    float drift = uTime * 0.0035;
    float clouds = fbm(cuv * 0.85 + vec2(drift, drift * 0.42));
    clouds += fbm(cuv * 2.1 - vec2(drift * 1.7, 0.0)) * 0.25;
    clouds = smoothstep(0.55, 0.96, clouds) * smoothstep(0.0, 0.34, dir.y);
    vec3 litCloud = uCloudColor * (0.6 + 0.75 * pow(sd, 3.0));
    sky = mix(sky, litCloud, clouds * 0.62);

    // Fine aerial grain to avoid banding
    float grain = (hash(gl_FragCoord.xy + uTime) - 0.5) * 0.012;
    gl_FragColor = vec4(max(sky + grain, vec3(0.0)), 1.0);
  }
`;

export interface SkyDomeHandle {
  mesh: THREE.Mesh;
  update: (elapsedSec: number) => void;
  dispose: () => void;
}

export function createSkyDome(sunDirection: THREE.Vector3): SkyDomeHandle {
  const uniforms = {
    uTime: { value: 0 },
    uYaw: { value: 0 },
    uSunDir: { value: sunDirection.clone().normalize() },
    uZenith: { value: new THREE.Color(0x243b63) },
    uHorizon: { value: new THREE.Color(0x6d6b76) },
    uHaze: { value: new THREE.Color(0xa8886f) },
    uSunColor: { value: new THREE.Color(0xffa860) },
    uCloudColor: { value: new THREE.Color(0x9aa5b5) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: SKY_VERT,
    fragmentShader: SKY_FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(400, 40, 24), material);
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.name = 'WTS_SkyDome';
  return {
    mesh,
    update: (elapsedSec: number) => {
      uniforms.uTime.value = elapsedSec;
    },
    dispose: () => {
      mesh.geometry.dispose();
      material.dispose();
    },
  };
}

/** PMREM reflection probe built from a painted equirectangular sky. */
export function createReflectionEnvironment(
  renderer: THREE.WebGLRenderer
): THREE.Texture {
  const W = 512;
  const H = 256;
  const { canvas, ctx } = makeCanvas(W, H);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#203757');
  grad.addColorStop(0.42, '#61708a');
  grad.addColorStop(0.52, '#c69a75');
  grad.addColorStop(0.68, '#8e8179');
  grad.addColorStop(1, '#3a3a3c');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Bright sun / soft box lights for crisp specular highlights
  const sunX = W * 0.72;
  const sunY = H * 0.4;
  const sun = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, 72);
  sun.addColorStop(0, 'rgba(255,247,225,1)');
  sun.addColorStop(0.25, 'rgba(255,210,150,0.8)');
  sun.addColorStop(1, 'rgba(255,190,120,0)');
  ctx.fillStyle = sun;
  ctx.fillRect(sunX - 72, sunY - 72, 144, 144);

  const cool = ctx.createRadialGradient(W * 0.2, H * 0.32, 4, W * 0.2, H * 0.32, 110);
  cool.addColorStop(0, 'rgba(180,215,255,0.55)');
  cool.addColorStop(1, 'rgba(150,190,255,0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, W * 0.6, H * 0.8);

  const source = new THREE.CanvasTexture(canvas);
  source.mapping = THREE.EquirectangularReflectionMapping;
  source.colorSpace = THREE.SRGBColorSpace;
  const pmrem = new THREE.PMREMGenerator(renderer);
  pmrem.compileEquirectangularShader();
  const env = pmrem.fromEquirectangular(source).texture;
  pmrem.dispose();
  source.dispose();
  return env;
}

/* ------------------------ post-processing ------------------------- */

export const CINEMATIC_SHADER = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uVignette: { value: 0.9 },
    uGrain: { value: 0.035 },
    uAberration: { value: 0.0016 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    precision highp float;
    uniform sampler2D tDiffuse;
    uniform float uTime;
    uniform float uVignette;
    uniform float uGrain;
    uniform float uAberration;
    varying vec2 vUv;

    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453);
    }

    void main() {
      vec2 uv = vUv;
      vec2 fromCenter = uv - 0.5;
      float r2 = dot(fromCenter, fromCenter);

      // Very subtle chromatic aberration towards the edges
      vec2 offset = fromCenter * uAberration * (0.4 + r2 * 4.0);
      vec3 col;
      col.r = texture2D(tDiffuse, uv + offset).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - offset).b;

      // Cinematic vignette
      float vig = 1.0 - uVignette * smoothstep(0.18, 0.86, r2);
      col *= vig;

      // Animated film grain (kept very light so dark HUD text stays crisp)
      float g = (hash(uv * 1024.0 + fract(uTime) * 97.0) - 0.5) * uGrain;
      col += g;

      gl_FragColor = vec4(max(col, vec3(0.0)), 1.0);
    }
  `,
};
