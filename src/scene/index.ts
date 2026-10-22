import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { buildQr, type QrMatrix } from './qr';
import { buildPlot, type PlotMeshes } from './plot';
import { buildCanopy, type Canopy } from './canopy';
import { buildMotes, type Motes } from './motes';
import { buildFauna, type Fauna } from './fauna';
import { CELL, ISO_AZIMUTH, ISO_ELEVATION } from './constants';
import { clamp01, lerp } from './rng';
import type { Palette } from './palette';
import { SPECIES, type Species, type SpeciesId } from './species';
import { CLIMATES, type ClimateId } from './climate';

export type ViewMode = 'tree' | 'code';
export type { ClimateId };

/**
 * Free-orbit orthographic scene. Leaves already sit on dark modules, so a
 * top-down look is the QR — no click morph / rearrange.
 */
export class GroveQrScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private controls: OrbitControls;
  private key: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;

  private plot!: PlotMeshes;
  private canopy!: Canopy;
  private motes!: Motes;
  private fauna!: Fauna;
  private qr!: QrMatrix;
  private world = new THREE.Group();

  private palette: Palette;
  private species: Species;
  private climate: ClimateId = 'calm';
  private lastTime = 0;
  private elapsed = 0;
  private raf = 0;
  private frame = 0;
  private disposed = false;

  private dockPx = 200;
  private orthoHalf = 20;

  onMorphChange?: (t: number) => void;

  private canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    text: string,
    palette: Palette,
    species: Species = SPECIES.oak,
  ) {
    this.canvas = canvas;
    this.palette = palette;
    this.species = species;

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.BasicShadowMap;
    this.scene.background = new THREE.Color(palette.ground);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.62);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfbe, 0.5);
    this.key = new THREE.DirectionalLight(0xfff6e6, 1.15);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(1024, 1024);
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.ambient, this.hemi, this.key, this.key.target);
    this.scene.add(this.world);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.enablePan = false;
    this.controls.minPolarAngle = 0.08;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.04;
    this.controls.rotateSpeed = 0.85;
    // Ortho "zoom" via changing the frustum — OrbitControls zoom still works
    // by dollying; we re-fit frustum from camera distance each frame.
    this.controls.minDistance = 40;
    this.controls.maxDistance = 420;

    this.build(text);
    this.resize();
    this.lastTime = performance.now();
    this.loop();

    if (import.meta.env.DEV) {
      (window as unknown as { __groveQr?: GroveQrScene }).__groveQr = this;
    }
  }

  private build(text: string) {
    this.qr = buildQr(text);
    this.plot = buildPlot(this.qr, this.palette);
    this.canopy = buildCanopy(this.qr, this.palette, this.species);
    this.motes = buildMotes(this.qr, this.palette);
    this.fauna = buildFauna(this.qr, this.palette);
    this.world.add(this.plot.group, this.canopy.group, this.motes.points, this.fauna.group);

    const rim = this.qr.plot * CELL;
    this.orthoHalf = rim * 0.78;

    const shadowExtent = rim * 0.85;
    const cam = this.key.shadow.camera;
    cam.left = -shadowExtent;
    cam.right = shadowExtent;
    cam.top = shadowExtent;
    cam.bottom = -shadowExtent;
    cam.near = 1;
    cam.far = 400;
    cam.updateProjectionMatrix();

    const aimY = this.canopy.model.canopyTop * 0.35;
    this.controls.target.set(0, aimY, 0);
    const r = 220;
    this.camera.position.set(
      r * Math.cos(ISO_ELEVATION) * Math.sin(ISO_AZIMUTH),
      r * Math.sin(ISO_ELEVATION),
      r * Math.cos(ISO_ELEVATION) * Math.cos(ISO_AZIMUTH),
    );
    this.controls.update();

    this.canopy.setMorph(0, 0);
    this.plot.setMorph(0);
    this.applyClimate();
    this.updateCamera(true);
  }

  private applyClimate() {
    const profile = CLIMATES[this.climate];
    this.canopy.setWind(profile.wind);
    const weather = this.palette.id === 'winter' ? 'snow' : this.climate;
    this.motes.setClimate(weather);
    this.motes.setGust(this.palette.id === 'winter' && this.climate === 'wind' ? 1.7 : 1);
  }

  private teardown() {
    this.world.remove(this.plot.group, this.canopy.group, this.motes.points, this.fauna.group);
    this.canopy.dispose();
    this.motes.dispose();
    this.fauna.dispose();
    this.plot.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else mat?.dispose();
    });
  }

  setText(text: string) {
    if (text === this.qr.text) return;
    this.teardown();
    this.build(text);
  }

  setSpecies(species: SpeciesId | Species) {
    const next = typeof species === 'string' ? SPECIES[species] : species;
    if (next.id === this.species.id) return;
    this.species = next;
    this.teardown();
    this.build(this.qr.text);
  }

  setClimate(climate: ClimateId) {
    if (climate === this.climate) return;
    this.climate = climate;
    this.applyClimate();
  }

  setDockHeight(px: number) {
    const next = Math.max(0, px);
    if (Math.abs(next - this.dockPx) < 1) return;
    this.dockPx = next;
    this.updateCamera(true);
  }

  setPalette(palette: Palette) {
    this.palette = palette;
    (this.scene.background as THREE.Color).set(palette.ground);
    this.plot.applyPalette(palette);
    this.canopy.applyPalette(palette);
    this.motes.applyPalette(palette);
    this.fauna.applyPalette(palette);
    this.applyClimate();
  }

  /** Kept for UI compat — free-orbit design has no pose morph. */
  setMode(_mode: ViewMode) {
    this.onMorphChange?.(0);
  }

  toggleMode() {
    return 'tree' as ViewMode;
  }

  get mode(): ViewMode {
    return 'tree';
  }

  snapshot(): string {
    this.renderer.render(this.scene, this.camera);
    return this.canvas.toDataURL('image/png');
  }

  resize() {
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.updateCamera(true);
  }

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.controls.dispose();
    this.teardown();
    this.renderer.dispose();
  }

  /**
   * How close the view is to straight top-down (0 = oblique, 1 = overhead).
   * Used to flatten lights and tuck finder grass for scanning.
   */
  private topDownAmount() {
    // OrbitControls: polar 0 = straight overhead.
    // Stay fully "tree" through the usual iso band; only climb toward QR
    // once the camera is clearly looking down.
    const polar = this.controls.getPolarAngle();
    return clamp01(1 - (polar - 0.1) / 0.42);
  }

  private updateCamera(force = false) {
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    // Clear the dock without parking the plot under the top edge.
    const dockPx = Math.min(this.dockPx + 12, h * 0.48);
    const usable = Math.max(h - dockPx, h * 0.42);
    const top = this.topDownAmount();

    // Zoom from orbit distance
    const dist = this.camera.position.distanceTo(this.controls.target);
    const zoom = clamp01((dist - 40) / (420 - 40));
    const baseHalf = lerp(this.orthoHalf * 0.55, this.orthoHalf * 1.35, zoom);
    // Mild overhead pull-back — enough to clear UI, not a big empty frame.
    const scanHalf = this.orthoHalf * lerp(1, 1.06, top);
    const half = lerp(baseHalf, Math.max(baseHalf, scanHalf), top);
    const fitH = (half * h) / usable;
    const fitW = half;
    const viewHalf = Math.max(fitH, fitW) * 1.02;

    // Soft lift only — full dockFrac shift left a bald strip at the top.
    const screenShift = viewHalf * (dockPx / h) * lerp(0.35, 0.55, top);
    this.camera.left = -viewHalf * aspect;
    this.camera.right = viewHalf * aspect;
    this.camera.top = viewHalf - screenShift;
    this.camera.bottom = -viewHalf - screenShift;
    this.camera.near = -800;
    this.camera.far = 800;
    this.camera.updateProjectionMatrix();

    if (force) {
      this.controls.target.y = this.canopy.model.canopyTop * lerp(0.3, 0.08, top);
    }

    // Keep tree lighting while the canopy is visible — morphing key→ambient
    // was washing the leaf colours. Flat scan light only once foliage is gone.
    const lightBlend = clamp01((top - 0.88) / 0.12);
    this.key.intensity = lerp(1.15, 0.02, lightBlend);
    this.ambient.intensity = lerp(0.62, 2.2, lightBlend);
    this.hemi.intensity = lerp(0.5, 0.05, lightBlend);
    this.key.castShadow = lightBlend < 0.5;
    this.renderer.shadowMap.enabled = lightBlend < 0.5;
    this.key.position.set(-60, 120, 70).add(this.controls.target);
    this.key.target.position.copy(this.controls.target);
    this.key.target.updateMatrixWorld();

    // Finder grass stays — it is part of the code with the leaves.
    this.plot.setMorph(top);

    if (force) this.camera.updateMatrixWorld();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);

    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;
    this.elapsed += dt;

    this.controls.update();
    this.updateCamera();
    const top = this.topDownAmount();
    this.canopy.setMorph(top, this.elapsed);
    const weatherVis = Math.max(0, 1 - top * 1.4);
    // Kill weather motes early — they read as 3D noise on the code.
    this.motes.update(dt, this.elapsed, weatherVis);
    this.fauna.update(dt, this.elapsed, weatherVis);

    this.renderer.render(this.scene, this.camera);
    this.frame++;
  };
}
