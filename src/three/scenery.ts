import * as THREE from 'three';
import { ObstacleZone } from '../types/wts';
import {
  GraphicsQuality,
  createDustTexture,
  createGlowTexture,
  createGroundOverlayTexture,
  createSmokeTexture,
  createSurfaceMaterial,
} from './visualAssets';

/* ------------------------------------------------------------------ *
 * WTS · DISASTER SCENERY
 * A handcrafted, fully procedural post-earthquake city block.
 * ------------------------------------------------------------------ */

type Rng = () => number;

function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface SceneryHandle {
  dustParticles: THREE.Points;
  update: (elapsedSec: number, dt: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
  dispose: () => void;
}

export interface BeaconMarkerHandle {
  root: THREE.Group;
  update: (
    elapsedSec: number,
    active: boolean,
    sos: boolean,
    showColumn: boolean
  ) => void;
  dispose: () => void;
}

export interface SceneryBuildOptions {
  obstacles: ObstacleZone[];
  beacons: { x: number; z: number }[];
  dustTexture: THREE.Texture;
  glowTexture: THREE.Texture;
  smokeTexture: THREE.Texture;
}

/* --------------------------- shared helpers ----------------------- */

const BEAM_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAG = /* glsl */ `
  precision highp float;
  varying vec2 vUv;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uOpacity;
  void main() {
    float fade = pow(1.0 - vUv.y, 1.7);
    float pulse = 0.78 + 0.22 * sin(uTime * 2.6 - vUv.y * 9.0);
    float edge = 0.55 + 0.45 * sin(vUv.x * 6.2831 * 3.0 + uTime);
    float alpha = fade * pulse * (0.68 + 0.32 * edge) * uOpacity;
    gl_FragColor = vec4(uColor * (0.7 + fade * 0.8), alpha);
  }
`;

function additiveGlowSprite(
  texture: THREE.Texture,
  color: number,
  size: number
): THREE.Sprite {
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      color,
      transparent: true,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      opacity: 0.85,
      toneMapped: false,
    })
  );
  sprite.scale.set(size, size, 1);
  return sprite;
}

function makeLabelSprite(text: string): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 92;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = 'rgba(8,20,30,0.78)';
  ctx.beginPath();
  ctx.roundRect(6, 8, 308, 74, 18);
  ctx.fill();
  ctx.strokeStyle = 'rgba(125,230,255,0.9)';
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.fillStyle = '#e7f9ff';
  ctx.font = 'bold 38px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 160, 46);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthWrite: false,
      depthTest: false,
      toneMapped: false,
    })
  );
  sprite.scale.set(1.5, 0.43, 1);
  return sprite;
}

/* --------------------------- beacon marker ------------------------ */

