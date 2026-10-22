import * as THREE from 'three';
import { growTree, branchMatrix, type TreeModel, type Branch } from './tree';
import { moduleToWorld, QUIET_ZONE, type QrMatrix } from './qr';
import {
  foliageCells,
  leafColumnPose,
  leafCountFor,
  leavesPerModule,
} from './moduleLayout';
import { CELL, MODULE_HEIGHT } from './constants';
import { hashString, makeRng, clamp01, lerp } from './rng';
import type { Palette } from './palette';
import type { Species } from './species';

export interface Canopy {
  group: THREE.Group;
  leaves: THREE.InstancedMesh;
  branches: THREE.InstancedMesh;
  model: TreeModel;
  leafCount: number;
  /**
   * Idle sway + light top-down polish.
   * Positions stay put — leaves + finder grass already are the QR from above.
   */
  setMorph: (topDown: number, time: number) => void;
  setWind: (amount: number) => void;
  applyPalette: (p: Palette) => void;
  dispose: () => void;
}

/**
 * Foliage sits on non-finder dark modules; finder corners are grass.
 * Together they read as the code from above — no rearrange.
 */
export function buildCanopy(qr: QrMatrix, palette: Palette, species: Species): Canopy {
  const seed = hashString(qr.text);
  const rng = makeRng(seed ^ 0x9e3779b9);

  const cells = foliageCells(qr);
  const perModule = leavesPerModule(species);
  const leafCount = leafCountFor(qr, species);
  const treeHeight = qr.plot * species.heightFactor;

  const model = growTree(seed, { height: treeHeight, leafCount, species });

  const group = new THREE.Group();

  const leafGeo = new THREE.BoxGeometry(1, 0.3, 1);
  const leafMat = new THREE.MeshLambertMaterial();
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, leafCount);
  leaves.castShadow = false;
  leaves.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(leaves);

  // Pair organic samples with the nearest foliage module.
  const capacity = new Int16Array(cells.length);
  capacity.fill(perModule);
  const assign = new Int32Array(leafCount);
  const organicOrder = Array.from({ length: leafCount }, (_, i) => i);
  organicOrder.sort((a, b) => {
    const la = model.leaves[a]!;
    const lb = model.leaves[b]!;
    return Math.hypot(lb.x, lb.z) - Math.hypot(la.x, la.z);
  });

  const cellWorld = cells.map((cell) =>
    moduleToWorld(cell.x + QUIET_ZONE, cell.y + QUIET_ZONE, qr.plot, CELL),
  );

  for (const oi of organicOrder) {
    const leaf = model.leaves[oi]!;
    let best = -1;
    let bestD = Infinity;
    for (let c = 0; c < cells.length; c++) {
      if (capacity[c]! <= 0) continue;
      const d = Math.hypot(leaf.x - cellWorld[c]!.x, leaf.z - cellWorld[c]!.z);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    if (best < 0) {
      best = capacity.findIndex((n) => n > 0);
      if (best < 0) best = oi % cells.length;
    }
    const slot = perModule - capacity[best]!;
    capacity[best]!--;
    assign[oi] = best * perModule + slot;
  }

  const restPos = new Float32Array(leafCount * 3);
  const restScale = new Float32Array(leafCount * 3);
  const phase = new Float32Array(leafCount);
  const leafColors = new Float32Array(leafCount * 3);
  const frost = new Float32Array(leafCount);
  const restQuat = new Float32Array(leafCount * 4);
  let wintering = false;

  const qTmp = new THREE.Quaternion();
  const eul = new THREE.Euler();

  const bySlot = new Int32Array(leafCount);
  bySlot.fill(-1);
  for (let oi = 0; oi < leafCount; oi++) bySlot[assign[oi]!] = oi;

  for (let i = 0; i < leafCount; i++) {
    const oi = bySlot[i]! >= 0 ? bySlot[i]! : i;
    const organic = model.leaves[oi]!;
    const size = model.leafScales[oi] ?? 0.7;
    const pose = leafColumnPose(qr, i, treeHeight, rng, organic.y, size, species);

    restPos[i * 3] = pose.x;
    restPos[i * 3 + 1] = pose.y;
    restPos[i * 3 + 2] = pose.z;
    restScale[i * 3] = pose.sx;
    restScale[i * 3 + 1] = pose.sy;
    restScale[i * 3 + 2] = pose.sz;
    phase[i] = rng() * Math.PI * 2;

    eul.set((rng() - 0.5) * 1.0, rng() * Math.PI * 2, (rng() - 0.5) * 0.85);
    qTmp.setFromEuler(eul);
    restQuat[i * 4] = qTmp.x;
    restQuat[i * 4 + 1] = qTmp.y;
    restQuat[i * 4 + 2] = qTmp.z;
    restQuat[i * 4 + 3] = qTmp.w;
  }

  let maxR = 0;
  let maxY = 0;
  for (let i = 0; i < leafCount; i++) {
    maxR = Math.max(maxR, Math.hypot(restPos[i * 3]!, restPos[i * 3 + 2]!));
    maxY = Math.max(maxY, restPos[i * 3 + 1]! + restScale[i * 3 + 1]!);
  }
  model.canopyRadius = Math.max(model.canopyRadius, maxR);
  model.canopyTop = Math.max(model.canopyTop, maxY);

  const clipped = clipBranches(model.branches, restPos, restScale, leafCount, qr, maxR, maxY);

  const branchGeo = new THREE.CylinderGeometry(0.42, 1, 1, 6, 1);
  const branchMat = new THREE.MeshLambertMaterial({ transparent: true });
  const branches = new THREE.InstancedMesh(branchGeo, branchMat, clipped.length);
  branches.castShadow = false;

  const m = new THREE.Matrix4();
  clipped.forEach((b, i) => branches.setMatrixAt(i, branchMatrix(b, m)));
  branches.instanceMatrix.needsUpdate = true;
  group.add(branches);
  model.branches = clipped;

  let minLeafY = Infinity;
  let maxLeafY = -Infinity;
  for (let i = 0; i < leafCount; i++) {
    minLeafY = Math.min(minLeafY, restPos[i * 3 + 1]!);
    maxLeafY = Math.max(maxLeafY, restPos[i * 3 + 1]!);
  }
  const leafSpan = Math.max(0.001, maxLeafY - minLeafY);

  const applyPalette = (p: Palette) => {
    const rngC = makeRng(seed ^ 0x1234abcd);
    const leafPool = p.leaf.map((c) => new THREE.Color(c));
    wintering = p.id === 'winter';
    const snow = new THREE.Color('#f5f8fc');

    for (let i = 0; i < leafCount; i++) {
      const leaf = leafPool[Math.floor(rngC() * leafPool.length)]!.clone();
      const height = (restPos[i * 3 + 1]! - minLeafY) / leafSpan;
      const load = wintering ? clamp01((height - 0.18) * 1.15 + rngC() * 0.28) : 0;
      frost[i] = load;
      if (load > 0.05) leaf.lerp(snow, 0.35 + load * 0.55);
      leafColors[i * 3] = leaf.r;
      leafColors[i * 3 + 1] = leaf.g;
      leafColors[i * 3 + 2] = leaf.b;
    }

    const bark = new THREE.Color(species.bark?.bark ?? p.bark);
    const barkDark = new THREE.Color(species.bark?.barkDark ?? p.barkDark);
    model.branches.forEach((b, i) => branches.setColorAt(i, b.depth <= 1 ? barkDark : bark));
    if (branches.instanceColor) branches.instanceColor.needsUpdate = true;

    paintedOnce = false;
    paintLeafColors();
  };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const quatRest = new THREE.Quaternion();
  const quatFlat = new THREE.Quaternion();
  let wind = 1;
  let lastPolish = -1;
  let frame = 0;
  let paintedOnce = false;

  const paintLeafColors = () => {
    const c = new THREE.Color();
    for (let i = 0; i < leafCount; i++) {
      c.setRGB(leafColors[i * 3]!, leafColors[i * 3 + 1]!, leafColors[i * 3 + 2]!);
      leaves.setColorAt(i, c);
    }
    if (leaves.instanceColor) leaves.instanceColor.needsUpdate = true;
    paintedOnce = true;
  };

  const setMorph = (topDown: number, time: number) => {
    const top = clamp01(topDown);
    const flatten = Math.pow(top, 1.25);
    const gone = flatten >= 0.92;

    leaves.visible = !gone;
    branches.visible = flatten < 0.35;
    if (gone) return;

    if (!paintedOnce) paintLeafColors();

    frame++;
    const flattenChanged = Math.abs(flatten - lastPolish) > 0.015;
    if (!flattenChanged && frame % 2 !== 0) return;
    lastPolish = flatten;

    const swayScale = 1 - flatten * 0.95;
    branchMat.opacity = 1 - flatten * 1.2;
    branchMat.transparent = flatten > 0.02;

    for (let i = 0; i < leafCount; i++) {
      const gust = wind > 1.2 ? 1.55 : 1;
      const sway = 0.05 * wind * swayScale * Math.sin(time * 0.9 * gust + phase[i]!);
      const snowPuff = wintering ? 1 + frost[i]! * 0.35 : 1;

      const yFlat = MODULE_HEIGHT * 0.5;
      const y = lerp(restPos[i * 3 + 1]!, yFlat, flatten);
      pos.set(
        restPos[i * 3]! + sway * (1 - flatten),
        y,
        restPos[i * 3 + 2]! + sway * 0.55 * (1 - flatten),
      );
      scl.set(
        lerp(restScale[i * 3]! * snowPuff, CELL * 0.92, flatten),
        lerp(restScale[i * 3 + 1]! * (wintering ? 1 + frost[i]! * 0.2 : 1), MODULE_HEIGHT, flatten),
        lerp(restScale[i * 3 + 2]! * snowPuff, CELL * 0.92, flatten),
      );

      quatRest.set(
        restQuat[i * 4]!,
        restQuat[i * 4 + 1]!,
        restQuat[i * 4 + 2]!,
        restQuat[i * 4 + 3]!,
      );
      quatFlat.identity();
      quat.copy(quatRest).slerp(quatFlat, flatten);

      mat4.compose(pos, quat, scl);
      leaves.setMatrixAt(i, mat4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  };

  const dispose = () => {
    branchGeo.dispose();
    branchMat.dispose();
    leafGeo.dispose();
    leafMat.dispose();
  };

  const setWind = (amount: number) => {
    wind = Math.max(0, amount);
  };

  applyPalette(palette);
  paintLeafColors();
  setMorph(0, 0);

  return { group, leaves, branches, model, leafCount, setMorph, setWind, applyPalette, dispose };
}

/** Max leaf top near (x,z) — used to bury vertical tips under the crown. */
function localLeafCeiling(
  x: number,
  z: number,
  leafPos: Float32Array,
  leafScale: Float32Array,
  leafCount: number,
) {
  let maxY = 0;
  let hit = false;
  for (let i = 0; i < leafCount; i++) {
    const d = Math.hypot(x - leafPos[i * 3]!, z - leafPos[i * 3 + 2]!);
    if (d > 2.4) continue;
    hit = true;
    maxY = Math.max(maxY, leafPos[i * 3 + 1]! + leafScale[i * 3 + 1]! * 0.55);
  }
  return hit ? maxY : 0;
}

/** World XZ → payload module, or null outside the matrix. */
function worldToModule(x: number, z: number, qr: QrMatrix) {
  const mx = Math.floor(x + qr.plot / 2);
  const mz = Math.floor(z + qr.plot / 2);
  if (
    mx < QUIET_ZONE ||
    mz < QUIET_ZONE ||
    mx >= qr.plot - QUIET_ZONE ||
    mz >= qr.plot - QUIET_ZONE
  ) {
    return null;
  }
  return { x: mx - QUIET_ZONE, y: mz - QUIET_ZONE };
}

/**
 * Pull bare tips back under the leaf cloud (XZ and Y) and out of finder grass.
 */
function clipBranches(
  branches: Branch[],
  leafPos: Float32Array,
  leafScale: Float32Array,
  leafCount: number,
  qr: QrMatrix,
  canopyR: number,
  canopyTop: number,
): Branch[] {
  const coverR = Math.max(canopyR * 0.9, 1);
  const globalTop = canopyTop * 0.94;
  const out: Branch[] = [];

  for (const b of branches) {
    const start = b.start.clone();
    let end = b.end.clone();

    // Never let wood occupy finder turf.
    const tipMod = worldToModule(end.x, end.z, qr);
    if (tipMod && qr.reserved[tipMod.y * qr.size + tipMod.x]) {
      for (let step = 0; step < 8; step++) {
        end.lerp(start, 0.22);
        const m = worldToModule(end.x, end.z, qr);
        if (!m || !qr.reserved[m.y * qr.size + m.x]) break;
      }
      const still = worldToModule(end.x, end.z, qr);
      if (still && qr.reserved[still.y * qr.size + still.x]) {
        if (b.depth <= 1) {
          end.copy(start).addScaledVector(b.end.clone().sub(start).normalize(), b.radius * 2);
        } else {
          continue;
        }
      }
    }

    let tipR = Math.hypot(end.x, end.z);
    if (tipR > coverR && b.depth >= 2) {
      const k = coverR / tipR;
      end.x *= k;
      end.z *= k;
      tipR = coverR;
    }

    const ceiling = localLeafCeiling(end.x, end.z, leafPos, leafScale, leafCount);
    const limitY = ceiling > 0.1 ? ceiling * 0.9 : globalTop;
    if (end.y > limitY && b.depth >= 1) {
      for (let step = 0; step < 10 && end.y > limitY; step++) {
        end.lerp(start, 0.18);
      }
      if (end.y > limitY + 0.4) {
        if (b.depth >= 2) continue;
        end.y = Math.min(end.y, limitY);
      }
    }

    if (b.depth >= 3) {
      let nearest = Infinity;
      for (let i = 0; i < leafCount; i++) {
        const d = Math.hypot(
          end.x - leafPos[i * 3]!,
          end.y - leafPos[i * 3 + 1]!,
          end.z - leafPos[i * 3 + 2]!,
        );
        if (d < nearest) nearest = d;
      }
      if (nearest > 1.35) {
        end.lerp(start, 0.55);
        if (end.distanceTo(start) < 0.4) continue;
      }
    }

    if (end.distanceTo(start) < 0.2) continue;
    out.push({ start, end, radius: b.radius, depth: b.depth });
  }

  return out.length > 0 ? out : branches.slice(0, 1);
}
