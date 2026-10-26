import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { WTSSimulationEngine } from '../simulation/wtsEngine';
import { createVest3DModel, Vest3DInstance } from './vestModel';
import { createReceiver3DModel, Receiver3DInstance } from './receiverModel';
import { SimulationSnapshot } from '../types/wts';
import { RESCUE_DISTANCE_METERS } from '../simulation/scenarioData';
import {
  CINEMATIC_SHADER,
  GraphicsQuality,
  SkyDomeHandle,
  createDustTexture,
  createGlowTexture,
  createReflectionEnvironment,
  createSkyDome,
  createSurfaceMaterial,
  createSmokeTexture,
} from './visualAssets';
import {
  BeaconMarkerHandle,
  SceneryHandle,
  buildScenery,
  createBeaconMarker,
} from './scenery';

export type InspectorPreset = 'ambos' | 'chaleco_frente' | 'chaleco_espalda' | 'receptor';

export interface SceneInteractionCallbacks {
  onSelectHotspot: (partId: string) => void;
  onReceiverButton: (action: 'prev' | 'next' | 'ok' | 'aux') => void;
  onVestTap: () => void;
}

export class WTSThreeSceneManager {
  private container: HTMLElement;
  private engine: WTSSimulationEngine;
  private callbacks: SceneInteractionCallbacks;

  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;

  // Cinematic rendering pipeline
  private composer: EffectComposer;
  private bloomPass: UnrealBloomPass;
  private cinematicPass: ShaderPass;
  private skyDome: SkyDomeHandle;
  private environmentMap: THREE.Texture;
  private sunLight: THREE.DirectionalLight;
  private studioLights: THREE.Group;
  private studioBackground = new THREE.Color(0x0a131d);
  private quality: GraphicsQuality = 'alta';

  // Procedural texture atlases shared by scenery and particle systems
  private dustTexture: THREE.Texture;
  private glowTexture: THREE.Texture;
  private smokeTexture: THREE.Texture;

  // Disaster world group (scaled 1:1 in 3D browser, 0.032x in tabletop AR!)
  private worldGroup: THREE.Group;
  private scenery!: SceneryHandle;
  private dustParticles!: THREE.Points;
  private rescuerAvatar: THREE.Group;
  private handheldReceiver: Receiver3DInstance;
  private beaconVests: Map<string, Vest3DInstance> = new Map();
  private beaconMarkers: Map<string, BeaconMarkerHandle> = new Map();
  private proximityRings: Map<string, THREE.Mesh> = new Map();
  private rfRayLines: Map<string, THREE.Line> = new Map();

  // Studio Inspector group
  private inspectorGroup: THREE.Group;
  private inspectorVest: Vest3DInstance;
  private inspectorReceiver: Receiver3DInstance;

  // Orbit / pointer camera state for Chaleco, Tabletop & Inspector modes
  private isPointerDown = false;
  private pointerDownPos = { x: 0, y: 0 };
  private lastPointerPos = { x: 0, y: 0 };
  private orbitYaw = 0.25;
  private orbitPitch = 0.22;
  private orbitDist = 1.45;
  private orbitTarget = new THREE.Vector3(0, 0.06, 0);

  // Keyboard continuous input state
  private keysDown: Set<string> = new Set();
  // Mobile virtual joystick input
  private touchMove = { forward: 0, strafe: 0, turn: 0 };

  // WebXR Mixed Reality state
  private xrSession: XRSession | null = null;
  private xrHitTestSource: XRHitTestSource | null = null;
  private xrReticle: THREE.Mesh;
  private xrAnchorPlaced = false;

  private raycaster = new THREE.Raycaster();
  private lastFrameTime = performance.now();
  private disposed = false;