export function createBeaconMarker(
  id: string,
  glowTexture: THREE.Texture
): BeaconMarkerHandle {
  const root = new THREE.Group();
  const disposables: (THREE.BufferGeometry | THREE.Material | THREE.Texture)[] = [];

  const beamMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(0x36d6ff) },
      uTime: { value: 0 },
      uOpacity: { value: 1 },
    },
    vertexShader: BEAM_VERT,
    fragmentShader: BEAM_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const beamGeo = new THREE.CylinderGeometry(0.07, 0.5, 4.6, 20, 1, true);
  const beam = new THREE.Mesh(beamGeo, beamMat);
  beam.position.y = 2.3;
  root.add(beam);
  disposables.push(beamGeo, beamMat);

  const haloGeo = new THREE.RingGeometry(0.55, 0.78, 48);
  haloGeo.rotateX(-Math.PI / 2);
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0x38d7ff,
    transparent: true,
    opacity: 0.5,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const halo = new THREE.Mesh(haloGeo, haloMat);
  halo.position.y = 0.035;
  root.add(halo);
  disposables.push(haloGeo, haloMat);

  const ringGeo = new THREE.RingGeometry(1.0, 1.07, 56);
  ringGeo.rotateX(-Math.PI / 2);
  const ringMat = new THREE.MeshBasicMaterial({
    color: 0x38d7ff,
    transparent: true,
    opacity: 0.24,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  ring.position.y = 0.04;
  root.add(ring);
  disposables.push(ringGeo, ringMat);

  const glow = additiveGlowSprite(glowTexture, 0x59e3ff, 1.9);
  glow.position.y = 2.9;
  root.add(glow);

  const label = makeLabelSprite(id);
  label.position.y = 3.55;
  root.add(label);

  return {
    root,
    update: (elapsedSec, active, sos, showColumn) => {
      root.visible = active;
      // Tall light columns are a tactical/educational aid only: they must not
      // give away survivor positions during first-person RSSI navigation.
      beam.visible = showColumn;
      glow.visible = showColumn;
      label.visible = showColumn;
      if (!active) return;
      const color = sos ? 0xff9a3c : 0x38d7ff;
      beamMat.uniforms.uTime.value = elapsedSec;
      beamMat.uniforms.uColor.value.setHex(color);
      beamMat.uniforms.uOpacity.value = 0.85 + 0.15 * Math.sin(elapsedSec * 3);
      haloMat.color.setHex(color);
      ringMat.color.setHex(color);
      (glow.material as THREE.SpriteMaterial).color.setHex(color);
      const pulse = 0.55 + 0.35 * Math.sin(elapsedSec * 2.8);
      haloMat.opacity = (0.25 + pulse * 0.4) * (showColumn ? 1 : 0.4);
      halo.scale.setScalar(1 + 0.14 * Math.sin(elapsedSec * 2.8));
      ring.rotation.y = elapsedSec * 0.35;
      ringMat.opacity =
        (0.16 + 0.16 * (0.5 + 0.5 * Math.sin(elapsedSec * 1.6))) *
        (showColumn ? 1 : 0.5);
      glow.scale.setScalar(1.7 + 0.32 * Math.sin(elapsedSec * 2.4));
      (glow.material as THREE.SpriteMaterial).opacity = 0.55 + 0.3 * pulse;
      label.position.y = 3.55 + Math.sin(elapsedSec * 1.4) * 0.06;
    },
    dispose: () => {
      disposables.forEach((d) => d.dispose());
      (glow.material as THREE.SpriteMaterial).dispose();
      const lm = label.material as THREE.SpriteMaterial;
      lm.map?.dispose();
      lm.dispose();
    },
  };
}

/* ----------------------------- buildings -------------------------- */

function createDamagedBuilding(
  w: number,
  h: number,
  d: number,
  rng: Rng
): THREE.Group {
  const group = new THREE.Group();
  const facadeMat = createSurfaceMaterial('facade', w / 4, h / 4);
  const concreteMat = createSurfaceMaterial('concrete', w / 3, 1);
  const rustMat = createSurfaceMaterial('rust', 1, 2);

  const bodyH = h * 0.74;
  const body = new THREE.Mesh(new THREE.BoxGeometry(w, bodyH, d), [
    facadeMat,
    facadeMat,
    concreteMat,
    facadeMat,
    facadeMat,
    facadeMat,
  ]);
  body.position.y = bodyH / 2;
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  // Tilted, partially collapsed upper storey
  const topH = h - bodyH;
  const top = new THREE.Mesh(
    new THREE.BoxGeometry(w * 0.86, topH, d * 0.82),
    facadeMat
  );
  top.position.set((rng() - 0.5) * w * 0.18, bodyH + topH / 2, (rng() - 0.5) * d * 0.14);
  top.rotation.z = (rng() - 0.5) * 0.16;
  top.rotation.x = (rng() - 0.5) * 0.08;
  top.castShadow = true;
  top.receiveShadow = true;
  group.add(top);

  // Floor slabs / cornices
  const floors = Math.max(2, Math.floor(bodyH / 2.4));
  for (let i = 1; i < floors; i++) {
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.16, 0.14, d + 0.16),
      concreteMat
    );
    slab.position.y = (i * bodyH) / floors;
    slab.castShadow = true;
    group.add(slab);
  }

  // Windows: instanced dark glass with a few warm emergency lights inside
  const cols = Math.max(2, Math.floor(w / 1.7));
  const rows = Math.max(2, Math.floor(bodyH / 2.4));
  const positions: { p: THREE.Vector3; ry: number; color: THREE.Color }[] = [];
  const winW = Math.min(0.95, (w / cols) * 0.58);
  const winH = Math.min(1.15, (bodyH / rows) * 0.52);

  for (let side = 0; side < 4; side++) {
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (rng() < 0.19) continue; // shattered / missing window
        const y = ((r + 0.52) * bodyH) / rows;
        const along = (c + 0.5) * (side % 2 === 0 ? w : d) / cols - (side % 2 === 0 ? w : d) / 2;
        const p = new THREE.Vector3();
        const off = side % 2 === 0 ? d / 2 + 0.012 : w / 2 + 0.012;
        if (side === 0) p.set(along, y, off);
        else if (side === 1) p.set(off, y, along);
        else if (side === 2) p.set(along, y, -off);
        else p.set(-off, y, along);
        const roll = rng();
        const color =
          roll > 0.9
            ? new THREE.Color(0xffb15c)
            : roll > 0.84
            ? new THREE.Color(0x9ad9ff)
            : new THREE.Color(0x17222f).multiplyScalar(0.6 + rng() * 0.7);
        positions.push({ p, ry: (side * Math.PI) / 2, color });
      }
    }
  }

  const winGeo = new THREE.PlaneGeometry(winW, winH);
  const winMat = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const windows = new THREE.InstancedMesh(winGeo, winMat, positions.length);
  const dummy = new THREE.Object3D();
  positions.forEach((info, idx) => {
    dummy.position.copy(info.p);
    dummy.rotation.set(0, info.ry, 0);
    dummy.updateMatrix();
    windows.setMatrixAt(idx, dummy.matrix);
    windows.setColorAt(idx, info.color);
  });
  windows.instanceMatrix.needsUpdate = true;
  if (windows.instanceColor) windows.instanceColor.needsUpdate = true;
  group.add(windows);

  // Window frames (thin mullions) to sell the depth
  const frameMat = new THREE.MeshStandardMaterial({
    color: 0x2d333a,
    roughness: 0.8,
    metalness: 0.25,
  });
  for (let r = 0; r < rows; r++) {
    const mullion = new THREE.Mesh(
      new THREE.BoxGeometry(w + 0.05, 0.045, d + 0.05),
      frameMat
    );
    mullion.position.y = ((r + 0.52) * bodyH) / rows - winH / 2 - 0.04;
    group.add(mullion);
  }

  // Exposed rebar and rubble on the broken roof
  const rebarGeo = new THREE.CylinderGeometry(0.025, 0.025, 1.1, 6);
  for (let i = 0; i < 7; i++) {
    const bar = new THREE.Mesh(rebarGeo, rustMat);
    bar.position.set(
      (rng() - 0.5) * w * 0.7,
      h + 0.35 + rng() * 0.4,
      (rng() - 0.5) * d * 0.6
    );
    bar.rotation.set((rng() - 0.5) * 0.8, rng() * Math.PI, (rng() - 0.5) * 0.8);
    group.add(bar);
  }
  for (let i = 0; i < 4; i++) {
    const chunk = new THREE.Mesh(
      new THREE.BoxGeometry(0.6 + rng(), 0.3 + rng() * 0.4, 0.5 + rng()),
      concreteMat
    );
    chunk.position.set((rng() - 0.5) * w * 0.8, h + 0.1, (rng() - 0.5) * d * 0.7);
    chunk.rotation.set(rng(), rng() * Math.PI, rng());
    chunk.castShadow = true;
    group.add(chunk);
  }

  return group;
}

