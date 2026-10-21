import * as THREE from 'three';
import { buildQr, type QrMatrix } from '../scene/qr';
import { buildPlot, type PlotMeshes } from '../scene/plot';
import { CELL, HEDGE_RING, ISO_AZIMUTH, ISO_ELEVATION, TOP_ELEVATION } from '../scene/constants';
import { clamp01, lerp, easeInOutCubic } from '../scene/rng';
import { buildStructure, type BuildingStructure } from './structure';
import { paletteForBuilding, type BuildingPalette } from './palette';
import { BUILDING_TYPES, type BuildingType, type BuildingTypeId } from './types';

export type BuildingViewMode = 'model' | 'code';

const MORPH_SECONDS = 0.95;

/** Standalone WebGL scene for the building section — not mixed with the tree scene. */
export class BuildingScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 1000);
  private key: THREE.DirectionalLight;
  private ambient: THREE.AmbientLight;
  private hemi: THREE.HemisphereLight;

  private plot!: PlotMeshes;
  private structure!: BuildingStructure;
  private qr!: QrMatrix;
  private world = new THREE.Group();
  private target = new THREE.Vector3();
  private offset = new THREE.Vector3();
  private forward = new THREE.Vector3();
  private screenUp = new THREE.Vector3();

  private palette: BuildingPalette;
  private buildingType: BuildingType;
  private morph = 0;
  private morphTarget = 0;
  private lastTime = 0;
  private raf = 0;
  private frame = 0;
  private disposed = false;

  private isoHalfW = 20;
  private isoHalfV = 20;
  private isoCenter = new THREE.Vector3();
  private rimUnits = 40;
  private dockPx = 160;

  onMorphChange?: (t: number) => void;
  private canvas: HTMLCanvasElement;

  constructor(
    canvas: HTMLCanvasElement,
    text: string,
    buildingType: BuildingType | BuildingTypeId = 'house',
  ) {
    this.canvas = canvas;
    this.buildingType = typeof buildingType === 'string' ? BUILDING_TYPES[buildingType] : buildingType;
    this.palette = paletteForBuilding(this.buildingType.paletteId);

    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene.background = new THREE.Color(this.palette.ground);

    this.ambient = new THREE.AmbientLight(0xffffff, 0.62);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0xd8cfbe, 0.45);
    this.key = new THREE.DirectionalLight(0xfff6e6, 1.1);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.ambient, this.hemi, this.key, this.key.target);
    this.scene.add(this.world);

    this.build(text);
    this.resize();
    this.lastTime = performance.now();
    this.loop();
  }

  private build(text: string) {
    this.qr = buildQr(text);
    this.plot = buildPlot(this.qr, this.palette);
    this.structure = buildStructure(this.qr, this.palette, this.buildingType);
    this.world.add(this.plot.group, this.structure.group);

    const rim = (this.qr.plot + HEDGE_RING * 2) * CELL;
    this.rimUnits = rim;
    this.measureIsoFraming(rim);

    const shadowExtent = rim * 0.8;
    const cam = this.key.shadow.camera;
    cam.left = -shadowExtent;
    cam.right = shadowExtent;
    cam.top = shadowExtent;
    cam.bottom = -shadowExtent;
    cam.near = 1;
    cam.far = 400;
    cam.updateProjectionMatrix();

    this.structure.setMorph(this.morph, 0);
  }

  private measureIsoFraming(rim: number) {
    const { buildingTop, buildingRadius } = this.structure;
    const dir = new THREE.Vector3(
      Math.cos(ISO_ELEVATION) * Math.sin(ISO_AZIMUTH),
      Math.sin(ISO_ELEVATION),
      Math.cos(ISO_ELEVATION) * Math.cos(ISO_AZIMUTH),
    ).normalize();
    const forward = dir.clone().negate();
    const right = new THREE.Vector3().crossVectors(forward, new THREE.Vector3(0, 1, 0)).normalize();
    const up = new THREE.Vector3().crossVectors(right, forward).normalize();

    const half = rim / 2;
    const points: THREE.Vector3[] = [
      new THREE.Vector3(-half, 0, -half),
      new THREE.Vector3(half, 0, -half),
      new THREE.Vector3(-half, 0, half),
      new THREE.Vector3(half, 0, half),
    ];
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        points.push(new THREE.Vector3(sx * buildingRadius, 0, sz * buildingRadius));
        points.push(new THREE.Vector3(sx * buildingRadius, buildingTop, sz * buildingRadius));
      }
    }

    let wMin = Infinity;
    let wMax = -Infinity;
    let vMin = Infinity;
    let vMax = -Infinity;
    for (const pt of points) {
      wMin = Math.min(wMin, pt.dot(right));
      wMax = Math.max(wMax, pt.dot(right));
      vMin = Math.min(vMin, pt.dot(up));
      vMax = Math.max(vMax, pt.dot(up));
    }

    this.isoHalfW = (wMax - wMin) / 2;
    this.isoHalfV = (vMax - vMin) / 2;
    this.isoCenter
      .set(0, 0, 0)
      .addScaledVector(right, (wMin + wMax) / 2)
      .addScaledVector(up, (vMin + vMax) / 2);
  }

  private teardown() {
    this.world.remove(this.plot.group, this.structure.group);
    this.structure.dispose();
    this.plot.group.traverse((o) => {
      const mesh = o as THREE.Mesh;
      mesh.geometry?.dispose();
      const mat = mesh.material as THREE.Material | undefined;
      mat?.dispose();
    });
  }

  setText(text: string) {
    if (text === this.qr.text) return;
    this.teardown();
    this.build(text);
  }

  setBuildingType(type: BuildingType | BuildingTypeId) {
    const next = typeof type === 'string' ? BUILDING_TYPES[type] : type;
    if (next.id === this.buildingType.id) return;
    this.buildingType = next;
    this.palette = paletteForBuilding(next.paletteId);
    (this.scene.background as THREE.Color).set(this.palette.ground);
    this.teardown();
    this.build(this.qr.text);
    this.updateCamera(true);
  }

  setDockHeight(px: number) {
    const next = Math.max(0, px);
    if (Math.abs(next - this.dockPx) < 1) return;
    this.dockPx = next;
    this.updateCamera(true);
  }

  setPalette(palette: BuildingPalette) {
    this.palette = palette;
    (this.scene.background as THREE.Color).set(palette.ground);
    this.plot.applyPalette(palette);
    this.structure.applyPalette(palette);
  }

  setMode(mode: BuildingViewMode) {
    this.morphTarget = mode === 'code' ? 1 : 0;
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
    this.teardown();
    this.renderer.dispose();
  }

  private updateCamera(force = false) {
    const t = easeInOutCubic(this.morph);
    const w = this.canvas.clientWidth || 1;
    const h = this.canvas.clientHeight || 1;
    const aspect = w / h;
    const margin = 1.05;
    const dockPx = Math.min(this.dockPx + 18, h * 0.5);
    const usable = Math.max(h - dockPx, h * 0.4);

    const fit = (halfW: number, halfV: number) => {
      const half = Math.max(halfV * (h / usable), halfW / aspect) * margin;
      return { half, shift: (half * dockPx) / h };
    };

    const isoFit = fit(this.isoHalfW, this.isoHalfV);
    const halfRim = this.rimUnits / 2;
    const topFit = fit(halfRim, halfRim);
    const half = lerp(isoFit.half, topFit.half, t);
    const shift = lerp(isoFit.shift, topFit.shift, t);

    this.camera.left = -half * aspect;
    this.camera.right = half * aspect;
    this.camera.top = half;
    this.camera.bottom = -half;
    this.camera.near = -600;
    this.camera.far = 600;
    this.camera.updateProjectionMatrix();

    const azimuth = lerp(ISO_AZIMUTH, 0, t);
    const elevation = lerp(ISO_ELEVATION, TOP_ELEVATION, t);
    const r = 220;
    this.offset.set(
      r * Math.cos(elevation) * Math.sin(azimuth),
      r * Math.sin(elevation),
      r * Math.cos(elevation) * Math.cos(azimuth),
    );
    this.forward.copy(this.offset).normalize().negate();
    this.screenUp
      .set(0, 1, 0)
      .addScaledVector(this.forward, -this.forward.y)
      .normalize();
    this.target
      .copy(this.isoCenter)
      .multiplyScalar(1 - t)
      .addScaledVector(this.screenUp, -shift);
    this.camera.position.copy(this.target).add(this.offset);
    this.camera.up.set(0, 1, 0);
    this.camera.lookAt(this.target);
    if (force) this.camera.updateMatrixWorld();

    this.key.intensity = lerp(1.1, 0.14, t);
    this.ambient.intensity = lerp(0.62, 2.45, t);
    this.hemi.intensity = lerp(0.45, 0.18, t);
    this.key.castShadow = t < 0.6;
    this.key.position.set(-60, 120, 70).add(this.target);
    this.key.target.position.copy(this.target);
    this.key.target.updateMatrixWorld();
  }

  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    const now = performance.now();
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.morph !== this.morphTarget) {
      const step = dt / MORPH_SECONDS;
      const dir = Math.sign(this.morphTarget - this.morph);
      this.morph = clamp01(
        dir > 0
          ? Math.min(this.morph + step, this.morphTarget)
          : Math.max(this.morph - step, this.morphTarget),
      );
      this.onMorphChange?.(this.morph);
    }

    if (this.morph < 0.999 || this.frame < 2) this.structure.setMorph(this.morph, now / 1000);
    this.updateCamera();
    this.renderer.render(this.scene, this.camera);
    this.frame += 1;
  };
}