  constructor(
    container: HTMLElement,
    engine: WTSSimulationEngine,
    callbacks: SceneInteractionCallbacks
  ) {
    this.container = container;
    this.engine = engine;
    this.callbacks = callbacks;

    this.scene = new THREE.Scene();
    this.scene.background = null;
    this.scene.fog = new THREE.FogExp2(0x6f6c70, 0.0085);

    const width = Math.max(320, container.clientWidth);
    const height = Math.max(240, container.clientHeight);
    this.camera = new THREE.PerspectiveCamera(62, width / height, 0.05, 900);

    this.renderer = new THREE.WebGLRenderer({
      antialias: false, // MSAA is handled by the HDR composer render target
      alpha: true,
      stencil: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.xr.enabled = true;
    container.appendChild(this.renderer.domElement);

    // Procedural textures + image-based lighting (crisp metal & glass reflections)
    this.dustTexture = createDustTexture();
    this.glowTexture = createGlowTexture();
    this.smokeTexture = createSmokeTexture();
    this.environmentMap = createReflectionEnvironment(this.renderer);
    this.scene.environment = this.environmentMap;
    this.scene.environmentIntensity = 0.55;

    // Animated dusk sky with drifting clouds, sun disc and atmospheric haze
    const sunDir = new THREE.Vector3(0.5, 0.5, 0.68).normalize();
    this.skyDome = createSkyDome(sunDir);
    this.scene.add(this.skyDome.mesh);

    // Cinematic three-point lighting + soft sun shadows
    const hemiLight = new THREE.HemisphereLight(0xbcd7ff, 0x4a3a31, 0.95);
    this.scene.add(hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xffd2a3, 2.2);
    this.sunLight.position.copy(sunDir).multiplyScalar(64);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(2048, 2048);
    this.sunLight.shadow.camera.near = 1;
    this.sunLight.shadow.camera.far = 190;
    this.sunLight.shadow.camera.left = -44;
    this.sunLight.shadow.camera.right = 44;
    this.sunLight.shadow.camera.top = 44;
    this.sunLight.shadow.camera.bottom = -44;
    this.sunLight.shadow.bias = -0.00035;
    this.sunLight.shadow.normalBias = 0.035;
    this.sunLight.shadow.radius = 2.5;
    this.sunLight.target.position.set(0, 0, 0);
    this.scene.add(this.sunLight, this.sunLight.target);

    const rimLight = new THREE.DirectionalLight(0x6ea8ff, 0.6);
    rimLight.position.set(-26, 16, -24);
    this.scene.add(rimLight);

    const bounceLight = new THREE.DirectionalLight(0xffb878, 0.22);
    bounceLight.position.set(14, 6, -30);
    this.scene.add(bounceLight);
    this.scene.add(new THREE.AmbientLight(0xffffff, 0.1));

    // Dedicated studio rig for the 360° Inspector mode
    this.studioLights = new THREE.Group();
    const keyLight = new THREE.PointLight(0xdcefff, 2.8, 8, 2);
    keyLight.position.set(-1.3, 1.5, 1.5);
    const rimStudio = new THREE.PointLight(0x38bdf8, 2.0, 7, 2);
    rimStudio.position.set(1.6, 0.9, -1.3);
    const warmStudio = new THREE.PointLight(0xffb26b, 1.2, 6, 2);
    warmStudio.position.set(0.2, -0.5, 1.7);
    this.studioLights.add(keyLight, rimStudio, warmStudio);
    this.studioLights.visible = false;
    this.scene.add(this.studioLights);

    // Build Disaster Zone 3D World
    this.worldGroup = new THREE.Group();
    this.dustParticles = this.buildDisasterEnvironment(this.worldGroup);
    this.rescuerAvatar = this.buildRescuerAvatar();
    this.worldGroup.add(this.rescuerAvatar);
    this.scene.add(this.worldGroup);

    // Handheld 3D receiver attached to camera for immersive Rescuer mode
    this.handheldReceiver = createReceiver3DModel();
    this.handheldReceiver.root.scale.setScalar(0.68);
    this.handheldReceiver.root.position.set(0.24, -0.2, -0.46);
    this.handheldReceiver.root.rotation.set(-0.14, -0.28, 0.04);
    this.camera.add(this.handheldReceiver.root);
    this.scene.add(this.camera);

    // Build Studio Device Inspector Group
    this.inspectorGroup = new THREE.Group();
    this.inspectorGroup.visible = false;
    this.inspectorVest = createVest3DModel(true);
    this.inspectorVest.root.position.set(-0.34, 0.02, 0);
    this.inspectorReceiver = createReceiver3DModel();
    this.inspectorReceiver.root.scale.setScalar(1.22);
    this.inspectorReceiver.root.position.set(0.36, 0.02, 0.04);
    this.inspectorReceiver.root.rotation.y = -0.18;

    const pedestalGeo = new THREE.CylinderGeometry(0.78, 0.84, 0.045, 64);
    const pedestalMat = new THREE.MeshPhysicalMaterial({
      color: 0x1b2836,
      roughness: 0.18,
      metalness: 0.86,
      clearcoat: 0.8,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.5,
    });
    const pedestal = new THREE.Mesh(pedestalGeo, pedestalMat);
    pedestal.position.set(0, -0.46, 0);
    pedestal.receiveShadow = true;
    const pedestalRingGeo = new THREE.RingGeometry(0.8, 0.84, 64);
    pedestalRingGeo.rotateX(-Math.PI / 2);
    const pedestalRing = new THREE.Mesh(
      pedestalRingGeo,
      new THREE.MeshBasicMaterial({
        color: 0x38d7ff,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    pedestalRing.position.set(0, -0.435, 0);
    this.inspectorGroup.add(
      this.inspectorVest.root,
      this.inspectorReceiver.root,
      pedestal,
      pedestalRing
    );
    this.scene.add(this.inspectorGroup);

    // WebXR placement reticle
    const retGeo = new THREE.RingGeometry(0.11, 0.14, 36);
    retGeo.rotateX(-Math.PI / 2);
    this.xrReticle = new THREE.Mesh(
      retGeo,
      new THREE.MeshBasicMaterial({ color: 0x38bdf8, toneMapped: false })
    );
    this.xrReticle.matrixAutoUpdate = false;
    this.xrReticle.visible = false;
    this.scene.add(this.xrReticle);

    // HDR post-processing: MSAA render → bloom → cinematic grade → output
    const hdrTarget = new THREE.WebGLRenderTarget(width, height, {
      type: THREE.HalfFloatType,
      samples: 4,
    });
    this.composer = new EffectComposer(this.renderer, hdrTarget);
    this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.composer.setSize(width, height);
    this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloomPass = new UnrealBloomPass(
      new THREE.Vector2(width, height),
      0.45,
      0.5,
      0.94
    );
    this.composer.addPass(this.bloomPass);
    this.cinematicPass = new ShaderPass(CINEMATIC_SHADER);
    this.composer.addPass(this.cinematicPass);
    this.composer.addPass(new OutputPass());

    // Slightly lighter preset on phones / low-core devices
    if (window.innerWidth < 900 || (navigator.hardwareConcurrency ?? 8) <= 4) {
      this.setGraphicsQuality('media');
    }

    this.checkWebXrSupport();
    this.bindEvents();

    this.renderer.setAnimationLoop(this.renderFrame);
  }

  private checkWebXrSupport(): void {
    const navXr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!navXr) {
      this.engine.setXrStatus({ supported: false });
      return;
    }
    navXr
      .isSessionSupported('immersive-ar')
      .then((supported) => {
        this.engine.setXrStatus({ supported });
      })
      .catch(() => {
        this.engine.setXrStatus({ supported: false });
      });
  }

  public async startMixedReality(domOverlayRoot: HTMLElement): Promise<boolean> {
    const navXr = (navigator as Navigator & { xr?: XRSystem }).xr;
    if (!navXr) return false;

    try {
      const sessionInit: XRSessionInit & {
        domOverlay?: { root: HTMLElement };
      } = {
        requiredFeatures: ['hit-test'],
        optionalFeatures: ['local-floor', 'dom-overlay'],
        domOverlay: { root: domOverlayRoot },
      };

      const session = await navXr.requestSession('immersive-ar', sessionInit);
      this.xrSession = session;
      this.xrAnchorPlaced = false;

      this.renderer.xr.setReferenceSpaceType('local');
      await this.renderer.xr.setSession(session);

      const viewerSpace = await session.requestReferenceSpace('viewer');
      if (session.requestHitTestSource) {
        const src = await session.requestHitTestSource({ space: viewerSpace });
        this.xrHitTestSource = src ?? null;
      }

      this.scene.background = null;
      this.scene.fog = null;
      this.skyDome.mesh.visible = false;
      this.studioLights.visible = false;
      this.worldGroup.visible = false; // wait until user taps surface reticle
      this.handheldReceiver.root.visible = false;

      session.addEventListener('select', () => {
        if (!this.xrAnchorPlaced && this.xrReticle.visible) {
          this.worldGroup.position.setFromMatrixPosition(this.xrReticle.matrix);
          this.worldGroup.scale.setScalar(0.032); // ~2m tabletop disaster zone
          this.worldGroup.visible = true;
          this.xrAnchorPlaced = true;
          this.xrReticle.visible = false;
          this.engine.setMode('rescatista');
          this.engine.setXrStatus({ active: true, surfacePlaced: true });
        }
      });

      session.addEventListener('end', () => {
        this.xrSession = null;
        this.xrHitTestSource = null;
        this.xrAnchorPlaced = false;
        this.xrReticle.visible = false;
        this.worldGroup.position.set(0, 0, 0);
        this.worldGroup.scale.setScalar(1);
        this.worldGroup.visible = true;
        this.scene.background = null;
        this.scene.fog = new THREE.FogExp2(0x6f6c70, 0.0085);
        this.skyDome.mesh.visible = true;
        this.engine.setXrStatus({ active: false, surfacePlaced: false });
      });

      this.engine.setXrStatus({ active: true, surfacePlaced: false });
      return true;
    } catch {
      return false;
    }
  }

  public async stopMixedReality(): Promise<void> {
    if (this.xrSession) {
      await this.xrSession.end();
    }
  }

  public setInspectorPreset(preset: InspectorPreset): void {
    if (preset === 'ambos') {
      this.inspectorVest.root.visible = true;
      this.inspectorReceiver.root.visible = true;
      this.inspectorVest.root.position.set(-0.34, 0.02, 0);
      this.inspectorReceiver.root.position.set(0.36, 0.02, 0.04);
      this.orbitTarget.set(0, 0.04, 0);
      this.orbitYaw = 0.12;
      this.orbitPitch = 0.16;
      this.orbitDist = 1.42;
    } else if (preset === 'chaleco_frente') {
      this.inspectorVest.root.visible = true;
      this.inspectorReceiver.root.visible = false;
      this.inspectorVest.root.position.set(0, 0.02, 0);
      this.orbitTarget.set(0, 0.06, 0);
      this.orbitYaw = 0.08;
      this.orbitPitch = 0.14;
      this.orbitDist = 0.96;
    } else if (preset === 'chaleco_espalda') {
      this.inspectorVest.root.visible = true;
      this.inspectorReceiver.root.visible = false;
      this.inspectorVest.root.position.set(0, 0.02, 0);
      this.orbitTarget.set(0, 0.06, 0);
      this.orbitYaw = Math.PI - 0.1;
      this.orbitPitch = 0.15;
      this.orbitDist = 0.96;
    } else if (preset === 'receptor') {
      this.inspectorVest.root.visible = false;
      this.inspectorReceiver.root.visible = true;
      this.inspectorReceiver.root.position.set(0, 0.02, 0);
      this.orbitTarget.set(0, 0.04, 0);
      this.orbitYaw = -0.05;
      this.orbitPitch = 0.1;
      this.orbitDist = 0.88;
    }
  }

  public highlightInspectorPart(partId: string | null): void {
    this.inspectorVest.highlightPart(partId);
    this.inspectorReceiver.highlightPart(partId);
  }

  public pulseReceiverButton3D(btnKey: 'prev' | 'next' | 'ok' | 'aux'): void {
    this.handheldReceiver.pulseButton(btnKey);
    this.inspectorReceiver.pulseButton(btnKey);
  }

  public setTouchMove(forward: number, strafe: number, turn: number): void {
    this.touchMove = { forward, strafe, turn };
  }

  public getGraphicsQuality(): GraphicsQuality {
    return this.quality;
  }

  /** Switch between cinematic / balanced / performance rendering presets. */
  public setGraphicsQuality(quality: GraphicsQuality): void {
    this.quality = quality;
    const dpr = Math.min(
      window.devicePixelRatio,
      quality === 'alta' ? 2 : quality === 'media' ? 1.5 : 1
    );
    this.renderer.setPixelRatio(dpr);
    this.composer.setPixelRatio(dpr);
    this.renderer.shadowMap.enabled = quality !== 'baja';
    this.sunLight.castShadow = quality !== 'baja';
    this.bloomPass.enabled = quality !== 'baja';
    this.bloomPass.strength = quality === 'alta' ? 0.45 : 0.3;
    this.cinematicPass.enabled = quality !== 'baja';
    this.cinematicPass.uniforms.uGrain.value = quality === 'alta' ? 0.035 : 0.018;
    this.renderer.toneMappingExposure = quality === 'baja' ? 1.1 : 1.0;
    this.scenery.setQuality(quality);
    const w = Math.max(320, this.container.clientWidth);
    const h = Math.max(240, this.container.clientHeight);
    this.composer.setSize(w, h);
  }

  private buildDisasterEnvironment(group: THREE.Group): THREE.Points {
    const snap = this.engine.getSnapshot();

    // Full procedural city: ground, damaged skyline, RF obstacles, debris,
    // command base, street props, dust, embers and smoke plumes.
    this.scenery = buildScenery(group, {
      obstacles: this.engine.getObstacles(),
      beacons: snap.beacons.map((b) => ({ x: b.x, z: b.z })),
      dustTexture: this.dustTexture,
      glowTexture: this.glowTexture,
      smokeTexture: this.smokeTexture,
    });

    const concreteMat = createSurfaceMaterial('concrete', 2, 1);
    const woodMat = createSurfaceMaterial('wood', 1, 2);
    const rustMat = createSurfaceMaterial('rust', 1, 1);
    const tarpMat = createSurfaceMaterial('fabric', 2, 2);
    tarpMat.side = THREE.DoubleSide;

    for (const b of snap.beacons) {
      const shelterGroup = new THREE.Group();
      shelterGroup.position.set(b.x, 0, b.z);

      // Protective lean-to slab over the survivor (non-graphic)
      const leanToSlab = new THREE.Mesh(
        new THREE.BoxGeometry(2.6, 0.24, 2.45),
        concreteMat
      );
      leanToSlab.position.set(0, 1.5, -0.25);
      leanToSlab.rotation.z = 0.2;
      leanToSlab.castShadow = true;
      leanToSlab.receiveShadow = true;
      shelterGroup.add(leanToSlab);

      for (const [px, ph] of [[-1.05, 1.5], [1.05, 1.85]] as [number, number][]) {
        const pillar = new THREE.Mesh(
          new THREE.BoxGeometry(0.24, ph, 0.24),
          woodMat
        );
        pillar.position.set(px, ph / 2, -0.25);
        pillar.castShadow = true;
        shelterGroup.add(pillar);
      }

      // Torn rescue tarp
      const tarpGeo = new THREE.PlaneGeometry(2.5, 1.9, 6, 4);
      const pos = tarpGeo.getAttribute('position') as THREE.BufferAttribute;
      for (let i = 0; i < pos.count; i++) {
        pos.setZ(i, Math.sin(i * 1.7) * 0.08);
      }
      tarpGeo.computeVertexNormals();
      const tarp = new THREE.Mesh(tarpGeo, tarpMat);
      tarp.position.set(-0.15, 2.05, -1.05);
      tarp.rotation.x = -1.12;
      tarp.rotation.y = 0.12;
      tarp.castShadow = true;
      shelterGroup.add(tarp);

      // Exposed rebar + small rubble around the shelter
      const rebarGeo = new THREE.CylinderGeometry(0.02, 0.02, 0.8, 6);
      for (let i = 0; i < 4; i++) {
        const bar = new THREE.Mesh(rebarGeo, rustMat);
        bar.position.set(-1 + i * 0.6, 1.7, -0.9 + (i % 2) * 0.3);
        bar.rotation.z = (i - 1.5) * 0.2;
        shelterGroup.add(bar);
      }
      const chunkGeo = new THREE.IcosahedronGeometry(0.3, 0);
      for (let i = 0; i < 5; i++) {
        const chunk = new THREE.Mesh(chunkGeo, concreteMat);
        chunk.position.set(
          Math.sin(i * 2.4) * 1.8,
          0.13,
          Math.cos(i * 1.9) * 1.7
        );
        chunk.rotation.set(i * 0.7, i * 1.1, i * 0.3);
        chunk.scale.set(1.3, 0.6, 1);
        chunk.castShadow = true;
        shelterGroup.add(chunk);
      }

      // Warm emergency lantern (glow sprite + emissive bulb, bloom does the rest)
      const lantern = new THREE.Mesh(
        new THREE.SphereGeometry(0.075, 12, 10),
        new THREE.MeshBasicMaterial({ color: 0xffc477, toneMapped: false })
      );
      lantern.position.set(0.95, 1.1, 0.35);
      shelterGroup.add(lantern);
      const lanternGlow = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: this.glowTexture,
          color: 0xffb15c,
          transparent: true,
          opacity: 0.75,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      lanternGlow.position.copy(lantern.position);
      lanternGlow.scale.setScalar(1.5);
      shelterGroup.add(lanternGlow);

      group.add(shelterGroup);

      // Vest model at beacon position
      const vest3D = createVest3DModel(true);
      vest3D.root.position.set(b.x, 0.56, b.z);
      group.add(vest3D.root);
      this.beaconVests.set(b.id, vest3D);

      // Holographic 433 MHz locator beacon (animated light column + halo)
      const marker = createBeaconMarker(b.id, this.glowTexture);
      marker.root.position.set(b.x, 0, b.z);
      group.add(marker.root);
      this.beaconMarkers.set(b.id, marker);

      // Subtle rescue proximity ring (ONLY visible when rescuer is within ~5.5m!)
      const proxRing = new THREE.Mesh(
        new THREE.RingGeometry(1.15, 1.42, 64),
        new THREE.MeshBasicMaterial({
          color: 0x38bdf8,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          toneMapped: false,
        })
      );
      proxRing.rotation.x = -Math.PI / 2;
      proxRing.position.set(b.x, 0.05, b.z);
      group.add(proxRing);
      this.proximityRings.set(b.id, proxRing);

      // Optional educational RF 433 MHz ray line
      const lineGeo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(b.x, 0.8, b.z),
        new THREE.Vector3(0, 1.2, 21),
      ]);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.75,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      });
      const rfLine = new THREE.Line(lineGeo, lineMat);
      rfLine.visible = false;
      group.add(rfLine);
      this.rfRayLines.set(b.id, rfLine);
    }

    return this.scenery.dustParticles;
  }