/* ---------------------------- obstacles --------------------------- */

function createObstacleVisual(obs: ObstacleZone, rng: Rng): THREE.Group {
  const group = new THREE.Group();
  group.position.set(obs.x, 0, obs.z);
  group.rotation.y = obs.rotationY ?? 0;

  const W = obs.hx * 2;
  const D = obs.hz * 2;
  const H = obs.height;
  const mat = createSurfaceMaterial(
    obs.material,
    Math.max(1, Math.max(W, D) / 2.6),
    Math.max(1, H / 2.6)
  );
  const edgeMat = createSurfaceMaterial('concrete', 1, 1);
  const rustMat = createSurfaceMaterial('rust', 1, 2);

  const main = new THREE.Mesh(new THREE.BoxGeometry(W, H, D), mat);
  main.position.y = H / 2;
  main.castShadow = true;
  main.receiveShadow = true;
  group.add(main);

  // Dark base contact shadow / grime band
  const skirt = new THREE.Mesh(
    new THREE.BoxGeometry(W + 0.14, 0.16, D + 0.14),
    new THREE.MeshStandardMaterial({ color: 0x2b2d2f, roughness: 1 })
  );
  skirt.position.y = 0.08;
  skirt.receiveShadow = true;
  group.add(skirt);

  if (obs.material === 'concrete') {
    // Collapsed upper slab hanging at an angle
    const cap = new THREE.Mesh(
      new THREE.BoxGeometry(W * 0.96, 0.42, D * 1.08),
      mat
    );
    cap.position.set((rng() - 0.5) * 0.4, H + 0.12, 0);
    cap.rotation.z = (rng() - 0.5) * 0.22;
    cap.castShadow = true;
    group.add(cap);

    // Broken chunks + exposed reinforcement on top
    for (let i = 0; i < 9; i++) {
      const chunk = new THREE.Mesh(
        new THREE.IcosahedronGeometry(0.22 + rng() * 0.36, 0),
        edgeMat
      );
      chunk.position.set(
        (rng() - 0.5) * W * 0.94,
        H + 0.3 + rng() * 0.35,
        (rng() - 0.5) * D * 0.94
      );
      chunk.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      chunk.scale.set(1.4, 0.6, 1);
      chunk.castShadow = true;
      group.add(chunk);
    }
    const rebarGeo = new THREE.CylinderGeometry(0.022, 0.022, 0.9, 6);
    for (let i = 0; i < 6; i++) {
      const bar = new THREE.Mesh(rebarGeo, rustMat);
      bar.position.set(
        (rng() - 0.5) * W * 0.8,
        H + 0.45 + rng() * 0.3,
        (rng() - 0.5) * D * 0.7
      );
      bar.rotation.set((rng() - 0.5) * 1.1, rng() * 3, (rng() - 0.5) * 1.1);
      group.add(bar);
    }
  } else if (obs.material === 'steel') {
    // Twisted I-beam lattice standing in front of the wall
    const steelMat = createSurfaceMaterial('steel', 1, 3);
    for (let i = -2; i <= 2; i++) {
      const beam = new THREE.Mesh(
        new THREE.BoxGeometry(0.16, H + 0.85, 0.16),
        steelMat
      );
      beam.position.set(i * (W * 0.19), (H + 0.85) / 2, D / 2 + 0.1);
      beam.rotation.z = i * 0.11 + (rng() - 0.5) * 0.12;
      beam.castShadow = true;
      group.add(beam);
    }
    for (let i = 0; i < 3; i++) {
      const cross = new THREE.Mesh(
        new THREE.BoxGeometry(W * 0.9, 0.14, 0.18),
        steelMat
      );
      cross.position.set(0, H * (0.25 + i * 0.28), D / 2 + 0.14);
      cross.rotation.z = (rng() - 0.5) * 0.24;
      cross.castShadow = true;
      group.add(cross);
    }
  } else if (obs.material === 'brick') {
    // Rubble crown of loose bricks
    const brickGeo = new THREE.BoxGeometry(0.42, 0.2, 0.24);
    for (let i = 0; i < 18; i++) {
      const brick = new THREE.Mesh(brickGeo, mat);
      brick.position.set(
        (rng() - 0.5) * W * 0.92,
        H + 0.06 + rng() * 0.42,
        (rng() - 0.5) * D * 0.92
      );
      brick.rotation.set(rng() * 0.6, rng() * 3, rng() * 0.6);
      brick.castShadow = true;
      group.add(brick);
    }
  } else {
    // Wooden scaffolding / collapsed planks
    const woodMat = createSurfaceMaterial('wood', 1, 2);
    for (let i = 0; i < 10; i++) {
      const plank = new THREE.Mesh(
        new THREE.BoxGeometry(W * (0.4 + rng() * 0.55), 0.1, 0.22 + rng() * 0.16),
        woodMat
      );
      plank.position.set(
        (rng() - 0.5) * W * 0.5,
        H * (0.2 + rng() * 0.9),
        D / 2 + 0.1 + rng() * 0.2
      );
      plank.rotation.set((rng() - 0.5) * 0.7, (rng() - 0.5) * 0.8, (rng() - 0.5) * 1.5);
      plank.castShadow = true;
      group.add(plank);
    }
  }
  return group;
}

