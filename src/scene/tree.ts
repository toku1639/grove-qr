import * as THREE from 'three';
import { makeRng, lerp, clamp01, type Rng } from './rng';
import type { Species } from './species';

export interface Branch {
  start: THREE.Vector3;
  end: THREE.Vector3;
  radius: number;
  depth: number;
}

export interface TreeModel {
  branches: Branch[];
  /** Resting positions of every leaf while the canopy is grown. */
  leaves: THREE.Vector3[];
  /** Per-leaf size, so each species keeps its own foliage texture. */
  leafScales: number[];
  /** Height of the woody skeleton. */
  height: number;
  /** Top of the foliage, which sits above the branch tips. */
  canopyTop: number;
  /** Furthest leaf from the trunk axis. */
  canopyRadius: number;
}

export interface GrowOptions {
  height: number;
  leafCount: number;
  species: Species;
}

/**
 * Grows a branch skeleton, then scatters leaves around the terminal tips.
 * Everything is driven by `rng`, so the same URL always yields the same tree.
 */
export function growTree(seed: number, opts: GrowOptions): TreeModel {
  const sp = opts.species;
  const rng = makeRng(seed);
  const branches: Branch[] = [];

  const trunkLen = opts.height * sp.trunkFraction;

  const grow = (
    start: THREE.Vector3,
    dir: THREE.Vector3,
    length: number,
    radius: number,
    depth: number,
  ) => {
    const end = start.clone().addScaledVector(dir, length);
    branches.push({ start: start.clone(), end, radius, depth });

    if (depth >= sp.maxDepth || length < 0.3) return;

    const children = depth === 0 ? 3 : rng() < sp.forkChance ? 3 : 2;

    for (let i = 0; i < children; i++) {
      const angle = lerp(sp.spread[0], sp.spread[1], rng()) * (depth === 0 ? 0.62 : 1);

      // The first two rings are spaced evenly around the compass. Left purely to
      // chance the trunk throws all its weight to one side and the tree leans.
      const axis =
        depth <= 1
          ? tiltAxis((i / children) * Math.PI * 2 + rng() * 0.5 + depth * 1.1)
          : new THREE.Vector3(rng() * 2 - 1, rng() * 0.35, rng() * 2 - 1).normalize();

      const next = dir.clone().applyAxisAngle(axis, angle);
      const floor = depth < 3 ? sp.upBiasLow : sp.upBiasHigh;
      next.y = Math.max(next.y, floor);
      next.normalize();

      const decay = lerp(sp.lengthDecay[0], sp.lengthDecay[1], rng());
      grow(end, next, length * decay, radius * sp.radiusDecay, depth + 1);
    }
  };

  grow(
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(rng() * 0.1 - 0.05, 1, rng() * 0.1 - 0.05).normalize(),
    trunkLen,
    opts.height * sp.trunkRadius,
    0,
  );

  const height = branches.reduce((m, b) => Math.max(m, b.end.y), 0);
  const { leaves, leafScales } = scatterLeaves(branches, opts.leafCount, height, sp, rng);

  return { branches, leaves, leafScales, height, ...canopyBounds(leaves, leafScales, height) };
}

/**
 * Scatters leaves along the outer branches, then forces the result into the
 * species silhouette.
 *
 * Sampling along whole branches rather than only at their tips is what keeps a
 * canopy looking full: tip-only clustering leaves visible gaps once the branch
 * structure gets sparse.
 */
function scatterLeaves(
  branches: Branch[],
  count: number,
  height: number,
  sp: Species,
  rng: Rng,
) {
  const minDepth = sp.leafFromDepth;
  const outer = branches.filter((b) => b.depth >= minDepth);
  const pool = outer.length > 0 ? outer : branches;

  const leaves: THREE.Vector3[] = [];
  const leafScales: number[] = [];

  for (let i = 0; i < count; i++) {
    const branch = pool[Math.floor(rng() * pool.length)];
    // Conifer arms need cover right back to the trunk, or the whorls read as
    // bare spokes; broadleaves keep their inner branches showing.
    const along = lerp(sp.leafAlong[0], sp.leafAlong[1], rng());
    const bx = branch.start.x + (branch.end.x - branch.start.x) * along;
    const by = branch.start.y + (branch.end.y - branch.start.y) * along;
    const bz = branch.start.z + (branch.end.z - branch.start.z) * along;

    const r = lerp(sp.cluster[0], sp.cluster[1], rng());
    const theta = rng() * Math.PI * 2;
    const phi = Math.acos(2 * rng() - 1);
    const sinPhi = Math.sin(phi);

    // Willows hang: the vertical offset is stretched and pulled downward.
    const vertical = r * Math.cos(phi) * sp.clusterYScale;
    const drop = sp.clusterYScale > 1 ? -Math.abs(vertical) * 0.55 : 0;

    leaves.push(
      new THREE.Vector3(
        bx + r * sinPhi * Math.cos(theta),
        by + vertical + drop,
        bz + r * sinPhi * Math.sin(theta),
      ),
    );
    leafScales.push(lerp(sp.leafSize[0], sp.leafSize[1], rng()));
  }

  applyTaper(leaves, sp.taper, height);
  return { leaves, leafScales };
}

/**
 * Pulls the canopy in toward its axis with height, so `taper` alone decides the
 * silhouette: 0 leaves a broad crown, 1 pinches toward a cone. Doing this as a
 * post-pass means the branch structure stays organic but the outline is exact.
 */
function applyTaper(leaves: THREE.Vector3[], taper: number, height: number) {
  if (taper <= 0.001 || leaves.length === 0) return;

  let base = Infinity;
  let maxR = 0;
  for (const l of leaves) {
    base = Math.min(base, l.y);
    maxR = Math.max(maxR, Math.hypot(l.x, l.z));
  }
  const span = Math.max(height - base, 0.001);
  if (maxR < 0.001) return;

  for (const l of leaves) {
    const ratio = clamp01((l.y - base) / span);
    const limit = maxR * (1 - taper * ratio);
    const radial = Math.hypot(l.x, l.z);
    if (radial > limit && radial > 0.001) {
      const k = limit / radial;
      l.x *= k;
      l.z *= k;
    }
  }
}

/** Extent of the foliage itself, which the camera has to frame — not the branches. */
function canopyBounds(leaves: THREE.Vector3[], leafScales: number[], fallback: number) {
  let canopyTop = fallback;
  let canopyRadius = 0;
  for (let i = 0; i < leaves.length; i++) {
    const half = (leafScales[i] ?? 0.5) * 0.5;
    canopyTop = Math.max(canopyTop, leaves[i].y + half);
    canopyRadius = Math.max(canopyRadius, Math.hypot(leaves[i].x, leaves[i].z) + half);
  }
  return { canopyTop, canopyRadius };
}

/** A horizontal axis at `azimuth`, for tilting a near-vertical branch evenly. */
function tiltAxis(azimuth: number) {
  return new THREE.Vector3(Math.cos(azimuth), 0, Math.sin(azimuth));
}

/** Builds the per-branch instance matrix for a unit-height cylinder on +Y. */
const UP = new THREE.Vector3(0, 1, 0);
export function branchMatrix(branch: Branch, out: THREE.Matrix4): THREE.Matrix4 {
  const dir = branch.end.clone().sub(branch.start);
  const len = dir.length();
  const mid = branch.start.clone().addScaledVector(dir, 0.5);
  const quat = new THREE.Quaternion().setFromUnitVectors(UP, dir.normalize());

  return out.compose(mid, quat, new THREE.Vector3(branch.radius, len, branch.radius));
}