  private buildRescuerAvatar(): THREE.Group {
    const grp = new THREE.Group();
    const jacketMat = new THREE.MeshPhysicalMaterial({
      color: 0xf2701c,
      roughness: 0.62,
      metalness: 0.05,
      clearcoat: 0.2,
    });
    const helmetMat = new THREE.MeshPhysicalMaterial({
      color: 0xffc928,
      roughness: 0.28,
      metalness: 0.12,
      clearcoat: 0.7,
      clearcoatRoughness: 0.18,
      envMapIntensity: 1.1,
    });
    const darkMat = new THREE.MeshStandardMaterial({
      color: 0x1b2430,
      roughness: 0.7,
      metalness: 0.16,
    });
    const reflectiveMat = new THREE.MeshStandardMaterial({
      color: 0xe6f7ff,
      emissive: 0x9be5ff,
      emissiveIntensity: 0.7,
      roughness: 0.32,
      metalness: 0.35,
    });

    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.33, 0.29, 1.05, 20),
      jacketMat
    );
    body.position.y = 0.88;
    body.castShadow = true;
    grp.add(body);

    // High-visibility reflective bands
    for (const y of [0.63, 1.16]) {
      const band = new THREE.Mesh(
        new THREE.CylinderGeometry(0.322, 0.322, 0.075, 20, 1, true),
        reflectiveMat
      );
      band.position.y = y;
      grp.add(band);
    }

    // Legs + boots
    for (const side of [-1, 1]) {
      const leg = new THREE.Mesh(
        new THREE.CylinderGeometry(0.105, 0.09, 0.62, 12),
        darkMat
      );
      leg.position.set(side * 0.14, 0.31, 0);
      leg.castShadow = true;
      grp.add(leg);
      const boot = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.12, 0.3), darkMat);
      boot.position.set(side * 0.14, 0.06, 0.05);
      grp.add(boot);
      const arm = new THREE.Mesh(
        new THREE.CylinderGeometry(0.085, 0.075, 0.62, 12),
        jacketMat
      );
      arm.position.set(side * 0.38, 1.05, 0.02);
      arm.rotation.z = side * 0.22;
      arm.castShadow = true;
      grp.add(arm);
    }

    // Backpack radio
    const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), darkMat);
    backpack.position.set(0, 1.02, -0.32);
    backpack.castShadow = true;
    grp.add(backpack);
    const radioLed = new THREE.Mesh(
      new THREE.SphereGeometry(0.035, 10, 8),
      new THREE.MeshBasicMaterial({ color: 0x4ade80, toneMapped: false })
    );
    radioLed.position.set(0.13, 1.2, -0.45);
    grp.add(radioLed);

    const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.245, 24, 18), helmetMat);
    helmet.position.y = 1.62;
    helmet.castShadow = true;
    grp.add(helmet);
    const visor = new THREE.Mesh(
      new THREE.BoxGeometry(0.34, 0.09, 0.06),
      new THREE.MeshPhysicalMaterial({
        color: 0x162a3a,
        roughness: 0.08,
        metalness: 0.5,
        envMapIntensity: 2,
      })
    );
    visor.position.set(0, 1.65, -0.22);
    grp.add(visor);
    const headLamp = new THREE.Mesh(
      new THREE.CylinderGeometry(0.07, 0.07, 0.06, 14),
      new THREE.MeshBasicMaterial({ color: 0xfff4cf, toneMapped: false })
    );
    headLamp.rotation.x = Math.PI / 2;
    headLamp.position.set(0, 1.74, -0.25);
    grp.add(headLamp);
    const lampGlow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color: 0xffe4a8,
        transparent: true,
        opacity: 0.8,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    lampGlow.position.set(0, 1.74, -0.3);
    lampGlow.scale.setScalar(0.85);
    grp.add(lampGlow);

    // Direction cone on ground for tabletop view clarity
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.45, 1.3, 20),
      new THREE.MeshBasicMaterial({
        color: 0x38bdf8,
        transparent: true,
        opacity: 0.32,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        toneMapped: false,
      })
    );
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.12, -1.0);

    grp.add(cone);
    return grp;
  }

  private bindEvents(): void {
    const dom = this.renderer.domElement;

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return;
      }
      const code = e.code;
      this.keysDown.add(code);

      const snap = this.engine.getSnapshot();
      if (
        (code === 'Space' || code === 'KeyT') &&
        snap.mode === 'chaleco'
      ) {
        e.preventDefault();
        this.callbacks.onVestTap();
      } else if (code === 'KeyE' || code === 'Enter') {
        if (snap.mode === 'rescatista') {
          this.callbacks.onReceiverButton('ok');
        }
      } else if (code === 'BracketLeft' || code === 'KeyZ') {
        this.callbacks.onReceiverButton('prev');
      } else if (code === 'BracketRight' || code === 'KeyX') {
        this.callbacks.onReceiverButton('next');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      this.keysDown.delete(e.code);
    };

    const onPointerDown = (e: PointerEvent) => {
      this.isPointerDown = true;
      this.pointerDownPos = { x: e.clientX, y: e.clientY };
      this.lastPointerPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      const dx = e.clientX - this.lastPointerPos.x;
      const dy = e.clientY - this.lastPointerPos.y;
      this.lastPointerPos = { x: e.clientX, y: e.clientY };

      const snap = this.engine.getSnapshot();
      if (snap.mode === 'rescatista' && !snap.rescuer.tabletopCameraMode && !snap.xrActive) {
        this.engine.setRescuerHeading(snap.rescuer.headingRad + dx * 0.0055);
      } else {
        this.orbitYaw -= dx * 0.0075;
        this.orbitPitch = Math.max(
          -0.45,
          Math.min(1.15, this.orbitPitch + dy * 0.0065)
        );
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!this.isPointerDown) return;
      this.isPointerDown = false;
      const movedDist = Math.hypot(
        e.clientX - this.pointerDownPos.x,
        e.clientY - this.pointerDownPos.y
      );
      if (movedDist < 7) {
        this.handleCanvasClick(e.clientX, e.clientY);
      }
    };

    const onWheel = (e: WheelEvent) => {
      const snap = this.engine.getSnapshot();
      if (snap.mode === 'inspector' || snap.mode === 'chaleco' || snap.rescuer.tabletopCameraMode) {
        e.preventDefault();
        const maxD = snap.rescuer.tabletopCameraMode ? 48 : 2.4;
        const minD = snap.rescuer.tabletopCameraMode ? 12 : 0.62;
        this.orbitDist = Math.max(
          minD,
          Math.min(maxD, this.orbitDist + e.deltaY * 0.0022)
        );
      }
    };

    const onResize = () => {
      if (this.disposed || this.xrSession) return;
      const w = Math.max(320, this.container.clientWidth);
      const h = Math.max(240, this.container.clientHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
      this.composer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    dom.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    dom.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onResize);

    // Save cleanup reference on instance
    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      dom.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      dom.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', onResize);
    };
  }

  private cleanupListeners: () => void = () => {};

  private handleCanvasClick(clientX: number, clientY: number): void {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1
    );
    this.raycaster.setFromCamera(ndc, this.camera);

    const snap = this.engine.getSnapshot();

    if (snap.mode === 'inspector') {
      const hits = this.raycaster.intersectObjects(
        [this.inspectorVest.root, this.inspectorReceiver.root],
        true
      );
      if (hits.length > 0) {
        const hitObj = hits[0].object;
        if (hitObj.userData.buttonAction) {
          this.callbacks.onReceiverButton(hitObj.userData.buttonAction);
        }
        if (hitObj.userData.partId) {
          this.callbacks.onSelectHotspot(hitObj.userData.partId);
          if (hitObj.userData.partId === 'imu') {
            this.callbacks.onVestTap();
          }
        }
      }
    } else if (snap.mode === 'chaleco') {
      const vest014 = this.beaconVests.get('WTS 014');
      if (vest014) {
        const hits = this.raycaster.intersectObject(vest014.root, true);
        if (hits.length > 0) {
          // Clicking anywhere on the 3D vest knocks rhythmic SOS!
          this.callbacks.onVestTap();
          if (hits[0].object.userData.partId) {
            this.callbacks.onSelectHotspot(hits[0].object.userData.partId);
          }
        }
      }
    } else if (snap.mode === 'rescatista') {
      // Allow clicking physical buttons on the 3D handheld receiver!
      if (this.handheldReceiver.root.visible) {
        const hits = this.raycaster.intersectObject(
          this.handheldReceiver.root,
          true
        );
        if (hits.length > 0 && hits[0].object.userData.buttonAction) {
          this.callbacks.onReceiverButton(hits[0].object.userData.buttonAction);
        }
      }
    }
  }

  private processInputs(dt: number, snap: SimulationSnapshot): void {
    let f = this.touchMove.forward;
    let s = this.touchMove.strafe;
    let turn = this.touchMove.turn;

    if (this.keysDown.has('KeyW') || this.keysDown.has('ArrowUp')) f += 1;
    if (this.keysDown.has('KeyS') || this.keysDown.has('ArrowDown')) f -= 1;
    if (this.keysDown.has('KeyD')) s += 1;
    if (this.keysDown.has('KeyA')) s -= 1;
    if (this.keysDown.has('ArrowLeft') || this.keysDown.has('KeyQ')) turn -= 1.85;
    if (this.keysDown.has('ArrowRight')) turn += 1.85;

    if (snap.mode === 'chaleco') {
      this.engine.moveVestWearer(s, -f, dt);
    } else if (snap.mode === 'rescatista' && !snap.xrActive) {
      this.engine.moveRescuer(f, s, turn, dt);
    }
  }

  private renderFrame = (nowMs: number, xrFrame?: XRFrame): void => {
    if (this.disposed) return;

    const dt = Math.min(0.1, Math.max(0.001, (nowMs - this.lastFrameTime) / 1000));
    this.lastFrameTime = nowMs;

    const preSnap = this.engine.getSnapshot();
    this.processInputs(dt, preSnap);

    // Handle WebXR Mixed Reality hit-test & camera pose mapping
    if (xrFrame && this.xrSession) {
      const refSpace = this.renderer.xr.getReferenceSpace();
      if (refSpace) {
        if (!this.xrAnchorPlaced && this.xrHitTestSource) {
          const hitResults = xrFrame.getHitTestResults(this.xrHitTestSource);
          if (hitResults.length > 0) {
            const pose = hitResults[0].getPose(refSpace);
            if (pose) {
              this.xrReticle.visible = true;
              this.xrReticle.matrix.fromArray(pose.transform.matrix);
            }
          } else {
            this.xrReticle.visible = false;
          }
        } else if (this.xrAnchorPlaced) {
          // Convert real-world XR viewer pose into disaster-map coordinates!
          const viewerPose = xrFrame.getViewerPose(refSpace);
          if (viewerPose) {
            const camPos = new THREE.Vector3(
              viewerPose.transform.position.x,
              viewerPose.transform.position.y,
              viewerPose.transform.position.z
            );
            const localPos = this.worldGroup.worldToLocal(camPos.clone());
            const quat = new THREE.Quaternion(
              viewerPose.transform.orientation.x,
              viewerPose.transform.orientation.y,
              viewerPose.transform.orientation.z,
              viewerPose.transform.orientation.w
            );
            const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
            this.engine.setRescuerPoseFromXR(localPos.x, localPos.z, -euler.y);
          }
        }
      }
    }

    // Advance WTS simulation
    this.engine.step(dt);
    const snap = this.engine.getSnapshot();

    // Global cinematic updates (sky, particles, grading, studio rig)
    const inXR = this.renderer.xr.isPresenting || this.xrSession !== null;
    const showSky = !inXR && snap.mode !== 'inspector';
    this.skyDome.mesh.visible = showSky;
    this.skyDome.update(snap.elapsedSec);
    this.scene.background = !inXR && snap.mode === 'inspector' ? this.studioBackground : null;
    this.studioLights.visible = !inXR && snap.mode === 'inspector';
    this.cinematicPass.uniforms.uTime.value = snap.elapsedSec;
    this.scenery.update(snap.elapsedSec, dt);

    // Update visibility between Disaster World vs Studio Inspector
    if (snap.mode === 'inspector' && !snap.xrActive) {
      this.worldGroup.visible = false;
      this.handheldReceiver.root.visible = false;
      this.inspectorGroup.visible = true;
      this.inspectorGroup.rotation.y = Math.sin(snap.elapsedSec * 0.18) * 0.07;

      // Update live animations on Inspector Vest & Receiver from active beacon
      const activeBeacon = snap.beacons[snap.rescuer.selectedBeaconIndex] ?? snap.beacons[0];
      if (activeBeacon) {
        this.inspectorVest.updateFromBeacon(activeBeacon, snap.elapsedSec);
        this.inspectorReceiver.updateDisplay(
          activeBeacon,
          snap.links[activeBeacon.id],
          snap.rescuer.receiverBatteryPct,
          snap.elapsedSec
        );
      }

      // Orbit studio camera
      const cx =
        this.orbitTarget.x +
        Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      const cy =
        this.orbitTarget.y + Math.sin(this.orbitPitch) * this.orbitDist;
      const cz =
        this.orbitTarget.z +
        Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * this.orbitDist;
      this.camera.position.set(cx, cy, cz);
      this.camera.lookAt(this.orbitTarget);
    } else {
      this.inspectorGroup.visible = false;
      if (!snap.xrActive) {
        this.worldGroup.visible = true;
      }

      // Update all 4 survivor vests, locator beacons, proximity rings & RF rays
      for (const b of snap.beacons) {
        const vest3D = this.beaconVests.get(b.id);
        const marker = this.beaconMarkers.get(b.id);
        const showColumns =
          snap.mode !== 'chaleco' &&
          (snap.rescuer.tabletopCameraMode || snap.rescuer.showEducationalRfRays);
        if (marker) {
          marker.update(snap.elapsedSec, !b.rescued, b.sosAlert, showColumns);
        }
        if (vest3D) {
          vest3D.root.visible = !b.rescued;
          if (!b.rescued) {
            vest3D.root.position.set(b.x, 0.56, b.z);
            vest3D.updateFromBeacon(b, snap.elapsedSec);
          }
        }

        const proxRing = this.proximityRings.get(b.id);
        if (proxRing) {
          const dist = Math.hypot(
            b.x - snap.rescuer.x,
            b.z - snap.rescuer.z
          );
          const ringMat = proxRing.material as THREE.MeshBasicMaterial;
          if (!b.rescued && dist <= RESCUE_DISTANCE_METERS + 1.2) {
            proxRing.position.set(b.x, 0.04, b.z);
            const pulse = 0.55 + 0.35 * Math.sin(snap.elapsedSec * 6);
            ringMat.opacity = pulse;
            ringMat.color.setHex(
              dist <= RESCUE_DISTANCE_METERS ? 0x22c55e : 0x38bdf8
            );
          } else {
            ringMat.opacity = 0;
          }
        }

        const rfLine = this.rfRayLines.get(b.id);
        if (rfLine) {
          rfLine.visible = snap.rescuer.showEducationalRfRays && !b.rescued;
          if (rfLine.visible) {
            const posAttr = rfLine.geometry.getAttribute(
              'position'
            ) as THREE.BufferAttribute;
            posAttr.setXYZ(0, b.x, 0.72, b.z);
            posAttr.setXYZ(1, snap.rescuer.x, 1.35, snap.rescuer.z);
            posAttr.needsUpdate = true;

            const link = snap.links[b.id];
            const mat = rfLine.material as THREE.LineBasicMaterial;
            if (link.isLost || link.signalBars === 0) {
              mat.color.setHex(0xef4444);
              mat.opacity = 0.35;
            } else if (link.signalBars <= 2) {
              mat.color.setHex(0xfacc15);
              mat.opacity = 0.65;
            } else {
              mat.color.setHex(0x22c55e);
              mat.opacity = 0.85;
            }
          }
        }
      }

      // Update Rescuer avatar position
      this.rescuerAvatar.position.set(snap.rescuer.x, 0, snap.rescuer.z);
      this.rescuerAvatar.rotation.y = -snap.rescuer.headingRad;

      // Update Handheld 3D Receiver display
      const selectedBeacon = snap.beacons[snap.rescuer.selectedBeaconIndex];
      const selectedLink = selectedBeacon
        ? snap.links[selectedBeacon.id]
        : undefined;
      this.handheldReceiver.updateDisplay(
        selectedBeacon,
        selectedLink,
        snap.rescuer.receiverBatteryPct,
        snap.elapsedSec
      );

      // Position non-XR Camera according to active mode
      if (!snap.xrActive) {
        if (snap.mode === 'chaleco') {
          this.handheldReceiver.root.visible = false;
          this.rescuerAvatar.visible = true;
          const vest014 = snap.beacons[0];
          const d = Math.max(0.75, Math.min(2.1, this.orbitDist));
          const target = new THREE.Vector3(vest014.x, 0.62, vest014.z);
          this.camera.position.set(
            target.x + Math.sin(this.orbitYaw) * Math.cos(this.orbitPitch) * d,
            Math.max(0.35, target.y + Math.sin(this.orbitPitch) * d),
            target.z + Math.cos(this.orbitYaw) * Math.cos(this.orbitPitch) * d
          );
          this.camera.lookAt(target);
        } else if (snap.rescuer.tabletopCameraMode) {
          // Orbital Tabletop / Tactical Maqueta view
          this.handheldReceiver.root.visible = false;
          this.rescuerAvatar.visible = true;
          const d = Math.max(16, Math.min(46, this.orbitDist < 5 ? 28 : this.orbitDist));
          const pitch = Math.max(0.45, this.orbitPitch);
          this.camera.position.set(
            snap.rescuer.x * 0.4 + Math.sin(this.orbitYaw) * Math.cos(pitch) * d,
            Math.sin(pitch) * d,
            snap.rescuer.z * 0.4 + Math.cos(this.orbitYaw) * Math.cos(pitch) * d
          );
          this.camera.lookAt(snap.rescuer.x * 0.4, 0, snap.rescuer.z * 0.4);
        } else {
          // First-Person Rescuer View holding the 3D Receptor del Rescatista!
          this.rescuerAvatar.visible = false;
          // Show 3D handheld receiver on wider viewports so mobile screens aren't double-crowded
          const showHandheld3D = this.container.clientWidth >= 860;
          this.handheldReceiver.root.visible = showHandheld3D;

          const walkBob =
            snap.rescuer.speed > 0.2
              ? Math.sin(snap.elapsedSec * 10) * 0.032
              : 0;
          this.camera.position.set(
            snap.rescuer.x,
            1.68 + walkBob,
            snap.rescuer.z
          );
          const lookX =
            snap.rescuer.x + Math.sin(snap.rescuer.headingRad) * 10;
          const lookZ =
            snap.rescuer.z - Math.cos(snap.rescuer.headingRad) * 10;
          this.camera.lookAt(lookX, 1.56 + walkBob * 0.5, lookZ);

          // Subtle receiver hand sway
          this.handheldReceiver.root.position.y = -0.2 + walkBob * 0.45;
        }
      }
    }

    // WebXR renders straight to its own framebuffer; composer is desktop-only
    if (inXR) {
      this.renderer.render(this.scene, this.camera);
    } else {
      this.composer.render(dt);
    }
  };

  public dispose(): void {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.cleanupListeners();
    for (const marker of this.beaconMarkers.values()) marker.dispose();
    this.scenery.dispose();
    this.skyDome.dispose();
    this.bloomPass.dispose();
    this.composer.dispose();
    this.environmentMap.dispose();
    this.dustTexture.dispose();
    this.glowTexture.dispose();
    this.smokeTexture.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
    this.renderer.dispose();
  }
}