/* -------------------------- command base -------------------------- */

interface AnimatedLight {
  update: (elapsedSec: number) => void;
}

function createCommandBase(group: THREE.Group, glowTexture: THREE.Texture): AnimatedLight[] {
  const animated: AnimatedLight[] = [];
  const base = new THREE.Group();
  base.position.set(0, 0, 21);
  group.add(base);

  // Glowing landing / command pad
  const padGeo = new THREE.RingGeometry(2.55, 3.1, 64);
  padGeo.rotateX(-Math.PI / 2);
  const padMat = new THREE.MeshBasicMaterial({
    color: 0x35f0a0,
    transparent: true,
    opacity: 0.6,
    side: THREE.DoubleSide,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const pad = new THREE.Mesh(padGeo, padMat);
  pad.position.y = 0.035;
  base.add(pad);

  const innerGeo = new THREE.CircleGeometry(2.5, 48);
  innerGeo.rotateX(-Math.PI / 2);
  const innerMat = new THREE.MeshBasicMaterial({
    color: 0x0d5a48,
    transparent: true,
    opacity: 0.2,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const inner = new THREE.Mesh(innerGeo, innerMat);
  inner.position.y = 0.028;
  base.add(inner);

  const dashGeo = new THREE.RingGeometry(3.2, 3.3, 48, 1, 0, Math.PI * 1.35);
  dashGeo.rotateX(-Math.PI / 2);
  const dashMat = padMat.clone();
  const dash = new THREE.Mesh(dashGeo, dashMat);
  dash.position.y = 0.04;
  base.add(dash);
  animated.push({
    update: (t) => {
      dash.rotation.y = t * 0.5;
      padMat.opacity = 0.45 + 0.2 * Math.sin(t * 1.8);
      innerMat.opacity = 0.14 + 0.08 * Math.sin(t * 1.2);
    },
  });

  // Rescue tent (fabric + poles + glowing interior)
  const tent = new THREE.Group();
  tent.position.set(-4.8, 0, 1.5);
  const fabricMat = createSurfaceMaterial('fabric', 3, 3);
  fabricMat.side = THREE.DoubleSide;
  const canopy = new THREE.Mesh(new THREE.ConeGeometry(2.55, 1.75, 4, 1, false), fabricMat);
  canopy.position.y = 2.05;
  canopy.rotation.y = Math.PI / 4;
  canopy.castShadow = true;
  tent.add(canopy);

  const wallMat = createSurfaceMaterial('fabric', 2, 1);
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(2.5, 2.5, 1.2, 4, 1, true), wallMat);
  wall.position.y = 0.6;
  wall.rotation.y = Math.PI / 4;
  wall.castShadow = true;
  tent.add(wall);

  const poleMat = new THREE.MeshStandardMaterial({
    color: 0xb9c3cf,
    roughness: 0.35,
    metalness: 0.8,
  });
  for (let i = 0; i < 4; i++) {
    const a = (i * Math.PI) / 2 + Math.PI / 4;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.9, 8), poleMat);
    pole.position.set(Math.cos(a) * 1.8, 1.45, Math.sin(a) * 1.8);
    pole.castShadow = true;
    tent.add(pole);
  }

  const tentLight = new THREE.PointLight(0xffd9a0, 6, 12, 2);
  tentLight.position.set(0, 1.3, 0);
  tent.add(tentLight);
  const tentGlow = additiveGlowSprite(glowTexture, 0xffca7a, 3.4);
  tentGlow.position.set(0, 1.1, 1.6);
  tent.add(tentGlow);

  // Holographic command table
  const table = new THREE.Mesh(
    new THREE.BoxGeometry(1.7, 0.12, 0.9),
    new THREE.MeshStandardMaterial({ color: 0x2a3540, roughness: 0.5, metalness: 0.5 })
  );
  table.position.set(0.6, 0.92, 0.9);
  table.castShadow = true;
  tent.add(table);
  for (const dx of [-0.7, 0.7]) {
    for (const dz of [-0.32, 0.32]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.9, 0.07), poleMat);
      leg.position.set(0.6 + dx, 0.45, 0.9 + dz);
      tent.add(leg);
    }
  }
  const holoGeo = new THREE.PlaneGeometry(1.45, 0.75);
  holoGeo.rotateX(-Math.PI / 2);
  const holoMat = new THREE.MeshBasicMaterial({
    color: 0x38d7ff,
    transparent: true,
    opacity: 0.32,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const holo = new THREE.Mesh(holoGeo, holoMat);
  holo.position.set(0.6, 1.02, 0.9);
  tent.add(holo);
  animated.push({
    update: (t) => {
      holoMat.opacity = 0.24 + 0.14 * (0.5 + 0.5 * Math.sin(t * 2.2));
      tentLight.intensity = 5.5 + Math.sin(t * 6) * 0.4;
    },
  });
  base.add(tent);

  // Supply crates
  const crateMat = createSurfaceMaterial('wood', 1, 1);
  const crateMetal = new THREE.MeshStandardMaterial({
    color: 0x48545e,
    roughness: 0.55,
    metalness: 0.6,
  });
  for (let i = 0; i < 6; i++) {
    const s = 0.55 + (i % 3) * 0.16;
    const crate = new THREE.Mesh(new THREE.BoxGeometry(s, s * 0.8, s), crateMat);
    crate.position.set(
      2.6 + (i % 3) * 0.85,
      (s * 0.8) / 2 + (i > 2 ? s * 0.8 : 0),
      -1.2 + Math.floor(i / 3) * 0.9
    );
    crate.rotation.y = (i * 0.4) % 1;
    crate.castShadow = true;
    crate.receiveShadow = true;
    base.add(crate);
    const band = new THREE.Mesh(
      new THREE.BoxGeometry(s + 0.02, 0.045, s + 0.02),
      crateMetal
    );
    band.position.copy(crate.position);
    band.position.y += s * 0.22;
    band.rotation.y = crate.rotation.y;
    base.add(band);
  }

  // Floodlight mast + animated emergency beacons
  const mastMat = new THREE.MeshStandardMaterial({
    color: 0x5d6874,
    roughness: 0.42,
    metalness: 0.75,
  });
  const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.11, 5.2, 10), mastMat);
  mast.position.set(3.8, 2.6, 2.8);
  mast.castShadow = true;
  base.add(mast);
  const lampHousing = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.3, 0.42), mastMat);
  lampHousing.position.set(3.8, 5.2, 2.8);
  lampHousing.castShadow = true;
  base.add(lampHousing);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xfff0c8, toneMapped: false });
  const lampGlows: THREE.Sprite[] = [];
  for (let i = -1; i <= 1; i++) {
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.06, 0.3), lampMat);
    lamp.position.set(3.8 + i * 0.5, 5.03, 2.85);
    base.add(lamp);
    const glow = additiveGlowSprite(glowTexture, 0xffe6b0, 2.2);
    glow.position.set(3.8 + i * 0.5, 5.0, 3.1);
    base.add(glow);
    lampGlows.push(glow);
  }
  const floodLight = new THREE.SpotLight(0xffd9a8, 45, 22, Math.PI / 5, 0.55, 1.6);
  floodLight.position.set(3.8, 5.2, 2.8);
  floodLight.target.position.set(-1.5, 0, 0);
  base.add(floodLight, floodLight.target);

  const flashMats: THREE.MeshBasicMaterial[] = [];
  const flashSprites: THREE.Sprite[] = [];
  for (const [x, z, color] of [
    [-2.6, -1.9, 0xff3b30],
    [2.9, -1.9, 0x2f81ff],
  ] as [number, number, number][]) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.9, 8), mastMat);
    pole.position.set(x, 0.95, z);
    base.add(pole);
    const mat = new THREE.MeshBasicMaterial({ color, toneMapped: false });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
    bulb.position.set(x, 1.95, z);
    base.add(bulb);
    const sprite = additiveGlowSprite(glowTexture, color, 1.5);
    sprite.position.copy(bulb.position);
    base.add(sprite);
    flashMats.push(mat);
    flashSprites.push(sprite);
  }
  animated.push({
    update: (t) => {
      const a = Math.max(0, Math.sin(t * 5.5));
      const b = Math.max(0, Math.sin(t * 5.5 + Math.PI));
      flashMats[0].color.setRGB(0.2 + a * 1.4, 0.05, 0.04);
      flashMats[1].color.setRGB(0.04, 0.16 + b * 0.9, 0.2 + b * 1.5);
      (flashSprites[0].material as THREE.SpriteMaterial).opacity = 0.12 + a * 0.85;
      (flashSprites[1].material as THREE.SpriteMaterial).opacity = 0.12 + b * 0.85;
      lampGlows.forEach((g, i) => {
        (g.material as THREE.SpriteMaterial).opacity = 0.55 + 0.08 * Math.sin(t * 3 + i);
      });
    },
  });

  return animated;
}

