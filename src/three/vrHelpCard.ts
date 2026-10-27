import * as THREE from 'three';

/**
 * Wrist-mounted control card that lives INSIDE the VR world.
 * DOM overlays are not visible in immersive-vr, so the control map has to be
 * rendered as a 3D surface attached to the left controller.
 */
export function createVrHelpCard(): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 480;
  const ctx = canvas.getContext('2d')!;
  // roundRect is missing on a few older WebXR browsers
  const rounded = (x: number, y: number, w: number, h: number, r: number) => {
    ctx.beginPath();
    if (typeof ctx.roundRect === 'function') ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  };

  // Glass panel
  ctx.fillStyle = 'rgba(6, 18, 30, 0.94)';
  rounded(8, 8, 752, 464, 30);
  ctx.fill();
  ctx.strokeStyle = 'rgba(75, 214, 255, 0.9)';
  ctx.lineWidth = 5;
  ctx.stroke();

  const grad = ctx.createLinearGradient(0, 0, 768, 0);
  grad.addColorStop(0, '#7de3ff');
  grad.addColorStop(1, '#38bdf8');
  ctx.fillStyle = grad;
  ctx.fillRect(30, 30, 8, 54);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#e8f8ff';
  ctx.font = 'bold 38px "Space Grotesk", Inter, sans-serif';
  ctx.fillText('CONTROLES VR · WTS', 58, 58);

  ctx.fillStyle = '#7dd3fc';
  ctx.font = 'bold 18px "JetBrains Mono", monospace';
  ctx.fillText('RESCATE SÍSMICO · 433 MHz', 60, 92);

  const rows: [string, string][] = [
    ['◉  JOYSTICK IZQUIERDO', 'Caminar / desplazarse'],
    ['◉  JOYSTICK DERECHO', 'Girar suavemente'],
    ['◉  GATILLO / A', 'OK · rescatar persona'],
    ['◉  A / X  ·  B / Y', 'Baliza siguiente / anterior'],
    ['◉  GRIP (empuñadura)', 'Activar guía acústica RF'],
    ['◉  PRESIONAR STICK', 'Mostrar / ocultar esta ayuda'],
  ];

  ctx.font = 'bold 21px "Space Grotesk", Inter, sans-serif';
  rows.forEach(([key, value], index) => {
    const y = 138 + index * 47;
    ctx.fillStyle = index % 2 === 0 ? 'rgba(56,189,248,0.07)' : 'rgba(0,0,0,0)';
    rounded(28, y - 20, 712, 42, 12);
    ctx.fill();
    ctx.fillStyle = '#7de3ff';
    ctx.fillText(key, 44, y);
    ctx.fillStyle = '#c9dce8';
    ctx.font = '20px "Space Grotesk", Inter, sans-serif';
    ctx.fillText(value, 372, y);
    ctx.font = 'bold 21px "Space Grotesk", Inter, sans-serif';
  });

  ctx.fillStyle = '#fcd34d';
  ctx.font = 'bold 18px "Space Grotesk", Inter, sans-serif';
  ctx.fillText('Sin mandos: mantén el botón del visor para avanzar mirando.', 44, 436);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;

  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    opacity: 1,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.1875), material);
  mesh.name = 'WTS_VR_HelpCard';
  mesh.renderOrder = 999;
  return mesh;
}
