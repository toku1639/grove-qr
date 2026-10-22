import * as THREE from 'three';
import { makeRng } from './rng';
import type { QrMatrix } from './qr';
import type { Palette } from './palette';
import { CLIMATES, type ClimateId } from './climate';

const COUNT = 60;

export interface Motes {
  points: THREE.InstancedMesh;
  update: (dt: number, time: number, visibility: number) => void;
  applyPalette: (p: Palette) => void;
  setClimate: (id: ClimateId) => void;
  setGust: (amount: number) => void;
  dispose: () => void;
}

/** Drifting weather — petals in calm/wind, streaks in rain, flakes in snow. */
export function buildMotes(qr: QrMatrix, palette: Palette): Motes {
  const rng = makeRng(0xfa11);
  const spread = qr.plot * 0.5;
  const ceiling = qr.plot * 0.72;

  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial({ transparent: true });
  const points = new THREE.InstancedMesh(geo, mat, COUNT);
  points.frustumCulled = false;

  // x, y, z, fallSpeed, swirl, phase, sizeX, sizeY, sizeZ
  const state = new Float32Array(COUNT * 9);
  let climate: ClimateId = 'calm';
  let paletteRef = palette;
  let gust = 1;
  let active = Math.floor(COUNT * CLIMATES.calm.density);

  const spawn = (i: number) => {
    const o = i * 9;
    state[o] = (rng() - 0.5) * spread * 1.7;
    state[o + 1] = rng() * ceiling;
    state[o + 2] = (rng() - 0.5) * spread * 1.7;
    state[o + 5] = rng() * Math.PI * 2;

    if (climate === 'rain') {
      state[o + 3] = 7 + rng() * 6;
      state[o + 4] = 0.05 + rng() * 0.12;
      state[o + 6] = 0.08 + rng() * 0.05;
      state[o + 7] = 0.9 + rng() * 0.7;
      state[o + 8] = 0.08 + rng() * 0.05;
      return;
    }

    if (climate === 'snow') {
      state[o + 3] = 0.35 + rng() * 0.55;
      state[o + 4] = 0.55 + rng() * 0.9;
      const s = 0.22 + rng() * 0.28;
      state[o + 6] = s;
      state[o + 7] = s * 0.55;
      state[o + 8] = s;
      return;
    }

    // calm / wind — thin petal flakes (not chunky boxes)
    const gust = climate === 'wind' ? 1.55 : 1;
    state[o + 3] = (0.55 + rng() * 1.1) * gust;
    state[o + 4] = (0.35 + rng() * 0.95) * gust;
    state[o + 6] = 0.16 + rng() * 0.1;
    state[o + 7] = 0.03 + rng() * 0.025;
    state[o + 8] = 0.14 + rng() * 0.08;
  };

  for (let i = 0; i < COUNT; i++) spawn(i);

  const paint = () => {
    const rngC = makeRng(0xbeef ^ climate.length * 17);
    let pool: THREE.Color[];
    if (climate === 'rain') {
      pool = ['#8eb0c8', '#a7c2d4', '#6f93ad', '#c5d7e4'].map((c) => new THREE.Color(c));
    } else if (climate === 'snow') {
      pool = ['#ffffff', '#f4f7fb', '#e8eef5', '#dde6f0'].map((c) => new THREE.Color(c));
    } else {
      pool = paletteRef.leaf.map((c) => new THREE.Color(c));
    }
    for (let i = 0; i < COUNT; i++) {
      points.setColorAt(i, pool[Math.floor(rngC() * pool.length)]);
    }
    if (points.instanceColor) points.instanceColor.needsUpdate = true;
  };

  const refreshActive = () => {
    // Summer calm shouldn't rain "petals" — greens stay on the tree.
    if (paletteRef.id === 'summer' && (climate === 'calm' || climate === 'wind')) {
      active = climate === 'wind' ? Math.floor(COUNT * 0.2) : 0;
      return;
    }
    active = Math.min(COUNT, Math.floor(COUNT * CLIMATES[climate].density));
  };

  const applyPalette = (p: Palette) => {
    paletteRef = p;
    refreshActive();
    for (let i = 0; i < COUNT; i++) spawn(i);
    paint();
  };

  const setClimate = (id: ClimateId) => {
    if (climate === id) return;
    climate = id;
    refreshActive();
    for (let i = 0; i < COUNT; i++) spawn(i);
    paint();
  };

  const setGust = (amount: number) => {
    gust = Math.max(0.4, amount);
  };

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();

  const update = (dt: number, time: number, visibility: number) => {
    mat.opacity = visibility * (climate === 'rain' ? 0.72 : climate === 'snow' ? 0.92 : 0.95);
    points.visible = visibility > 0.02;
    if (!points.visible) return;

    const windPush =
      (climate === 'wind' ? 1.8 : climate === 'rain' ? 0.35 : climate === 'snow' ? 0.7 : 0.55) *
      gust;

    for (let i = 0; i < COUNT; i++) {
      const o = i * 9;
      if (i >= active) {
        scl.set(0, 0, 0);
        m.compose(pos.set(0, -10, 0), quat.identity(), scl);
        points.setMatrixAt(i, m);
        continue;
      }

      state[o + 1] -= state[o + 3] * dt;
      if (climate === 'wind' || (climate === 'snow' && gust > 1.2)) {
        state[o] += dt * (1.4 + state[o + 4]) * gust;
        if (state[o] > spread * 0.95) state[o] = -spread * 0.95;
      }
      if (state[o + 1] < 0.15) spawn(i);

      const swirl = state[o + 4];
      const drift = Math.sin(time * swirl + state[o + 5]) * (climate === 'rain' ? 0.15 : 0.9);
      pos.set(
        state[o] + drift * windPush,
        state[o + 1],
        state[o + 2] + Math.cos(time * swirl * 0.8 + state[o + 5]) * (climate === 'rain' ? 0.08 : 0.9),
      );

      if (climate === 'rain') {
        euler.set(0.15, 0, 0.08);
      } else {
        euler.set(time * swirl, time * swirl * 0.7, state[o + 5]);
      }
      quat.setFromEuler(euler);
      scl.set(state[o + 6], state[o + 7], state[o + 8]);
      m.compose(pos, quat, scl);
      points.setMatrixAt(i, m);
    }
    points.instanceMatrix.needsUpdate = true;
  };

  applyPalette(palette);

  return {
    points,
    update,
    applyPalette,
    setClimate,
    setGust,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}