/* --------------------------- street props ------------------------- */

function createStreetProps(group: THREE.Group, glowTexture: THREE.Texture): void {
  const rng = seeded(4242);
  const metalMat = new THREE.MeshStandardMaterial({
    color: 0x4a545f,
    roughness: 0.45,
    metalness: 0.72,
  });
  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffd9a0, toneMapped: false });
  const coneMat = new THREE.MeshStandardMaterial({ color: 0xf27124, roughness: 0.72 });
  const coneStripeMat = new THREE.MeshStandardMaterial({ color: 0xf4f0e4, roughness: 0.7 });
  const rubberMat = new THREE.MeshStandardMaterial({ color: 0x17191c, roughness: 0.95 });
  const glassMat = new THREE.MeshStandardMaterial({
    color: 0x1c2a34,
    roughness: 0.16,
    metalness: 0.4,
    envMapIntensity: 1.6,
  });

  // Street lamps along the avenues
  const lampSpots: [number, number][] = [
    [-24, 12], [-24, -6], [-24, -22],
    [24, 14], [24, -4], [24, -22],
    [-8, 27], [10, 27],
  ];
  for (const [x, z] of lampSpots) {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.095, 5.4, 8), metalMat);
    pole.position.set(x, 2.7, z);
    pole.castShadow = true;
    group.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.09, 0.09), metalMat);
    arm.position.set(x + 0.52, 5.35, z);
    group.add(arm);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.34), lampMat);
    lamp.position.set(x + 1.0, 5.27, z);
    group.add(lamp);
    const glow = additiveGlowSprite(glowTexture, 0xffcb82, 2.6);
    glow.position.set(x + 1.0, 5.1, z);
    group.add(glow);
  }

  // Traffic cones
  const coneGeo = new THREE.ConeGeometry(0.25, 0.72, 12);
  const stripeGeo = new THREE.CylinderGeometry(0.16, 0.19, 0.1, 12);
  for (let i = 0; i < 18; i++) {
    const x = (rng() - 0.5) * 52;
    const z = (rng() - 0.5) * 52;
    const cone = new THREE.Mesh(coneGeo, coneMat);
    cone.position.set(x, 0.36, z);
    cone.castShadow = true;
    group.add(cone);
    const stripe = new THREE.Mesh(stripeGeo, coneStripeMat);
    stripe.position.set(x, 0.42, z);
    group.add(stripe);
    const base = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.05, 0.52), coneMat);
    base.position.set(x, 0.025, z);
    group.add(base);
  }

  // Abandoned rescue vehicles (simple but readable silhouettes)
  const carBodyMat = new THREE.MeshStandardMaterial({
    color: 0xb9c2c9,
    roughness: 0.55,
    metalness: 0.42,
  });
  const cars: [number, number, number][] = [
    [-22, 3, 0.5], [21, 9, -0.4], [5, 26, 0.2], [-3, -26, -0.7],
  ];
  for (const [x, z, rot] of cars) {
    const car = new THREE.Group();
    car.position.set(x, 0, z);
    car.rotation.y = rot;
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.6, 3.9), carBodyMat);
    body.position.y = 0.68;
    body.castShadow = true;
    car.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 1.9), glassMat);
    cabin.position.set(0, 1.24, -0.2);
    cabin.castShadow = true;
    car.add(cabin);
    const wheelGeo = new THREE.CylinderGeometry(0.33, 0.33, 0.18, 14);
    wheelGeo.rotateZ(Math.PI / 2);
    for (const wx of [-0.98, 0.98]) {
      for (const wz of [-1.3, 1.3]) {
        const wheel = new THREE.Mesh(wheelGeo, rubberMat);
        wheel.position.set(wx, 0.34, wz);
        car.add(wheel);
      }
    }
    const lightBar = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.12, 0.16),
      new THREE.MeshBasicMaterial({ color: 0x3a91ff, toneMapped: false })
    );
    lightBar.position.set(0, 1.58, -0.2);
    car.add(lightBar);
    group.add(car);
  }

  // Sidewalk / curb strips framing the main avenue
  const curbMat = createSurfaceMaterial('concrete', 8, 1);
  for (const x of [-13.5, 13.5]) {
    const curb = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.22, 66), curbMat);
    curb.position.set(x, 0.11, 0);
    curb.receiveShadow = true;
    group.add(curb);
  }
}

