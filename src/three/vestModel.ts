import * as THREE from 'three';
import { SurvivorBeacon } from '../types/wts';

export interface Vest3DInstance {
  root: THREE.Group;
  updateFromBeacon: (beacon: SurvivorBeacon, elapsedSec: number) => void;
  highlightPart: (partId: string | null) => void;
}

function createMeshWeaveTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#3a4048';
  ctx.fillRect(0, 0, 128, 128);

  // Breathable honeycomb/grid perforations
  ctx.fillStyle = '#23282e';
  for (let y = 4; y < 128; y += 12) {
    const offset = (y / 12) % 2 === 0 ? 0 : 6;
    for (let x = 4 + offset; x < 128; x += 12) {
      ctx.beginPath();
      ctx.arc(x, y, 3.1, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(4, 3);
  return tex;
}

function createThermalPadCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 160;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  return { canvas, ctx, texture };
}

function drawThermalPad(
  ctx: CanvasRenderingContext2D,
  pwmPulse: number,
  pwmActive: boolean
): void {
  ctx.clearRect(0, 0, 256, 160);

  // Flexible pad background
  const grad = ctx.createLinearGradient(0, 0, 256, 160);
  grad.addColorStop(0, '#cfd6de');
  grad.addColorStop(1, '#aeb8c4');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.roundRect(8, 8, 240, 144, 24);
  ctx.fill();

  ctx.strokeStyle = '#6d7785';
  ctx.lineWidth = 4;
  ctx.stroke();

  // Optical PPG + SpO2 + Temp sensor cluster in upper-right corner of pad
  ctx.fillStyle = '#252b33';
  ctx.beginPath();
  ctx.roundRect(175, 22, 54, 30, 8);
  ctx.fill();

  ctx.fillStyle = '#22c55e';
  ctx.beginPath();
  ctx.arc(191, 37, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = '#ef4444';
  ctx.beginPath();
  ctx.arc(212, 37, 5, 0, Math.PI * 2);
  ctx.fill();

  // Serpentine PWM flexible heating trace (exact visual match to chaleco.png!)
  if (pwmActive && pwmPulse > 0.05) {
    ctx.save();
    ctx.shadowColor = `rgba(255, 88, 28, ${Math.min(1, pwmPulse * 0.95)})`;
    ctx.shadowBlur = 18 * pwmPulse + 4;
  }

  const r = Math.round(165 + 90 * pwmPulse);
  const g = Math.round(78 + 45 * pwmPulse);
  const b = Math.round(48 - 25 * pwmPulse);
  ctx.strokeStyle = pwmActive
    ? `rgb(${r}, ${g}, ${b})`
    : 'rgba(158, 82, 56, 0.72)';
  ctx.lineWidth = 10;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  ctx.beginPath();
  const startX = 32;
  const topY = 58;
  const botY = 128;
  const loops = 5;
  const stepX = 18;

  ctx.moveTo(startX, topY - 18);
  ctx.lineTo(startX, botY);

  for (let i = 0; i < loops; i++) {
    const x0 = startX + i * stepX * 2;
    const xMid = x0 + stepX;
    const x1 = x0 + stepX * 2;
    // Bottom turn
    ctx.arc(x0 + stepX / 2, botY, stepX / 2, Math.PI, 0, true);
    ctx.lineTo(xMid, topY);
    // Top turn
    ctx.arc(xMid + stepX / 2, topY, stepX / 2, Math.PI, 0, false);
    if (i < loops - 1) {
      ctx.lineTo(x1, botY);
    } else {
      ctx.lineTo(x1, botY - 12);
    }
  }
  ctx.stroke();

  if (pwmActive && pwmPulse > 0.05) {
    ctx.restore();
  }
}

function createMcuLabelCanvas(): {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  texture: THREE.CanvasTexture;
} {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 192;
  const ctx = canvas.getContext('2d')!;
  const texture = new THREE.CanvasTexture(canvas);
  return { canvas, ctx, texture };
}

function drawMcuModuleFace(
  ctx: CanvasRenderingContext2D,
  ledColor: string,
  sosAlert: boolean,
  pulse: number
): void {
  ctx.fillStyle = '#3c424b';
  ctx.fillRect(0, 0, 256, 192);

  // Subtle metallic bevel frame
  ctx.strokeStyle = '#5c6573';
  ctx.lineWidth = 8;
  ctx.strokeRect(10, 10, 236, 172);

  // "WTS" bold technical lettering matching chaleco.png
  ctx.fillStyle = '#e5e9f0';
  ctx.font = 'bold 48px Inter, system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('WTS', 128, 72);

  // Slim glowing status LED bar below WTS text
  ctx.save();
  ctx.shadowColor = ledColor;
  ctx.shadowBlur = 16 + pulse * 10;
  ctx.fillStyle = ledColor;
  ctx.beginPath();
  ctx.roundRect(58, 122, 140, 16, 8);
  ctx.fill();
  ctx.restore();

  if (sosAlert) {
    ctx.fillStyle = '#fecaca';
    ctx.font = 'bold 20px Inter, system-ui, sans-serif';
    ctx.fillText('SOS 433 MHz', 128, 158);
  }
}

function tagGroupPart(obj: THREE.Object3D, partId: string): void {
  obj.userData.partId = partId;
  obj.traverse((child) => {
    child.userData.partId = partId;
  });
}

export function createVest3DModel(includeMannequin = true): Vest3DInstance {
  const root = new THREE.Group();

  // 1. Optional technical mannequin torso (sculpted non-graphic anatomical form)
  if (includeMannequin) {
    const mannequinMat = new THREE.MeshStandardMaterial({
      color: 0xdce1e7,
      roughness: 0.72,
      metalness: 0.05,
    });

    const torsoGroup = new THREE.Group();

    // Ribcage / upper chest
    const chestGeo = new THREE.CylinderGeometry(0.22, 0.185, 0.52, 28);
    chestGeo.scale(1.18, 1, 0.74);
    const chest = new THREE.Mesh(chestGeo, mannequinMat);
    chest.position.set(0, 0.08, 0);
    torsoGroup.add(chest);

    // Lower waist
    const waistGeo = new THREE.CylinderGeometry(0.185, 0.19, 0.28, 24);
    waistGeo.scale(1.14, 1, 0.72);
    const waist = new THREE.Mesh(waistGeo, mannequinMat);
    waist.position.set(0, -0.28, 0);
    torsoGroup.add(waist);

    // Shoulders
    const shoulderGeo = new THREE.SphereGeometry(0.115, 20, 16);
    shoulderGeo.scale(1.25, 0.82, 0.88);
    const leftShoulder = new THREE.Mesh(shoulderGeo, mannequinMat);
    leftShoulder.position.set(-0.26, 0.29, -0.01);
    const rightShoulder = new THREE.Mesh(shoulderGeo, mannequinMat);
    rightShoulder.position.set(0.26, 0.29, -0.01);
    torsoGroup.add(leftShoulder, rightShoulder);

    // Upper arms stub
    const armGeo = new THREE.CylinderGeometry(0.078, 0.068, 0.34, 16);
    const leftArm = new THREE.Mesh(armGeo, mannequinMat);
    leftArm.position.set(-0.32, 0.11, -0.01);
    leftArm.rotation.z = -0.14;
    const rightArm = new THREE.Mesh(armGeo, mannequinMat);
    rightArm.position.set(0.32, 0.11, -0.01);
    rightArm.rotation.z = 0.14;
    torsoGroup.add(leftArm, rightArm);

    // Neck
    const neckGeo = new THREE.CylinderGeometry(0.075, 0.09, 0.15, 20);
    const neck = new THREE.Mesh(neckGeo, mannequinMat);
    neck.position.set(0, 0.4, -0.01);
    torsoGroup.add(neck);

    // Smooth featureless display-mannequin head (no facial features)
    const headMat = new THREE.MeshPhysicalMaterial({
      color: 0xe7ebef,
      roughness: 0.55,
      metalness: 0.02,
      clearcoat: 0.25,
      clearcoatRoughness: 0.4,
    });
    const headGeo = new THREE.SphereGeometry(0.145, 28, 22);
    headGeo.scale(0.92, 1.18, 0.96);
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.585, -0.015);
    head.castShadow = true;
    torsoGroup.add(head);

    root.add(torsoGroup);
  }

  // Shared harness materials
  const strapMat = new THREE.MeshStandardMaterial({
    color: 0x2c313a,
    roughness: 0.82,
    metalness: 0.12,
  });

  const meshWeaveTex = createMeshWeaveTexture();
  const breathableMat = new THREE.MeshStandardMaterial({
    map: meshWeaveTex,
    color: 0x4b5360,
    roughness: 0.85,
    metalness: 0.08,
  });

  const darkPolymerMat = new THREE.MeshStandardMaterial({
    color: 0x1e2229,
    roughness: 0.45,
    metalness: 0.35,
  });

  // 2. Breathable chest mesh + adjustable shoulder straps ("tejido")
  const tejidoGroup = new THREE.Group();

  // Upper pectoral breathable mesh panel
  const chestMeshGeo = new THREE.CylinderGeometry(0.228, 0.215, 0.22, 28, 1, true, -0.95, 1.9);
  chestMeshGeo.scale(1.18, 1, 0.77);
  const chestMesh = new THREE.Mesh(chestMeshGeo, breathableMat);
  chestMesh.position.set(0, 0.16, 0);
  chestMesh.material.side = THREE.DoubleSide;
  tejidoGroup.add(chestMesh);

  // Back breathable mesh yoke
  const backMeshGeo = new THREE.CylinderGeometry(
    0.226,
    0.21,
    0.2,
    24,
    1,
    true,
    Math.PI - 0.85,
    1.7
  );
  backMeshGeo.scale(1.18, 1, 0.77);
  const backMesh = new THREE.Mesh(backMeshGeo, breathableMat);
  backMesh.position.set(0, 0.12, 0);
  backMesh.material.side = THREE.DoubleSide;
  tejidoGroup.add(backMesh);

  // Left & right over-shoulder adjustable straps
  const makeShoulderStrap = (sideSign: number) => {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(sideSign * 0.15, 0.05, 0.168),
      new THREE.Vector3(sideSign * 0.18, 0.27, 0.145),
      new THREE.Vector3(sideSign * 0.17, 0.365, 0.0),
      new THREE.Vector3(sideSign * 0.13, 0.25, -0.148),
      new THREE.Vector3(sideSign * 0.05, 0.06, -0.162),
    ]);
    const tubeGeo = new THREE.TubeGeometry(curve, 28, 0.028, 8, false);
    tubeGeo.scale(1.35, 0.45, 1.0);
    const strap = new THREE.Mesh(tubeGeo, strapMat);

    // Slider adjuster buckle on upper front chest
    const slider = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.028, 0.022),
      darkPolymerMat
    );
    slider.position.set(sideSign * 0.175, 0.25, 0.152);
    slider.rotation.x = -0.35;

    const grp = new THREE.Group();
    grp.add(strap, slider);
    return grp;
  };

  const rightStrap = makeShoulderStrap(1);
  const leftStrap = makeShoulderStrap(-1);
  tejidoGroup.add(rightStrap, leftStrap);

  // Main wide horizontal chest band
  const mainBandGeo = new THREE.CylinderGeometry(0.222, 0.215, 0.115, 36, 1, true);
  mainBandGeo.scale(1.19, 1, 0.78);
  const mainBand = new THREE.Mesh(mainBandGeo, strapMat);
  mainBand.position.set(0, 0.02, 0);
  mainBand.material.side = THREE.DoubleSide;
  tejidoGroup.add(mainBand);

  tagGroupPart(tejidoGroup, 'tejido');
  root.add(tejidoGroup);

  // 3. Flexible Thermal Layer PWM + Biometric Sensors on Left Pectoral (-X)
  const thermalPadCanvas = createThermalPadCanvas();
  drawThermalPad(thermalPadCanvas.ctx, 0, false);
  thermalPadCanvas.texture.needsUpdate = true;

  const thermalMat = new THREE.MeshStandardMaterial({
    map: thermalPadCanvas.texture,
    emissive: new THREE.Color(0xff5511),
    emissiveMap: thermalPadCanvas.texture,
    emissiveIntensity: 0.05,
    roughness: 0.5,
    metalness: 0.1,
  });

  const thermalGroup = new THREE.Group();
  const padGeo = new THREE.BoxGeometry(0.145, 0.105, 0.018);
  const padMesh = new THREE.Mesh(padGeo, thermalMat);
  padMesh.position.set(-0.115, 0.185, 0.168);
  padMesh.rotation.y = -0.26;
  padMesh.rotation.x = -0.14;
  thermalGroup.add(padMesh);
  tagGroupPart(thermalGroup, 'capa_termica');
  root.add(thermalGroup);

  // Separate clickable sensor lens badge on top corner of pectoral pad ("sensores")
  const sensorGroup = new THREE.Group();
  const sensorBadge = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, 0.028, 0.022),
    new THREE.MeshStandardMaterial({
      color: 0x1e293b,
      emissive: 0x10b981,
      emissiveIntensity: 0.45,
      roughness: 0.3,
    })
  );
  sensorBadge.position.set(-0.155, 0.225, 0.164);
  sensorBadge.rotation.y = -0.32;
  sensorGroup.add(sensorBadge);
  tagGroupPart(sensorGroup, 'sensores');
  root.add(sensorGroup);

  // 4. Central Front MCU + TinyML Module ("WTS")
  const mcuCanvas = createMcuLabelCanvas();
  drawMcuModuleFace(mcuCanvas.ctx, '#38bdf8', false, 0.5);
  mcuCanvas.texture.needsUpdate = true;

  const mcuMaterials = [
    darkPolymerMat,
    darkPolymerMat,
    darkPolymerMat,
    darkPolymerMat,
    new THREE.MeshStandardMaterial({
      map: mcuCanvas.texture,
      roughness: 0.38,
      metalness: 0.25,
    }),
    darkPolymerMat,
  ];

  const mcuGroup = new THREE.Group();
  const mcuBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.115, 0.095, 0.036),
    mcuMaterials
  );
  mcuBox.position.set(-0.065, 0.02, 0.182);
  mcuBox.rotation.y = -0.12;
  mcuGroup.add(mcuBox);
  tagGroupPart(mcuGroup, 'mcu_tinyml');
  root.add(mcuGroup);

  // 5. Quick-Release Side Buckle on Wearer's Right Flank (+X) ("hebilla")
  const hebillaGroup = new THREE.Group();
  const buckleOuter = new THREE.Mesh(
    new THREE.BoxGeometry(0.032, 0.088, 0.068),
    darkPolymerMat
  );
  buckleOuter.position.set(0.258, 0.02, 0.045);
  buckleOuter.rotation.y = 0.35;

  const buckleClip = new THREE.Mesh(
    new THREE.BoxGeometry(0.036, 0.056, 0.032),
    new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.4 })
  );
  buckleClip.position.set(0.262, 0.02, 0.048);
  buckleClip.rotation.y = 0.35;

  hebillaGroup.add(buckleOuter, buckleClip);
  tagGroupPart(hebillaGroup, 'hebilla');
  root.add(hebillaGroup);

  // 6. Rechargeable Battery in Protected Side Pouch (+X below strap) ("bateria")
  const bateriaGroup = new THREE.Group();
  const pouchMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.135, 0.095),
    new THREE.MeshStandardMaterial({
      color: 0x262b33,
      roughness: 0.65,
      metalness: 0.2,
    })
  );
  pouchMesh.position.set(0.242, -0.135, 0.035);
  pouchMesh.rotation.z = -0.05;

  const batteryLedMat = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x22c55e,
    emissiveIntensity: 0.8,
  });
  const batteryLed = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.045, 0.012),
    batteryLedMat
  );
  batteryLed.position.set(0.278, -0.12, 0.06);
  bateriaGroup.add(pouchMesh, batteryLed);
  tagGroupPart(bateriaGroup, 'bateria');
  root.add(bateriaGroup);

  // 7. Dorsal IMU Module on Back ("imu")
  const imuGroup = new THREE.Group();
  const imuHousing = new THREE.Mesh(
    new THREE.BoxGeometry(0.068, 0.11, 0.032),
    darkPolymerMat
  );
  imuHousing.position.set(0, 0.04, -0.175);

  const imuImpactRingGeo = new THREE.RingGeometry(0.045, 0.058, 28);
  const imuImpactRingMat = new THREE.MeshBasicMaterial({
    color: 0xfbbf24,
    side: THREE.DoubleSide,
    transparent: true,
    opacity: 0,
  });
  const imuImpactRing = new THREE.Mesh(imuImpactRingGeo, imuImpactRingMat);
  imuImpactRing.position.set(0, 0.04, -0.194);
  imuGroup.add(imuHousing, imuImpactRing);
  tagGroupPart(imuGroup, 'imu');
  root.add(imuGroup);

  // 8. 433 MHz Strap-Integrated Sub-GHz Antenna + Expanding RF Wave Rings ("antena_chaleco")
  const antenaGroup = new THREE.Group();
  const antCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0.045, 0.08, -0.172),
    new THREE.Vector3(0.095, 0.19, -0.165),
    new THREE.Vector3(0.135, 0.28, -0.145),
  ]);
  const antTraceGeo = new THREE.TubeGeometry(antCurve, 16, 0.006, 6, false);
  const antTraceMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.65,
    roughness: 0.3,
  });
  const antTrace = new THREE.Mesh(antTraceGeo, antTraceMat);
  antenaGroup.add(antTrace);

  // Expanding 433 MHz pulse rings
  const rfWaveRings: THREE.Mesh[] = [];
  for (let i = 0; i < 2; i++) {
    const ringGeo = new THREE.RingGeometry(0.06, 0.072, 32);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x38bdf8,
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.position.set(0.1, 0.2, -0.18);
    antenaGroup.add(ring);
    rfWaveRings.push(ring);
  }

  tagGroupPart(antenaGroup, 'antena_chaleco');
  root.add(antenaGroup);

  // Highlight ring for Inspector hotspot selection
  const partGroups: Record<string, THREE.Group> = {
    tejido: tejidoGroup,
    capa_termica: thermalGroup,
    sensores: sensorGroup,
    mcu_tinyml: mcuGroup,
    hebilla: hebillaGroup,
    bateria: bateriaGroup,
    imu: imuGroup,
    antena_chaleco: antenaGroup,
  };

  let highlightedId: string | null = null;

  const highlightPart = (partId: string | null) => {
    highlightedId = partId;
    for (const [id, grp] of Object.entries(partGroups)) {
      const isSelected = id === highlightedId;
      grp.traverse((obj) => {
        if (obj instanceof THREE.Mesh && obj.material instanceof THREE.MeshStandardMaterial) {
          if (id !== 'capa_termica') {
            obj.material.emissiveIntensity = isSelected ? 0.55 : 0.08;
            if (isSelected) {
              obj.material.emissive.setHex(0x38bdf8);
            }
          }
        }
      });
    }
  };

  let lastCanvasDraw = -1;

  const updateFromBeacon = (beacon: SurvivorBeacon, elapsedSec: number) => {
    // Subtle breathing chest motion
    const breathRate = (beacon.hr / 60) * 0.45;
    const breathScale = 1 + Math.sin(elapsedSec * breathRate * Math.PI * 2) * 0.012;
    root.scale.set(breathScale, 1, breathScale);

    // Update battery LED color
    if (beacon.batteryPct < 20) {
      batteryLedMat.color.setHex(0xef4444);
      batteryLedMat.emissive.setHex(0xef4444);
    } else if (beacon.batteryPct < 45) {
      batteryLedMat.color.setHex(0xfacc15);
      batteryLedMat.emissive.setHex(0xfacc15);
    } else {
      batteryLedMat.color.setHex(0x22c55e);
      batteryLedMat.emissive.setHex(0x22c55e);
    }

    // IMU knock visual ripple
    const imuSpike = Math.max(0, beacon.imuG - 1.18);
    if (imuSpike > 0.05) {
      const s = 1 + imuSpike * 1.4;
      imuImpactRing.scale.set(s, s, 1);
      imuImpactRingMat.opacity = Math.min(0.95, imuSpike * 0.85);
    } else {
      imuImpactRingMat.opacity = 0;
    }

    // Expanding 433 MHz RF rings after each transmission
    const sinceTx = elapsedSec - beacon.lastTxFlashAt;
    rfWaveRings.forEach((ring, idx) => {
      const t = sinceTx - idx * 0.16;
      const mat = ring.material as THREE.MeshBasicMaterial;
      if (t >= 0 && t < 0.85) {
        const progress = t / 0.85;
        const scale = 1 + progress * 3.4;
        ring.scale.set(scale, scale, 1);
        mat.opacity = (1 - progress) * 0.78;
        mat.color.setHex(beacon.sosAlert ? 0xf97316 : 0x38bdf8);
      } else {
        mat.opacity = 0;
      }
    });

    // Redraw thermal PWM & MCU canvases ~15 fps for crispness and low overhead
    if (elapsedSec - lastCanvasDraw > 0.065) {
      lastCanvasDraw = elapsedSec;

      drawThermalPad(
        thermalPadCanvas.ctx,
        beacon.pwmPulseWave,
        beacon.pwmActive
      );
      thermalPadCanvas.texture.needsUpdate = true;
      thermalMat.emissiveIntensity = beacon.pwmActive
        ? 0.25 + beacon.pwmPulseWave * 1.15
        : highlightedId === 'capa_termica'
        ? 0.45
        : 0.04;

      const ledHex =
        beacon.sosAlert || beacon.priority === 'ROJO'
          ? '#ef4444'
          : beacon.priority === 'AMARILLO'
          ? '#facc15'
          : beacon.priority === 'NEGRO'
          ? '#94a3b8'
          : '#38bdf8';

      drawMcuModuleFace(
        mcuCanvas.ctx,
        ledHex,
        beacon.sosAlert,
        0.5 + 0.5 * Math.sin(elapsedSec * 5)
      );
      mcuCanvas.texture.needsUpdate = true;
    }
  };

  return { root, updateFromBeacon, highlightPart };
}
