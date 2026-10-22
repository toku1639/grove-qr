import * as THREE from 'three';
import { makeRng } from './rng';
import type { QrMatrix } from './qr';
import type { Palette, SeasonId } from './palette';

const BUTTERFLY_COUNT = 4;

/** Shared with QR plot accents so overhead modules can match the wings. */
export const BUTTERFLY_COLORS = ['#ffe566', '#fff1a8', '#ffc8dc', '#e8f0ff'] as const;

const WING_TONES = BUTTERFLY_COLORS;

export interface Fauna {
  group: THREE.Group;
  update: (dt: number, time: number, visibility: number) => void;
  applyPalette: (p: Palette) => void;
  setSeason: (id: SeasonId) => void;
  dispose: () => void;
}

/**
 * Right-side wing as ◀: tip at the body, wide edge outward (+X).
 * Mirrored with scale.x = -1 → left wing ▶. Pair reads ▶◀.
 */
function makeWingGeometry() {
  const geo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    0.78, 0, 0.32, // outer front
    0.78, 0, -0.32, // outer back
    0, 0, 0, // tip at body
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  geo.setIndex([0, 1, 2]);
  geo.computeVertexNormals();
  return geo;
}

/**
 * Summer butterflies — ▶◀ silhouette, visible flap, calm orbit.
 */
export function buildFauna(qr: QrMatrix, palette: Palette): Fauna {
  const group = new THREE.Group();
  const rng = makeRng(0xb17e);
  const plotR = qr.plot * 0.5;
  const crown = Math.max(qr.plot * 0.48, 6.5);

  const wingGeo = makeWingGeometry();
  const bodyGeo = new THREE.SphereGeometry(0.04, 5, 4);
  bodyGeo.scale(1.6, 0.4, 0.4);

  const wingMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.95,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const bodyMat = new THREE.MeshBasicMaterial({
    transparent: true,
    opacity: 0.45,
    depthTest: false,
    depthWrite: false,
    color: '#5c4838',
  });

  const wings = new THREE.InstancedMesh(wingGeo, wingMat, BUTTERFLY_COUNT * 2);
  const bodies = new THREE.InstancedMesh(bodyGeo, bodyMat, BUTTERFLY_COUNT);
  wings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  bodies.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  for (const mesh of [wings, bodies]) {
    mesh.castShadow = false;
    mesh.frustumCulled = false;
    mesh.renderOrder = 10;
  }
  group.add(wings, bodies);

  type Bug = {
    orbitR: number;
    orbitY: number;
    phase: number;
    speed: number;
    bob: number;
    flapSpeed: number;
    tone: number;
    scale: number;
  };

  const bugs: Bug[] = [];
  for (let i = 0; i < BUTTERFLY_COUNT; i++) {
    bugs.push({
      orbitR: plotR * (0.85 + rng() * 0.35),
      orbitY: crown * (0.25 + rng() * 0.4),
      phase: (i / BUTTERFLY_COUNT) * Math.PI * 2 + rng() * 0.5,
      speed: 0.12 + rng() * 0.1,
      bob: 0.15 + rng() * 0.2,
      flapSpeed: 7.5 + rng() * 2.5,
      tone: i % WING_TONES.length,
      scale: 0.9 + rng() * 0.2,
    });
  }

  let season: SeasonId = palette.id;
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const yaw = new THREE.Quaternion();
  const flapQ = new THREE.Quaternion();
  const Y = new THREE.Vector3(0, 1, 0);
  // Flap around body forward (+Z after yaw) so tips lift ◀▶ open/close.
  const Z = new THREE.Vector3(0, 0, 1);
  const wingCol = new THREE.Color();

  const paint = () => {
    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      wingCol.set(WING_TONES[bugs[i]!.tone]!);
      wings.setColorAt(i * 2, wingCol);
      wings.setColorAt(i * 2 + 1, wingCol);
    }
    if (wings.instanceColor) wings.instanceColor.needsUpdate = true;
  };

  const applyPalette = (p: Palette) => {
    season = p.id;
    paint();
  };

  const setSeason = (id: SeasonId) => {
    season = id;
  };

  const update = (_dt: number, time: number, visibility: number) => {
    const show = season === 'summer' && visibility > 0.05;
    group.visible = show;
    wingMat.opacity = show ? 0.95 * Math.min(1, visibility) : 0;
    bodyMat.opacity = show ? 0.4 * Math.min(1, visibility) : 0;
    if (!show) return;

    for (let i = 0; i < BUTTERFLY_COUNT; i++) {
      const b = bugs[i]!;
      const ang = time * b.speed + b.phase;
      const cx = Math.cos(ang) * b.orbitR;
      const cz = Math.sin(ang) * b.orbitR;
      const cy = b.orbitY + Math.sin(time * 0.55 + b.phase) * b.bob;

      // 0 ≈ flat open ◀▶, ~1.1 ≈ half-folded up — clear flap stroke.
      const flap = 0.2 + (0.5 + 0.5 * Math.sin(time * b.flapSpeed + b.phase)) * 0.95;
      const heading = ang + Math.PI / 2;
      const s = b.scale;

      pos.set(cx, cy, cz);
      yaw.setFromAxisAngle(Y, heading);

      // Right wing ◀ (tip at body)
      flapQ.setFromAxisAngle(Z, flap);
      quat.copy(yaw).multiply(flapQ);
      scl.set(s, s, s);
      m.compose(pos, quat, scl);
      wings.setMatrixAt(i * 2, m);

      // Left wing ▶ (tip at body)
      flapQ.setFromAxisAngle(Z, -flap);
      quat.copy(yaw).multiply(flapQ);
      scl.set(-s, s, s);
      m.compose(pos, quat, scl);
      wings.setMatrixAt(i * 2 + 1, m);

      quat.copy(yaw);
      scl.set(s, s, s);
      m.compose(pos, quat, scl);
      bodies.setMatrixAt(i, m);
    }
    wings.instanceMatrix.needsUpdate = true;
    bodies.instanceMatrix.needsUpdate = true;
  };

  applyPalette(palette);

  return {
    group,
    update,
    applyPalette,
    setSeason,
    dispose: () => {
      wingGeo.dispose();
      bodyGeo.dispose();
      wingMat.dispose();
      bodyMat.dispose();
    },
  };
}