/* --------------------------- debris field ------------------------- */

function createDebrisField(
  group: THREE.Group,
  beacons: { x: number; z: number }[]
): void {
  const rng = seeded(1985);
  const dummy = new THREE.Object3D();

  const clearSpots = [...beacons, { x: 0, z: 21 }];
  const valid = (x: number, z: number): boolean => {
    if (Math.abs(x) > 34 || Math.abs(z) > 34) return false;
    for (const c of clearSpots) {
      if (Math.hypot(x - c.x, z - c.z) < 3.4) return false;
    }
    return true;
  };

  const scatter = (
    count: number,
    place: (i: number, x: number, z: number) => void
  ) => {
    let placed = 0;
    let guard = 0;
    while (placed < count && guard < count * 20) {
      guard++;
      const x = (rng() - 0.5) * 68;
      const z = (rng() - 0.5) * 68;
      if (!valid(x, z)) continue;
      place(placed, x, z);
      placed++;
    }
    return placed;
  };

  // Concrete chunks
  {
    const count = 210;
    const geo = new THREE.IcosahedronGeometry(0.42, 0);
    const mat = createSurfaceMaterial('concrete', 1, 1);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    const placed = scatter(count, (i, x, z) => {
      const s = 0.25 + rng() * 1.1;
      dummy.position.set(x, s * 0.16, z);
      dummy.rotation.set(rng() * 3, rng() * 3, rng() * 3);
      dummy.scale.set(s * (0.8 + rng()), s * (0.3 + rng() * 0.5), s * (0.8 + rng()));
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      const tint = 0.72 + rng() * 0.5;
      mesh.setColorAt(i, new THREE.Color().setRGB(tint, tint * 0.99, tint * 0.95));
    });
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    group.add(mesh);
  }

  // Loose bricks
  {
    const count = 150;
    const geo = new THREE.BoxGeometry(0.44, 0.2, 0.24);
    const mat = createSurfaceMaterial('brick', 1, 1);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    mesh.receiveShadow = true;
    const placed = scatter(count, (i, x, z) => {
      dummy.position.set(x, 0.1 + rng() * 0.18, z);
      dummy.rotation.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
      dummy.scale.setScalar(0.8 + rng() * 0.7);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Rebar rods
  {
    const count = 70;
    const geo = new THREE.CylinderGeometry(0.024, 0.024, 2.5, 6);
    const mat = createSurfaceMaterial('rust', 1, 2);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const placed = scatter(count, (i, x, z) => {
      dummy.position.set(x, 0.22 + rng() * 0.3, z);
      dummy.rotation.set((rng() - 0.5) * 1.5, rng() * 3, (rng() - 0.5) * 1.5);
      dummy.scale.setScalar(0.6 + rng() * 0.8);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }

  // Wooden planks
  {
    const count = 55;
    const geo = new THREE.BoxGeometry(2.1, 0.09, 0.24);
    const mat = createSurfaceMaterial('wood', 1, 1);
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    const placed = scatter(count, (i, x, z) => {
      dummy.position.set(x, 0.09 + rng() * 0.2, z);
      dummy.rotation.set((rng() - 0.5) * 0.4, rng() * Math.PI, (rng() - 0.5) * 0.5);
      dummy.scale.setScalar(0.7 + rng() * 0.6);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.count = placed;
    mesh.instanceMatrix.needsUpdate = true;
    group.add(mesh);
  }
}

/* ----------------------------- atmosphere ------------------------- */

interface AtmosphereHandle {
  dustParticles: THREE.Points;
  update: (elapsedSec: number, dt: number) => void;
  setQuality: (quality: GraphicsQuality) => void;
}

function createAtmosphere(
  group: THREE.Group,
  dustTexture: THREE.Texture,
  smokeTexture: THREE.Texture
): AtmosphereHandle {
  const rng = seeded(31337);

  // Fine airborne dust (soft round sprites, drifting with the wind)
  const dustCount = 900;
  const dustPos = new Float32Array(dustCount * 3);
  const dustSpeed = new Float32Array(dustCount);
  const dustPhase = new Float32Array(dustCount);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (rng() - 0.5) * 78;
    dustPos[i * 3 + 1] = 0.25 + rng() * 12;
    dustPos[i * 3 + 2] = (rng() - 0.5) * 78;
    dustSpeed[i] = 0.12 + rng() * 0.5;
    dustPhase[i] = rng() * Math.PI * 2;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute('position', new THREE.BufferAttribute(dustPos, 3));
  const dustMat = new THREE.PointsMaterial({
    map: dustTexture,
    color: 0xd9cdb6,
    size: 0.16,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
    blending: THREE.NormalBlending,
  });
  const dust = new THREE.Points(dustGeo, dustMat);
  dust.frustumCulled = false;
  group.add(dust);

  // Glowing embers (additive)
  const emberCount = 170;
  const emberPos = new Float32Array(emberCount * 3);
  const emberSpeed = new Float32Array(emberCount);
  for (let i = 0; i < emberCount; i++) {
    emberPos[i * 3] = (rng() - 0.5) * 62;
    emberPos[i * 3 + 1] = rng() * 7;
    emberPos[i * 3 + 2] = (rng() - 0.5) * 62;
    emberSpeed[i] = 0.28 + rng() * 0.85;
  }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute('position', new THREE.BufferAttribute(emberPos, 3));
  const emberMat = new THREE.PointsMaterial({
    map: dustTexture,
    color: 0xff9a45,
    size: 0.12,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0.75,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  group.add(embers);

  // Slow dust / smoke plumes over the collapsed sectors
  const plumes: THREE.Sprite[] = [];
  const plumeOrigins: [number, number, number][] = [
    [-9, -11, 1.5], [3, 3, 1.1], [16, -8, 1.3],
    [-17, 10, 1.2], [13, -19, 1.0], [-7, -17, 1.4], [22, -18, 1.2],
  ];
  for (const [x, z, scale] of plumeOrigins) {
    for (let j = 0; j < 2; j++) {
      const sprite = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: smokeTexture,
          color: 0x9b938a,
          transparent: true,
          opacity: 0.2,
          depthWrite: false,
        })
      );
      sprite.scale.set(6 * scale, 6 * scale, 1);
      sprite.position.set(x + (rng() - 0.5) * 3, 2 + j * 2.4, z + (rng() - 0.5) * 3);
      sprite.userData.baseY = sprite.position.y;
      sprite.userData.phase = rng() * 10;
      sprite.userData.speed = 0.16 + rng() * 0.22;
      group.add(sprite);
      plumes.push(sprite);
    }
  }

  // Low-lying ground haze (very subtle volumetric feel)
  const hazeMat = new THREE.MeshBasicMaterial({
    map: dustTexture,
    color: 0xb6a68f,
    transparent: true,
    opacity: 0.1,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const hazePlanes: THREE.Mesh[] = [];
  for (let i = 0; i < 3; i++) {
    const geo = new THREE.PlaneGeometry(54, 54);
    geo.rotateX(-Math.PI / 2);
    const haze = new THREE.Mesh(geo, hazeMat.clone());
    haze.position.y = 0.8 + i * 1.5;
    haze.rotation.y = i * 0.6;
    group.add(haze);
    hazePlanes.push(haze);
  }

  const update = (elapsedSec: number, dt: number) => {
    const dp = dust.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < dustCount; i++) {
      const idx = i * 3;
      dp.array[idx] =
        (dp.array[idx] as number) + (0.22 + dustSpeed[i] * 0.35) * dt;
      dp.array[idx + 1] =
        (dp.array[idx + 1] as number) +
        (Math.sin(elapsedSec * 0.6 + dustPhase[i]) * 0.09 + 0.035) * dt;
      if ((dp.array[idx] as number) > 39) dp.array[idx] = -39;
      if ((dp.array[idx + 1] as number) > 12.5) dp.array[idx + 1] = 0.3;
    }
    dp.needsUpdate = true;

    const ep = embers.geometry.getAttribute('position') as THREE.BufferAttribute;
    for (let i = 0; i < emberCount; i++) {
      const idx = i * 3;
      ep.array[idx + 1] = (ep.array[idx + 1] as number) + emberSpeed[i] * dt;
      ep.array[idx] = (ep.array[idx] as number) + Math.sin(elapsedSec + i) * dt * 0.09;
      if ((ep.array[idx + 1] as number) > 8) {
        ep.array[idx + 1] = 0.1;
        ep.array[idx] = (rng() - 0.5) * 60;
        ep.array[idx + 2] = (rng() - 0.5) * 60;
      }
    }
    ep.needsUpdate = true;
    emberMat.opacity = 0.55 + 0.25 * Math.sin(elapsedSec * 2.1);

    for (const sprite of plumes) {
      const phase = sprite.userData.phase as number;
      const speed = sprite.userData.speed as number;
      const baseY = sprite.userData.baseY as number;
      const cycle = (elapsedSec * speed + phase) % 1;
      const s = 4.5 + cycle * 8;
      sprite.scale.set(s, s, 1);
      sprite.position.y = baseY + cycle * 5;
      sprite.position.x += Math.sin(elapsedSec * 0.3 + phase) * dt * 0.12;
      (sprite.material as THREE.SpriteMaterial).opacity =
        0.23 * Math.sin(cycle * Math.PI);
    }

    hazePlanes.forEach((plane, i) => {
      plane.rotation.y += dt * (0.006 + i * 0.002);
      (plane.material as THREE.MeshBasicMaterial).opacity =
        0.06 + 0.035 * Math.sin(elapsedSec * 0.4 + i);
    });
  };

  const setQuality = (quality: GraphicsQuality) => {
    const factor = quality === 'alta' ? 1 : quality === 'media' ? 0.62 : 0.32;
    dust.geometry.setDrawRange(0, Math.floor(dustCount * factor));
    embers.geometry.setDrawRange(0, Math.floor(emberCount * factor));
    embers.visible = quality !== 'baja';
    plumes.forEach((p, i) => (p.visible = quality !== 'baja' || i % 3 === 0));
    hazePlanes.forEach((h, i) => (h.visible = quality === 'alta' || (quality === 'media' && i < 2)));
    dustMat.opacity = quality === 'baja' ? 0.3 : 0.42;
  };

  return { dustParticles: dust, update, setQuality };
}

/* ----------------------------- builder ---------------------------- */

export function buildScenery(
  world: THREE.Group,
  options: SceneryBuildOptions
): SceneryHandle {
  const rng = seeded(7777);
  const { obstacles, beacons, dustTexture, glowTexture, smokeTexture } = options;

  /* Ground: layered asphalt + painted markings + wet puddles */
  const groundGeo = new THREE.PlaneGeometry(170, 170, 1, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const groundMat = createSurfaceMaterial('asphalt', 34, 34);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.receiveShadow = true;
  ground.position.y = 0;
  world.add(ground);

  const overlayTex = createGroundOverlayTexture();
  const overlayGeo = new THREE.PlaneGeometry(72, 72);
  overlayGeo.rotateX(-Math.PI / 2);
  const overlayMat = new THREE.MeshStandardMaterial({
    map: overlayTex,
    transparent: true,
    opacity: 0.9,
    roughness: 1,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const overlay = new THREE.Mesh(overlayGeo, overlayMat);
  overlay.position.y = 0.012;
  overlay.receiveShadow = true;
  world.add(overlay);

  const grid = new THREE.GridHelper(68, 34, 0x4b90ad, 0x33566a);
  grid.position.y = 0.018;
  const gridMat = grid.material as THREE.Material;
  gridMat.transparent = true;
  gridMat.opacity = 0.12;
  world.add(grid);

  const puddleMat = new THREE.MeshPhysicalMaterial({
    color: 0x33505f,
    roughness: 0.07,
    metalness: 0.2,
    transparent: true,
    opacity: 0.52,
    envMapIntensity: 2.4,
    clearcoat: 1,
    clearcoatRoughness: 0.06,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  for (let i = 0; i < 12; i++) {
    const r = 0.8 + rng() * 2.4;
    const geo = new THREE.CircleGeometry(r, 20);
    geo.rotateX(-Math.PI / 2);
    const puddle = new THREE.Mesh(geo, puddleMat);
    puddle.position.set((rng() - 0.5) * 56, 0.022, (rng() - 0.5) * 56);
    puddle.scale.set(1 + rng() * 0.9, 1, 0.6 + rng() * 0.5);
    puddle.rotation.y = rng() * Math.PI;
    world.add(puddle);
  }

  /* Damaged city skyline */
  const perimeter: [number, number, number, number, number, number][] = [
    [-27, -25, 8, 13, 8, 0.05],
    [26, -25, 9, 11, 8, -0.06],
    [-28, 2, 6, 10, 10, 0.04],
    [28, 6, 7, 12, 9, -0.05],
    [-1, -30, 14, 14, 6, 0.02],
    [-30, -12, 7, 9, 7, 0.07],
    [30, -12, 6, 10, 7, -0.06],
    [-22, 28, 9, 8, 6, -0.03],
    [22, 29, 10, 9, 7, 0.04],
  ];
  for (const [x, z, w, h, d, tilt] of perimeter) {
    const building = createDamagedBuilding(w, h, d, rng);
    building.position.set(x, 0, z);
    building.rotation.set(tilt * 0.4, rng() * 0.5 - 0.25, tilt);
    world.add(building);
  }

  /* RF obstacles with real material detail */
  for (const obs of obstacles) {
    world.add(createObstacleVisual(obs, rng));
  }

  createDebrisField(world, beacons);
  const animatedLights = createCommandBase(world, glowTexture);
  createStreetProps(world, glowTexture);

  /* Atmospheric particles */
  const atmosphere = createAtmosphere(world, dustTexture, smokeTexture);

  return {
    dustParticles: atmosphere.dustParticles,
    update: (elapsedSec, dt) => {
      atmosphere.update(elapsedSec, dt);
      animatedLights.forEach((a) => a.update(elapsedSec));
    },
    setQuality: (quality) => atmosphere.setQuality(quality),
    dispose: () => {
      world.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mats = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        mats.forEach((m) => m.dispose());
      });
      overlayTex.dispose();
    },
  };
}
