import * as THREE from 'three';
import { PriorityColor, ReceiverLinkState, SurvivorBeacon } from '../types/wts';

export interface Receiver3DInstance {
  root: THREE.Group;
  updateDisplay: (
    beacon: SurvivorBeacon | undefined,
    link: ReceiverLinkState | undefined,
    receiverBatteryPct: number,
    elapsedSec: number
  ) => void;
  pulseButton: (btnKey: 'prev' | 'next' | 'ok' | 'aux') => void;
  highlightPart: (partId: string | null) => void;
}

function drawSparkline(
  ctx: CanvasRenderingContext2D,
  values: number[],
  x: number,
  y: number,
  w: number,
  h: number,
  stroke: string
): void {
  if (values.length < 2) return;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const span = Math.max(0.5, max - min);

  ctx.strokeStyle = stroke;
  ctx.lineWidth = 2.6;
  ctx.beginPath();
  values.forEach((v, idx) => {
    const px = x + (idx / (values.length - 1)) * w;
    const py = y + h - ((v - min) / span) * h;
    if (idx === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  });
  ctx.stroke();
}

function drawSignalBars(
  ctx: CanvasRenderingContext2D,
  bars: number,
  x: number,
  y: number,
  maxH: number,
  activeColor: string,
  inactiveColor: string
): void {
  const barW = 7;
  const gap = 4;
  for (let i = 0; i < 5; i++) {
    const bh = Math.round(((i + 1) / 5) * maxH);
    ctx.fillStyle = i < bars ? activeColor : inactiveColor;
    ctx.fillRect(x + i * (barW + gap), y + (maxH - bh), barW, bh);
  }
}

export function createReceiver3DModel(): Receiver3DInstance {
  const root = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x353b44,
    roughness: 0.62,
    metalness: 0.22,
  });

  const bumperMat = new THREE.MeshStandardMaterial({
    color: 0x22262d,
    roughness: 0.78,
    metalness: 0.14,
  });

  // Main handheld body
  const chassis = new THREE.Mesh(
    new THREE.BoxGeometry(0.28, 0.45, 0.082),
    bodyMat
  );
  root.add(chassis);

  // Rugged armored corner bumpers & side grip ribs matching chaleco.png
  const cornerPositions: [number, number][] = [
    [-0.135, 0.215],
    [0.135, 0.215],
    [-0.135, -0.215],
    [0.135, -0.215],
  ];
  for (const [cx, cy] of cornerPositions) {
    const bumper = new THREE.Mesh(
      new THREE.BoxGeometry(0.052, 0.052, 0.092),
      bumperMat
    );
    bumper.position.set(cx, cy, 0);
    root.add(bumper);
  }

  for (let i = -3; i <= 3; i++) {
    for (const side of [-1, 1]) {
      const rib = new THREE.Mesh(
        new THREE.BoxGeometry(0.014, 0.024, 0.072),
        bumperMat
      );
      rib.position.set(side * 0.144, i * 0.044, 0);
      root.add(rib);
    }
  }

  // 1. Top-Left 433 MHz Stubby Antenna ("antena_receptor")
  const antGroup = new THREE.Group();
  const antBase = new THREE.Mesh(
    new THREE.CylinderGeometry(0.024, 0.028, 0.045, 18),
    bumperMat
  );
  antBase.position.set(-0.095, 0.245, 0);

  const antShaft = new THREE.Mesh(
    new THREE.CylinderGeometry(0.015, 0.02, 0.145, 18),
    new THREE.MeshStandardMaterial({
      color: 0x1e2228,
      roughness: 0.55,
      metalness: 0.18,
    })
  );
  antShaft.position.set(-0.095, 0.335, 0);

  const antTipMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.35,
    roughness: 0.35,
  });
  const antTip = new THREE.Mesh(
    new THREE.SphereGeometry(0.0155, 16, 12),
    antTipMat
  );
  antTip.position.set(-0.095, 0.408, 0);

  antGroup.add(antBase, antShaft, antTip);
  antGroup.traverse((c) => {
    c.userData.partId = 'antena_receptor';
  });
  root.add(antGroup);

  // 2. Recessed LCD Screen ("pantalla_receptor") matching chaleco.png layout
  const screenBezel = new THREE.Mesh(
    new THREE.BoxGeometry(0.228, 0.205, 0.014),
    bumperMat
  );
  screenBezel.position.set(0, 0.095, 0.04);
  root.add(screenBezel);

  const screenCanvas = document.createElement('canvas');
  screenCanvas.width = 360;
  screenCanvas.height = 320;
  const sCtx = screenCanvas.getContext('2d')!;
  const screenTex = new THREE.CanvasTexture(screenCanvas);

  const screenMat = new THREE.MeshBasicMaterial({ map: screenTex });
  const screenMesh = new THREE.Mesh(
    new THREE.PlaneGeometry(0.206, 0.184),
    screenMat
  );
  screenMesh.position.set(0, 0.095, 0.048);
  screenMesh.userData.partId = 'pantalla_receptor';
  root.add(screenMesh);

  // 3. Priority LEDs row ("leds_prioridad"): VERDE, AMARILLO, ROJO, NEGRO
  const ledsGroup = new THREE.Group();

  // Printed label strip under LEDs
  const ledStripCanvas = document.createElement('canvas');
  ledStripCanvas.width = 360;
  ledStripCanvas.height = 56;
  const lCtx = ledStripCanvas.getContext('2d')!;
  lCtx.fillStyle = '#353b44';
  lCtx.fillRect(0, 0, 360, 56);
  lCtx.fillStyle = '#e2e8f0';
  lCtx.font = 'bold 17px Inter, system-ui, sans-serif';
  lCtx.textAlign = 'center';
  const labels = ['VERDE', 'AMARILLO', 'ROJO', 'NEGRO'];
  const xs = [48, 136, 224, 312];
  labels.forEach((lbl, idx) => {
    lCtx.fillText(lbl, xs[idx], 42);
  });
  const ledStripTex = new THREE.CanvasTexture(ledStripCanvas);
  const ledLabelPlane = new THREE.Mesh(
    new THREE.PlaneGeometry(0.224, 0.036),
    new THREE.MeshBasicMaterial({ map: ledStripTex })
  );
  ledLabelPlane.position.set(0, -0.068, 0.0425);
  ledsGroup.add(ledLabelPlane);

  const ledConfigs: {
    priority: PriorityColor;
    x: number;
    baseHex: number;
    glowHex: number;
  }[] = [
    { priority: 'VERDE', x: -0.078, baseHex: 0x166534, glowHex: 0x22c55e },
    { priority: 'AMARILLO', x: -0.025, baseHex: 0x854d0e, glowHex: 0xfacc15 },
    { priority: 'ROJO', x: 0.028, baseHex: 0x7f1d1d, glowHex: 0xef4444 },
    { priority: 'NEGRO', x: 0.081, baseHex: 0x111827, glowHex: 0x94a3b8 },
  ];

  const ledMaterials: Record<PriorityColor, THREE.MeshStandardMaterial> =
    {} as Record<PriorityColor, THREE.MeshStandardMaterial>;

  for (const cfg of ledConfigs) {
    const rim = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0155, 0.0165, 0.008, 20),
      bumperMat
    );
    rim.rotation.x = Math.PI / 2;
    rim.position.set(cfg.x, -0.044, 0.042);

    const mat = new THREE.MeshStandardMaterial({
      color: cfg.baseHex,
      emissive: cfg.glowHex,
      emissiveIntensity: 0.05,
      roughness: 0.25,
    });
    ledMaterials[cfg.priority] = mat;

    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(0.0125, 16, 12),
      mat
    );
    dome.position.set(cfg.x, -0.044, 0.046);
    ledsGroup.add(rim, dome);
  }
  ledsGroup.traverse((c) => {
    c.userData.partId = 'leds_prioridad';
  });
  root.add(ledsGroup);

  // 4. Tactile Physical Navigation Buttons ("botones_receptor"): ◀, ▲, OK, ▶
  const buttonsGroup = new THREE.Group();

  const makeButtonCap = (
    label: string,
    x: number,
    y: number,
    w: number,
    h: number,
    actionKey: 'prev' | 'next' | 'ok' | 'aux'
  ) => {
    const cnv = document.createElement('canvas');
    cnv.width = 96;
    cnv.height = 96;
    const c = cnv.getContext('2d')!;
    c.fillStyle = '#252a32';
    c.fillRect(0, 0, 96, 96);
    c.strokeStyle = '#525b69';
    c.lineWidth = 6;
    c.strokeRect(6, 6, 84, 84);
    c.fillStyle = '#f1f5f9';
    c.font = label === 'OK' ? 'bold 34px sans-serif' : 'bold 36px sans-serif';
    c.textAlign = 'center';
    c.textBaseline = 'middle';
    c.fillText(label, 48, 50);

    const tex = new THREE.CanvasTexture(cnv);
    const mats = [
      bumperMat,
      bumperMat,
      bumperMat,
      bumperMat,
      new THREE.MeshStandardMaterial({ map: tex, roughness: 0.45 }),
      bumperMat,
    ];
    const btn = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.022), mats);
    btn.position.set(x, y, 0.046);
    btn.userData.partId = 'botones_receptor';
    btn.userData.buttonAction = actionKey;
    buttonsGroup.add(btn);
    return btn;
  };

  const btnPrev = makeButtonCap('◀', -0.068, -0.155, 0.052, 0.052, 'prev');
  const btnAux = makeButtonCap('♪', 0.0, -0.112, 0.042, 0.032, 'aux');
  const btnOk = makeButtonCap('OK', 0.0, -0.162, 0.058, 0.056, 'ok');
  const btnNext = makeButtonCap('▶', 0.068, -0.155, 0.052, 0.052, 'next');

  root.add(buttonsGroup);

  const buttonMap = {
    prev: btnPrev,
    aux: btnAux,
    ok: btnOk,
    next: btnNext,
  };

  const pulseButton = (btnKey: 'prev' | 'next' | 'ok' | 'aux') => {
    const mesh = buttonMap[btnKey];
    if (!mesh) return;
    mesh.position.z = 0.038;
    setTimeout(() => {
      mesh.position.z = 0.046;
    }, 130);
  };

  const highlightPart = (partId: string | null) => {
    antTipMat.emissiveIntensity = partId === 'antena_receptor' ? 1.3 : 0.35;
  };

  let lastDrawSec = -1;

  const updateDisplay = (
    beacon: SurvivorBeacon | undefined,
    link: ReceiverLinkState | undefined,
    receiverBatteryPct: number,
    elapsedSec: number
  ) => {
    const pkt = link?.lastPacket ?? null;
    const activePriority: PriorityColor | null = pkt ? pkt.priority : null;

    // Update physical priority LEDs
    for (const p of ['VERDE', 'AMARILLO', 'ROJO', 'NEGRO'] as PriorityColor[]) {
      const mat = ledMaterials[p];
      if (activePriority === p && !beacon?.rescued) {
        const blink =
          p === 'ROJO' || pkt?.sosAlert
            ? 0.65 + 0.55 * Math.sin(elapsedSec * 7)
            : 1.05;
        mat.emissiveIntensity = link?.isLost ? 0.28 : blink;
      } else {
        mat.emissiveIntensity = 0.03;
      }
    }

    // Antenna tip pulse when fresh packet arrives
    const freshArrival =
      pkt && elapsedSec - pkt.timestamp < 0.35 && !link?.isLost;
    antTipMat.emissiveIntensity = freshArrival ? 1.5 : 0.3;

    if (elapsedSec - lastDrawSec < 0.08) return;
    lastDrawSec = elapsedSec;

    // Draw high-contrast transflective LCD screen matching chaleco.png!
    sCtx.fillStyle = '#e7edf0';
    sCtx.fillRect(0, 0, 360, 320);

    // Header row: "WTS 014" + signal bars + RX battery
    sCtx.fillStyle = '#1e293b';
    sCtx.font = 'bold 28px Inter, system-ui, monospace';
    sCtx.textAlign = 'left';
    sCtx.fillText(beacon ? beacon.id : 'SIN CANAL', 18, 38);

    // Battery mini icon
    sCtx.font = 'bold 14px Inter, sans-serif';
    sCtx.fillStyle = '#475569';
    const vestBat = pkt ? `${pkt.batteryPct}%` : '--%';
    sCtx.fillText(`BAT ${vestBat} · RX ${Math.round(receiverBatteryPct)}%`, 18, 58);

    drawSignalBars(
      sCtx,
      beacon?.rescued ? 5 : link?.signalBars ?? 0,
      290,
      16,
      28,
      '#0f172a',
      '#cbd5e1'
    );

    // Divider line
    sCtx.strokeStyle = '#94a3b8';
    sCtx.lineWidth = 2;
    sCtx.beginPath();
    sCtx.moveTo(16, 68);
    sCtx.lineTo(344, 68);
    sCtx.stroke();

    if (beacon?.rescued) {
      sCtx.fillStyle = '#dcfce7';
      sCtx.fillRect(18, 82, 324, 175);
      sCtx.fillStyle = '#166534';
      sCtx.font = 'bold 26px Inter, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('RESCATADO A SALVO', 180, 155);
      sCtx.font = '18px Inter, sans-serif';
      sCtx.fillText('Arnes liberado en zona segura', 180, 190);
      screenTex.needsUpdate = true;
      return;
    }

    // Status banner if SOS, Stale, or Lost RF link
    if (link?.isLost) {
      sCtx.fillStyle = '#fee2e2';
      sCtx.fillRect(16, 74, 328, 30);
      sCtx.fillStyle = '#991b1b';
      sCtx.font = 'bold 15px Inter, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText(
        pkt
          ? `SIN SEÑAL RF · Dato congelado (${Math.round(link.packetAgeSec)}s)`
          : 'SIN SEÑAL 433 MHz · Rodea escombros',
        180,
        94
      );
    } else if (pkt?.sosAlert) {
      sCtx.fillStyle = '#ffedd5';
      sCtx.fillRect(16, 74, 328, 30);
      sCtx.fillStyle = '#c2410c';
      sCtx.font = 'bold 16px Inter, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText('¡ALERTA: POSIBLE SOS RÍTMICO!', 180, 94);
    } else if (link?.isStale) {
      sCtx.fillStyle = '#fef3c7';
      sCtx.fillRect(16, 74, 328, 30);
      sCtx.fillStyle = '#92400e';
      sCtx.font = 'bold 15px Inter, sans-serif';
      sCtx.textAlign = 'center';
      sCtx.fillText(
        `DATO DESACTUALIZADO · hace ${link.packetAgeSec.toFixed(0)} s`,
        180,
        94
      );
    }

    const rowAlpha = link?.isLost ? 0.45 : link?.isStale ? 0.72 : 1.0;
    sCtx.save();
    sCtx.globalAlpha = rowAlpha;
    sCtx.textAlign = 'left';

    // Row 1: ♥ Pulso
    sCtx.fillStyle = '#1e293b';
    sCtx.font = 'bold 20px Inter, sans-serif';
    sCtx.fillText('♥ Pulso', 20, 134);
    sCtx.font = 'bold 20px monospace';
    sCtx.fillText(pkt ? `${pkt.hr}` : '--', 124, 134);
    if (beacon && pkt) {
      drawSparkline(
        sCtx,
        beacon.hrWaveHistory,
        186,
        114,
        152,
        24,
        '#0f172a'
      );
    }

    // Row 2: O2 SpO2
    sCtx.font = 'bold 20px Inter, sans-serif';
    sCtx.fillText('O₂ SpO₂', 20, 182);
    sCtx.font = 'bold 20px monospace';
    sCtx.fillText(pkt ? `${pkt.spo2}%` : '--%', 124, 182);
    if (beacon && pkt) {
      drawSparkline(
        sCtx,
        beacon.spo2WaveHistory,
        186,
        162,
        152,
        24,
        '#0f172a'
      );
    }

    // Row 3: Temp + PWM indicator
    sCtx.font = 'bold 20px Inter, sans-serif';
    sCtx.fillText('🌡 Temp.', 20, 230);
    sCtx.font = 'bold 19px monospace';
    sCtx.fillText(
      pkt ? `${pkt.tempC.toFixed(1)}°${pkt.pwmActive ? '⚡' : ''}` : '--.-°',
      118,
      230
    );
    if (beacon && pkt) {
      drawSparkline(
        sCtx,
        beacon.tempHistory,
        186,
        210,
        152,
        24,
        pkt.pwmActive ? '#ea580c' : '#0f172a'
      );
    }

    sCtx.restore();

    // Row 4: RSSI (live measurement at antenna)
    sCtx.fillStyle = '#0f172a';
    sCtx.font = 'bold 20px Inter, sans-serif';
    sCtx.textAlign = 'left';
    sCtx.fillText('RSSI', 20, 286);
    sCtx.font = 'bold 17px monospace';
    sCtx.fillStyle = '#334155';
    sCtx.fillText(
      link && link.signalBars > 0 ? `${link.rssiDbm} dBm` : '--- dBm',
      88,
      286
    );

    drawSignalBars(
      sCtx,
      link?.signalBars ?? 0,
      268,
      260,
      32,
      '#0f172a',
      '#cbd5e1'
    );

    screenTex.needsUpdate = true;
  };

  return { root, updateDisplay, pulseButton, highlightPart };
}
