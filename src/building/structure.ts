import * as THREE from 'three';
import { type QrMatrix } from '../scene/qr';
import { leafTarget, leafCountFor } from '../scene/moduleLayout';
import { CELL, LEAVES_PER_MODULE } from '../scene/constants';
import { hashString, makeRng, clamp01, lerp } from '../scene/rng';
import type { BuildingPalette } from './palette';
import { BUILDING_TYPES, type BuildingType, type BuildingTypeId } from './types';

const VOX = 0.7;

/** wall | window | roof | porch | trim | door | chimney */
type Kind = 0 | 1 | 2 | 3 | 4 | 5 | 6;

type Voxel = {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
  kind: Kind;
};

export interface BuildingStructure {
  group: THREE.Group;
  blocks: THREE.InstancedMesh;
  blockCount: number;
  buildingTop: number;
  buildingRadius: number;
  setMorph: (t: number, time: number) => void;
  applyPalette: (p: BuildingPalette) => void;
  dispose: () => void;
}

/**
 * Building in the plot centre. Blocks later fly to QR modules —
 * the silhouette is independent of the dark-module grid.
 */
export function buildStructure(
  qr: QrMatrix,
  palette: BuildingPalette,
  type: BuildingType | BuildingTypeId = 'house',
): BuildingStructure {
  const buildingType = typeof type === 'string' ? BUILDING_TYPES[type] : type;
  const seed = hashString(qr.text);
  const rng = makeRng(seed ^ 0xb01d1e);
  const darkCells = qr.darkCells;
  const blockCount = leafCountFor(qr);
  const plotW = qr.plot * CELL;

  const group = new THREE.Group();
  const geo = new THREE.BoxGeometry(1, 1, 1);
  const mat = new THREE.MeshLambertMaterial();
  const blocks = new THREE.InstancedMesh(geo, mat, blockCount);
  blocks.castShadow = true;
  blocks.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  group.add(blocks);

  const voxels =
    buildingType.id === 'tower'
      ? craftLatticeTower(plotW, buildingType.heightFactor, rng)
      : buildingType.id === 'shrine'
        ? craftShrine(plotW, buildingType.heightFactor, rng)
        : craftAmericanHouse(plotW, buildingType.heightFactor, rng);
  const picked = fitVoxelCount(voxels, blockCount, rng);

  const restPos = new Float32Array(blockCount * 3);
  const qrPos = new Float32Array(blockCount * 3);
  const restScale = new Float32Array(blockCount * 3);
  const qrScale = new Float32Array(blockCount * 3);
  const delay = new Float32Array(blockCount);
  const kind = new Uint8Array(blockCount);

  let buildingTop = VOX;
  let buildingRadius = VOX;

  for (let i = 0; i < blockCount; i++) {
    const v = picked[i]!;
    restPos[i * 3] = v.x;
    restPos[i * 3 + 1] = v.y;
    restPos[i * 3 + 2] = v.z;
    restScale[i * 3] = v.sx;
    restScale[i * 3 + 1] = v.sy;
    restScale[i * 3 + 2] = v.sz;
    kind[i] = v.kind;

    buildingTop = Math.max(buildingTop, v.y + v.sy * 0.5);
    buildingRadius = Math.max(buildingRadius, Math.hypot(v.x, v.z) + Math.max(v.sx, v.sz) * 0.5);

    const target = leafTarget(qr, i);
    qrPos[i * 3] = target.x;
    qrPos[i * 3 + 1] = target.y;
    qrPos[i * 3 + 2] = target.z;
    qrScale[i * 3] = target.sx;
    qrScale[i * 3 + 1] = target.sy;
    qrScale[i * 3 + 2] = target.sz;

    const heightT = clamp01(v.y / Math.max(buildingTop, 1));
    delay[i] = clamp01(0.02 + heightT * 0.18 + rng() * 0.1);
  }

  const restColor = new Float32Array(blockCount * 3);
  const qrColor = new Float32Array(blockCount * 3);
  let paintedFor = -1;

  const applyPalette = (p: BuildingPalette) => {
    const rngC = makeRng(seed ^ 0x51a7e);
    const pools: THREE.Color[][] = [
      p.wall.map((c) => new THREE.Color(c)),
      p.window.map((c) => new THREE.Color(c)),
      p.roof.map((c) => new THREE.Color(c)),
      p.trim.map((c) => new THREE.Color(c)),
      p.trim.map((c) => new THREE.Color(c)),
      p.door.map((c) => new THREE.Color(c)),
      p.chimney.map((c) => new THREE.Color(c)),
    ];
    // porch / base: tokyo yellow hall, shrine stone, else warm trim
    pools[3] =
      p.id === 'tokyo'
        ? ['#f0c020', '#e8b018', '#f5d040'].map((c) => new THREE.Color(c))
        : p.id === 'shrine'
          ? ['#9a9488', '#8a8478', '#aea89c'].map((c) => new THREE.Color(c))
          : p.trim.map((c) => new THREE.Color(c).offsetHSL(0.05, 0.05, -0.04));

    const qrPool = p.qr.map((c) => new THREE.Color(c));
    const moduleTone = Array.from(
      { length: darkCells.length },
      () => qrPool[Math.floor(rngC() * qrPool.length)]!,
    );

    for (let i = 0; i < blockCount; i++) {
      const pool = pools[kind[i]!] ?? pools[0]!;
      const a = pool[Math.floor(rngC() * pool.length)]!;
      const b = moduleTone[Math.floor(i / LEAVES_PER_MODULE)]!;
      restColor[i * 3] = a.r;
      restColor[i * 3 + 1] = a.g;
      restColor[i * 3 + 2] = a.b;
      qrColor[i * 3] = b.r;
      qrColor[i * 3 + 1] = b.g;
      qrColor[i * 3 + 2] = b.b;
    }
    paintedFor = -1;
  };

  const mat4 = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const color = new THREE.Color();

  const setMorph = (t: number, _time: number) => {
    const settled = t > 0.999;
    for (let i = 0; i < blockCount; i++) {
      const d = delay[i]!;
      const local = clamp01((t - d) / Math.max(1e-4, 1 - d));
      const e = local < 0.5 ? 4 * local ** 3 : 1 - (-2 * local + 2) ** 3 / 2;
      const lift = Math.sin(e * Math.PI) * 1.05;

      pos.set(
        restPos[i * 3]! + (qrPos[i * 3]! - restPos[i * 3]!) * e,
        restPos[i * 3 + 1]! + (qrPos[i * 3 + 1]! - restPos[i * 3 + 1]!) * e + lift,
        restPos[i * 3 + 2]! + (qrPos[i * 3 + 2]! - restPos[i * 3 + 2]!) * e,
      );
      scl.set(
        restScale[i * 3]! + (qrScale[i * 3]! - restScale[i * 3]!) * e,
        restScale[i * 3 + 1]! + (qrScale[i * 3 + 1]! - restScale[i * 3 + 1]!) * e,
        restScale[i * 3 + 2]! + (qrScale[i * 3 + 2]! - restScale[i * 3 + 2]!) * e,
      );
      quat.identity();
      mat4.compose(pos, quat, scl);
      blocks.setMatrixAt(i, mat4);

      if (paintedFor !== t) {
        color.setRGB(
          restColor[i * 3]! + (qrColor[i * 3]! - restColor[i * 3]!) * e,
          restColor[i * 3 + 1]! + (qrColor[i * 3 + 1]! - restColor[i * 3 + 1]!) * e,
          restColor[i * 3 + 2]! + (qrColor[i * 3 + 2]! - restColor[i * 3 + 2]!) * e,
        );
        blocks.setColorAt(i, color);
      }
    }
    blocks.instanceMatrix.needsUpdate = true;
    if (paintedFor !== t && blocks.instanceColor) {
      blocks.instanceColor.needsUpdate = true;
      paintedFor = t;
    }
    blocks.castShadow = !settled;
  };

  applyPalette(palette);

  return {
    group,
    blocks,
    blockCount,
    buildingTop,
    buildingRadius,
    setMorph,
    applyPalette,
    dispose: () => {
      geo.dispose();
      mat.dispose();
    },
  };
}

/**
 * American two-storey: clapboard massing first, then door / windows / chimney
 * placed on top (protruding) so they never get lost in the wall mesh.
 */
function craftAmericanHouse(plotW: number, heightFactor: number, rng: () => number): Voxel[] {
  const out: Voxel[] = [];

  const totalH = plotW * heightFactor;
  const wallH = totalH * 0.56;
  const roofH = totalH * 0.36;
  const bodyW = plotW * 0.48;
  const bodyD = bodyW * 0.78;
  const storey = wallH * 0.5;
  const halfW = bodyW * 0.5;
  const halfD = bodyD * 0.5;
  const course = wallH / 12;
  const skin = course * 0.4;

  const push = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    kind: Kind,
  ) => {
    const s = lerp(0.98, 1.02, rng());
    out.push({ x, y, z, sx: sx * s, sy: sy * s, sz: sz * s, kind });
  };

  // Segment centres — openings snap to these so they always hit.
  const xSegs = 5;
  const zSegs = 4;
  const xBoard = bodyW / xSegs;
  const zBoard = bodyD / zSegs;
  const xCenter = (i: number) => -halfW + (i + 0.5) * xBoard;
  const zCenter = (i: number) => -halfD + (i + 0.5) * zBoard;

  const doorW = xBoard * 0.85;
  const doorH = storey * 0.72;
  const winW = xBoard * 0.7;
  const winH = storey * 0.36;
  // Front: door on centre board, windows on boards 1 & 3, both storeys
  const frontWinCols = [1, 3];
  const sideWinRows = [1, 2];

  const winYForStorey = (floor: 0 | 1) => storey * floor + storey * 0.52;

  const isDoorCell = (face: 'front', i: number, y: number) =>
    face === 'front' && i === 2 && y < doorH + course * 0.2;

  const isFrontWinCell = (i: number, y: number) => {
    if (!frontWinCols.includes(i)) return false;
    for (const fl of [0, 1] as const) {
      const cy = winYForStorey(fl);
      if (Math.abs(y - cy) < winH * 0.55) return true;
    }
    return false;
  };

  const isSideWinCell = (j: number, y: number) => {
    if (!sideWinRows.includes(j)) return false;
    for (const fl of [0, 1] as const) {
      const cy = winYForStorey(fl);
      if (Math.abs(y - cy) < winH * 0.55) return true;
    }
    return false;
  };

  // ---- walls (skip opening cells — filled later as features) ----
  const courses = 12;
  for (let c = 0; c < courses; c++) {
    const y = (c + 0.5) * course;
    const sy = course * 1.1;

    // Front
    for (let i = 0; i < xSegs; i++) {
      if (isDoorCell('front', i, y) || isFrontWinCell(i, y)) continue;
      push(xCenter(i), y, -halfD, xBoard * 1.05, sy, skin, 0);
    }
    // Back
    for (let i = 0; i < xSegs; i++) {
      if (isFrontWinCell(i, y)) continue;
      push(xCenter(i), y, halfD, xBoard * 1.05, sy, skin, 0);
    }
    // Left
    for (let j = 0; j < zSegs; j++) {
      if (isSideWinCell(j, y)) continue;
      push(-halfW, y, zCenter(j), skin, sy, zBoard * 1.05, 0);
    }
    // Right (leave lower-front clear for garage)
    for (let j = 0; j < zSegs; j++) {
      if (y < storey * 0.95 && zCenter(j) < halfD * 0.2) continue;
      if (isSideWinCell(j, y)) continue;
      push(halfW, y, zCenter(j), skin, sy, zBoard * 1.05, 0);
    }
  }

  // Corner trim
  for (const [cx, cz] of [
    [-halfW, -halfD],
    [halfW, -halfD],
    [-halfW, halfD],
    [halfW, halfD],
  ] as const) {
    push(cx, wallH * 0.5, cz, course * 0.55, wallH * 1.02, course * 0.55, 4);
  }

  // ---- roof ----
  const roofLayers = 9;
  const eave = course * 1.2;
  for (let layer = 0; layer < roofLayers; layer++) {
    const t = layer / (roofLayers - 1);
    const y = wallH + course * 0.2 + t * roofH;
    const zHalf = (halfD + eave) * (1 - t * 0.9);
    push(0, y, 0, bodyW + eave * 2, course * 0.36, Math.max(course, zHalf * 2), 2);
  }

  // Gable ends
  for (let layer = 0; layer < roofLayers - 1; layer++) {
    const t = (layer + 0.5) / roofLayers;
    const y = wallH + t * roofH;
    const span = halfD * (1 - t * 0.9);
    if (span < course * 0.5) continue;
    const segs = Math.max(2, Math.ceil((span * 2) / zBoard));
    for (const xFace of [-halfW, halfW]) {
      for (let i = 0; i < segs; i++) {
        const z = -span + (i + 0.5) * ((span * 2) / segs);
        push(xFace, y, z, skin, course * 1.02, (span * 2) / segs * 1.05, 0);
      }
    }
  }

  // ---- porch ----
  const porchD = bodyD * 0.2;
  const porchW = bodyW * 0.55;
  push(0, course * 0.12, -halfD - porchD * 0.55, porchW, course * 0.28, porchD, 3);
  push(0, storey * 0.95, -halfD - porchD * 0.55, porchW * 1.06, course * 0.3, porchD * 1.05, 2);
  for (const x of [-porchW * 0.4, porchW * 0.4]) {
    push(x, storey * 0.48, -halfD - porchD * 0.85, course * 0.4, storey * 0.95, course * 0.4, 4);
  }

  // ---- FEATURES (protrude past wall skin so they always read) ----
  const frontZ = -halfD - skin * 0.55;
  const backZ = halfD + skin * 0.55;
  const leftX = -halfW - skin * 0.55;

  // Front door (+ trim frame)
  push(0, doorH * 0.5, frontZ, doorW, doorH, skin * 0.7, 5);
  push(0, doorH * 0.5, frontZ - skin * 0.15, doorW * 1.2, doorH * 1.08, skin * 0.25, 4);

  // Front & back windows (both storeys), with trim
  for (const col of frontWinCols) {
    const wx = xCenter(col);
    for (const fl of [0, 1] as const) {
      const wy = winYForStorey(fl);
      for (const z of [frontZ, backZ]) {
        push(wx, wy, z, winW, winH, skin * 0.55, 1);
        push(wx, wy, z - Math.sign(z) * skin * 0.12, winW * 1.18, winH * 1.18, skin * 0.22, 4);
      }
    }
  }

  // Left-side windows
  for (const row of sideWinRows) {
    const wz = zCenter(row);
    for (const fl of [0, 1] as const) {
      const wy = winYForStorey(fl);
      push(leftX, wy, wz, skin * 0.55, winH, winW, 1);
      push(leftX - skin * 0.12, wy, wz, skin * 0.22, winH * 1.18, winW * 1.18, 4);
    }
  }

  // Chimney — clearly above the ridge
  const chimW = course * 1.6;
  const chimH = roofH * 0.55;
  const chimX = halfW * 0.35;
  const chimBase = wallH + roofH * 0.72;
  push(chimX, chimBase + chimH * 0.35, 0, chimW, chimH, chimW, 6);
  push(chimX, chimBase + chimH * 0.75, 0, chimW * 1.35, course * 0.4, chimW * 1.35, 6);

  // ---- garage ----
  const gw = bodyW * 0.38;
  const gd = bodyD * 0.68;
  const gh = storey * 0.88;
  const ox = halfW + gw * 0.48;
  const gCourses = 6;
  const gCourse = gh / gCourses;
  for (let c = 0; c < gCourses; c++) {
    const y = (c + 0.5) * gCourse;
    const sy = gCourse * 1.08;
    push(ox, y, gd * 0.5, gw * 0.92, sy, skin, 0);
    push(ox - gw * 0.5, y, 0, skin, sy, gd * 0.92, 0);
    push(ox + gw * 0.5, y, 0, skin, sy, gd * 0.92, 0);
  }
  // Garage door as one clear panel
  push(ox, gh * 0.42, -gd * 0.5 - skin * 0.3, gw * 0.75, gh * 0.78, skin * 0.6, 5);
  push(ox, gh * 0.42, -gd * 0.5 - skin * 0.5, gw * 0.82, gh * 0.84, skin * 0.2, 4);
  push(ox, gh, 0, gw * 1.05, course * 0.34, gd * 1.05, 2);

  // Foundation
  push(0, -course * 0.1, 0, bodyW + course, course * 0.26, bodyD + course, 3);
  push(ox, -course * 0.1, 0, gw + course * 0.4, course * 0.26, gd + course * 0.4, 3);

  return out;
}

/**
 * Tokyo Tower — SoftLinks / pixel-art silhouette:
 * fat red A-frame legs → white+blue main deck → slim red shaft →
 * smaller upper deck → long striped needle. Hollow centre.
 */
function craftLatticeTower(plotW: number, heightFactor: number, rng: () => number): Voxel[] {
  const out: Voxel[] = [];
  const H = plotW * heightFactor;
  // SoftLinks-style proportions (main deck lower than real 150/333 for a clearer read)
  const mainY = H * 0.38;
  const specY = H * 0.72;
  const baseHalf = plotW * 0.36;
  const atMain = plotW * 0.08;
  const atSpec = plotW * 0.035;
  const cell = plotW * 0.028;

  const push = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    kind: Kind,
  ) => {
    const s = lerp(0.98, 1.02, rng());
    out.push({ x, y, z, sx: sx * s, sy: sy * s, sz: sz * s, kind });
  };

  /** Taper half-width along the shaft (legs → special deck). */
  const halfAt = (y: number) => {
    if (y <= mainY) {
      const t = clamp01(y / mainY);
      // Aggressive inward curve like the voxel reference
      return lerp(baseHalf, atMain, Math.pow(t, 0.75));
    }
    const t = clamp01((y - mainY) / Math.max(1e-4, specY - mainY));
    return lerp(atMain * 0.85, atSpec, t);
  };

  // ---- Lower A-frame: thick corner legs + face lattice (still hollow) ----
  const lowerBands = 12;
  for (let i = 0; i < lowerBands; i++) {
    const t0 = i / lowerBands;
    const t1 = (i + 1) / lowerBands;
    const y = ((t0 + t1) * 0.5) * mainY;
    const sy = (mainY / lowerBands) * 1.05;
    const h = halfAt(y);
    // Red body
    const kind: Kind = 0;

    // Fat corner legs
    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        push(sx * h, y, sz * h, cell * 1.35, sy, cell * 1.35, kind);
      }
    }

    // Edge beams on all 4 faces (forms the solid-looking red pyramid from outside)
    const edge = cell * 0.85;
    push(0, y, -h, h * 2, edge, edge, kind);
    push(0, y, h, h * 2, edge, edge, kind);
    push(-h, y, 0, edge, edge, h * 2, kind);
    push(h, y, 0, edge, edge, h * 2, kind);

    // Mid-face uprights every other band → lattice read
    if (i % 2 === 0) {
      push(0, y, -h, cell * 0.7, sy, edge, kind);
      push(0, y, h, cell * 0.7, sy, edge, kind);
      push(-h, y, 0, edge, sy, cell * 0.7, kind);
      push(h, y, 0, edge, sy, cell * 0.7, kind);
    }
  }

  // ---- Main observation deck (slight overhang only — not a fat capsule) ----
  const mainR = atMain * 1.45;
  const deckH = cell * 2.1;
  push(0, mainY, 0, mainR * 2, cell * 0.5, mainR * 2, 4);
  push(0, mainY + deckH * 0.45, 0, mainR * 1.85, deckH * 0.65, mainR * 1.85, 1);
  push(0, mainY + deckH * 0.85, 0, mainR * 1.95, cell * 0.4, mainR * 1.95, 4);
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      push(sx * mainR * 0.75, mainY + deckH * 0.4, sz * mainR * 0.75, cell * 0.85, deckH * 0.9, cell * 0.85, 0);
    }
  }

  // ---- Upper red shaft (narrower, still lattice) ----
  const upperBands = 8;
  for (let i = 0; i < upperBands; i++) {
    const t0 = i / upperBands;
    const t1 = (i + 1) / upperBands;
    const y0 = mainY + deckH + t0 * (specY - mainY - deckH);
    const y1 = mainY + deckH + t1 * (specY - mainY - deckH);
    const y = (y0 + y1) * 0.5;
    const sy = (y1 - y0) * 1.05;
    const h = halfAt(y);
    const kind: Kind = i % 3 === 1 ? 4 : 0;

    for (const sx of [-1, 1] as const) {
      for (const sz of [-1, 1] as const) {
        push(sx * h, y, sz * h, cell * 1.1, sy, cell * 1.1, kind);
      }
    }
    push(0, y, -h, h * 2, cell * 0.55, cell * 0.55, kind);
    push(0, y, h, h * 2, cell * 0.55, cell * 0.55, kind);
    push(-h, y, 0, cell * 0.55, cell * 0.55, h * 2, kind);
    push(h, y, 0, cell * 0.55, cell * 0.55, h * 2, kind);
  }

  // ---- Special deck (small ring, barely wider than shaft) ----
  const specR = atSpec * 1.55;
  const specH = cell * 1.6;
  push(0, specY, 0, specR * 2, cell * 0.4, specR * 2, 4);
  push(0, specY + specH * 0.45, 0, specR * 1.7, specH * 0.55, specR * 1.7, 1);
  push(0, specY + specH * 0.8, 0, specR * 1.85, cell * 0.35, specR * 1.85, 4);

  // ---- Antenna needle (long, striped) ----
  const antBase = specY + specH;
  const antSegs = 12;
  for (let i = 0; i < antSegs; i++) {
    const t0 = i / antSegs;
    const t1 = (i + 1) / antSegs;
    const y = antBase + ((t0 + t1) * 0.5) * (H - antBase);
    const sy = ((H - antBase) / antSegs) * 1.06;
    const w = lerp(atSpec * 1.15, atSpec * 0.22, (t0 + t1) * 0.5);
    const kind: Kind = i % 2 === 0 ? 0 : 4;
    push(0, y, 0, w * 2, sy, w * 2, kind);
  }
  push(0, H - cell * 0.2, 0, atSpec * 0.7, cell * 0.4, atSpec * 0.7, 0);

  // ---- Yellow entrance hall between the legs (SoftLinks detail) ----
  push(0, cell * 1.8, 0, baseHalf * 0.32, cell * 3.2, baseHalf * 0.32, 3);
  push(0, cell * 1.8, 0, baseHalf * 0.34, cell * 0.45, baseHalf * 0.34, 1);

  return out;
}

/**
 * Shrine: torii on the camera-near side (+Z), path back to honden (−Z).
 * Honden gets wide eaves, engawa, chigi/katsuogi — not a flat box.
 */
function craftShrine(plotW: number, heightFactor: number, rng: () => number): Voxel[] {
  const out: Voxel[] = [];
  const H = plotW * heightFactor;
  const cell = plotW * 0.028;

  const push = (
    x: number,
    y: number,
    z: number,
    sx: number,
    sy: number,
    sz: number,
    kind: Kind,
  ) => {
    const s = lerp(0.98, 1.02, rng());
    out.push({ x, y, z, sx: sx * s, sy: sy * s, sz: sz * s, kind });
  };

  // Camera sits in +X/+Z — put torii on +Z so it reads in front.
  const toriiZ = plotW * 0.34;
  const hallZ = -plotW * 0.1;
  const hallW = plotW * 0.42;
  const hallD = plotW * 0.3;
  const hallHalfW = hallW * 0.5;
  const hallHalfD = hallD * 0.5;
  const platformH = cell * 1.6;
  const wallH = H * 0.32;
  const roofH = H * 0.48;

  // ---- Torii (voxel reference: red body, black kasagi/bases, gold plaque) ----
  // kind 4=red, 2=black, 6=gold, 1=plaque face
  const toriiHalf = plotW * 0.19;
  const post = cell * 1.7;
  const baseTop = cell * 1.2;
  const pillarTop = H * 0.7; // absolute Y of pillar tops
  const pillarH = pillarTop - baseTop;
  const pillarCy = (baseTop + pillarTop) * 0.5;

  // Tiered black bases
  for (const side of [-1, 1] as const) {
    const px = side * toriiHalf;
    push(px, cell * 0.35, toriiZ, post * 1.7, cell * 0.7, post * 1.7, 2);
    push(px, cell * 0.85, toriiZ, post * 1.35, cell * 0.55, post * 1.35, 2);
  }
  // Red pillars — top ends exactly at pillarTop
  push(-toriiHalf, pillarCy, toriiZ, post, pillarH, post, 4);
  push(toriiHalf, pillarCy, toriiZ, post, pillarH, post, 4);

  // 笠木: sits ON pillars and spans through both posts (ends stick out past them).
  // Thick red body + black cap. 島木 + 金縁 drop by red thickening only.
  const kasagiRedH0 = cell * 0.8;
  const kasagiRedH = cell * 1.7;
  const kasagiRedExtra = kasagiRedH - kasagiRedH0;
  const kasagiBlackH = cell * 0.85;
  // Seat on pillar tops: red starts at pillarTop, grows upward(+black) and slightly down
  const redBot = pillarTop - cell * 0.2;
  const redTop = redBot + kasagiRedH;
  const blackBot = redTop - cell * 0.1;
  const blackTop = blackBot + kasagiBlackH;
  const kasagiRedY = (redTop + redBot) * 0.5;
  const kasagiBlackY = (blackTop + blackBot) * 0.5;
  // Continuous bar through both pillars (+ overhang past each post)
  const kasagiSpan = toriiHalf * 2 + post * 2.4;

  // 島木 (second beam) pierces pillars; lowered by kasagiRedExtra
  const gap = cell * 3.4;
  const shimakiY = redBot - gap - kasagiRedExtra;
  push(-toriiHalf - post * 0.55, shimakiY, toriiZ, cell * 0.7, cell * 0.55, cell * 0.7, 2);
  push(toriiHalf + post * 0.55, shimakiY, toriiZ, cell * 0.7, cell * 0.55, cell * 0.7, 2);
  push(0, shimakiY, toriiZ, toriiHalf * 2 + post * 1.35, cell * 0.8, cell * 0.85, 4);
  for (const side of [-1, 1] as const) {
    push(side * (toriiHalf + post * 0.65), shimakiY - cell * 0.2, toriiZ, cell * 1.1, cell * 0.55, cell * 0.85, 4);
  }

  const gakuBot = shimakiY + cell * 0.35;
  const gakuTop = redBot - cell * 0.1;
  const gakuH = Math.max(cell * 1.8, gakuTop - gakuBot);
  const gakuY = gakuBot + gakuH * 0.5;
  push(0, gakuY, toriiZ + cell * 0.15, cell * 2.1, gakuH, cell * 0.6, 6);
  push(0, gakuY, toriiZ + cell * 0.42, cell * 1.55, gakuH * 0.78, cell * 0.4, 1);

  // Kasagi red — one bar through both pillars
  push(0, kasagiRedY, toriiZ, kasagiSpan, kasagiRedH, cell * 1.05, 4);
  for (const side of [-1, 1] as const) {
    const tipX = side * (kasagiSpan * 0.5 + cell * 0.15);
    push(tipX, kasagiRedY + cell * 0.15, toriiZ, cell * 1.5, kasagiRedH * 0.85, cell * 1.05, 4);
    push(tipX + side * cell * 0.55, kasagiRedY + cell * 0.4, toriiZ, cell * 1.1, kasagiRedH * 0.7, cell * 0.95, 4);
  }
  // Kasagi black cap — same span, on top of red
  push(0, kasagiBlackY, toriiZ, kasagiSpan + post * 0.25, kasagiBlackH, cell * 1.2, 2);
  for (const side of [-1, 1] as const) {
    const tipX = side * (kasagiSpan * 0.5 + cell * 0.35);
    push(tipX, kasagiBlackY + cell * 0.12, toriiZ, cell * 1.6, kasagiBlackH * 0.85, cell * 1.15, 2);
    push(tipX + side * cell * 0.7, kasagiBlackY + cell * 0.38, toriiZ, cell * 1.15, kasagiBlackH * 0.7, cell * 1.0, 2);
  }

  // ---- Sandō (path from torii toward hall) ----
  const pathW = plotW * 0.11;
  const pathSteps = 6;
  for (let i = 0; i < pathSteps; i++) {
    const t = (i + 0.5) / pathSteps;
    const z = lerp(toriiZ - plotW * 0.04, hallZ + hallHalfD + cell * 2.5, t);
    push(0, cell * 0.12, z, pathW, cell * 0.28, plotW * 0.048, 3);
  }

  // Lanterns beside path (visible near torii)
  for (const x of [-plotW * 0.2, plotW * 0.2]) {
    const z = toriiZ - plotW * 0.1;
    push(x, cell * 0.9, z, cell * 0.75, cell * 1.6, cell * 0.75, 6);
    push(x, cell * 2.0, z, cell * 1.35, cell * 0.4, cell * 1.35, 6);
    push(x, cell * 2.55, z, cell * 0.6, cell * 0.85, cell * 0.6, 1);
    push(x, cell * 3.15, z, cell * 1.0, cell * 0.35, cell * 1.0, 6);
  }

  // ---- Steps + engawa platform ----
  for (let s = 0; s < 4; s++) {
    push(
      0,
      cell * 0.35 + s * (platformH * 0.22),
      hallZ + hallHalfD + cell * (2.4 - s * 0.5),
      hallW * (0.32 + s * 0.1),
      cell * 0.32,
      cell * 0.65,
      3,
    );
  }
  // Main platform
  push(0, platformH * 0.5, hallZ, hallW * 1.2, platformH, hallD * 1.25, 3);
  // Engawa (veranda strip on front)
  push(0, platformH + cell * 0.2, hallZ + hallHalfD + cell * 0.55, hallW * 1.05, cell * 0.35, cell * 1.1, 3);
  // Rail posts on engawa
  for (const x of [-hallHalfW * 0.85, hallHalfW * 0.85]) {
    push(x, platformH + cell * 1.1, hallZ + hallHalfD + cell * 0.9, cell * 0.35, cell * 1.6, cell * 0.35, 4);
  }
  push(0, platformH + cell * 1.85, hallZ + hallHalfD + cell * 0.9, hallW * 0.9, cell * 0.28, cell * 0.28, 4);

  // ---- Honden body: white panels between vermillion frame ----
  const frame = cell * 0.85;
  const skin = cell * 0.4;
  // Frame posts
  for (const [cx, cz] of [
    [-hallHalfW, hallZ - hallHalfD],
    [hallHalfW, hallZ - hallHalfD],
    [-hallHalfW, hallZ + hallHalfD],
    [hallHalfW, hallZ + hallHalfD],
  ] as const) {
    push(cx, platformH + wallH * 0.5, cz, frame, wallH * 1.05, frame, 4);
  }
  // Top plate
  push(0, platformH + wallH, hallZ - hallHalfD, hallW + frame, cell * 0.45, cell * 0.5, 4);
  push(0, platformH + wallH, hallZ + hallHalfD, hallW + frame, cell * 0.45, cell * 0.5, 4);
  push(-hallHalfW, platformH + wallH, hallZ, cell * 0.5, cell * 0.45, hallD + frame, 4);
  push(hallHalfW, platformH + wallH, hallZ, cell * 0.5, cell * 0.45, hallD + frame, 4);

  // Wall panels
  const courses = 6;
  for (let c = 0; c < courses; c++) {
    const y = platformH + (c + 0.5) * (wallH / courses);
    const sy = (wallH / courses) * 1.05;
    // Front: door in centre, panels beside
    for (const x of [-hallW * 0.28, hallW * 0.28]) {
      push(x, y, hallZ + hallHalfD, hallW * 0.28, sy, skin, 0);
    }
    if (c < courses * 0.75) {
      push(0, y, hallZ + hallHalfD + skin * 0.2, hallW * 0.22, sy * 0.95, skin * 0.55, 5);
      // Lattice strips on door
      if (c % 2 === 0) {
        push(0, y, hallZ + hallHalfD + skin * 0.45, hallW * 0.18, cell * 0.2, skin * 0.25, 4);
      }
    } else {
      push(0, y, hallZ + hallHalfD, hallW * 0.24, sy, skin, 0);
    }
    // Back + sides
    push(0, y, hallZ - hallHalfD, hallW * 0.95, sy, skin, 0);
    push(-hallHalfW, y, hallZ, skin, sy, hallD * 0.9, 0);
    push(hallHalfW, y, hallZ, skin, sy, hallD * 0.9, 0);
  }

  // ---- Irimoya-style roof: wide lower eaves + upper hip ----
  const roofBase = platformH + wallH + cell * 0.2;
  // Lower eave (big overhang — the shrine read)
  const eaveW = hallW * 1.55;
  const eaveD = hallD * 1.6;
  push(0, roofBase, hallZ, eaveW, cell * 0.45, eaveD, 2);
  push(0, roofBase + cell * 0.55, hallZ, eaveW * 0.92, cell * 0.4, eaveD * 0.92, 2);
  // Tip-up at eave corners (slight lift)
  for (const sx of [-1, 1] as const) {
    for (const sz of [-1, 1] as const) {
      push(
        sx * eaveW * 0.42,
        roofBase + cell * 0.35,
        hallZ + sz * eaveD * 0.42,
        cell * 1.6,
        cell * 0.55,
        cell * 1.6,
        2,
      );
    }
  }
  // Upper roof mass stepping in
  const upperLayers = 5;
  for (let L = 0; L < upperLayers; L++) {
    const t = (L + 1) / upperLayers;
    const y = roofBase + cell * 0.9 + t * roofH * 0.72;
    const rw = hallW * lerp(1.15, 0.45, t);
    const rd = hallD * lerp(1.2, 0.5, t);
    push(0, y, hallZ, rw, cell * 0.42, rd, 2);
  }
  // Ridge + katsuogi (short logs) + chigi (X)
  const ridgeY = roofBase + cell * 0.9 + roofH * 0.72;
  push(0, ridgeY, hallZ, hallW * 0.5, cell * 0.4, cell * 0.5, 2);
  for (let k = -2; k <= 2; k++) {
    push(k * hallW * 0.08, ridgeY + cell * 0.55, hallZ, cell * 0.55, cell * 0.45, cell * 0.9, 4);
  }
  // Chigi leaning out
  push(-hallW * 0.14, ridgeY + cell * 1.5, hallZ, cell * 0.4, cell * 2.4, cell * 0.4, 4);
  push(hallW * 0.14, ridgeY + cell * 1.5, hallZ, cell * 0.4, cell * 2.4, cell * 0.4, 4);
  push(-hallW * 0.2, ridgeY + cell * 2.5, hallZ, cell * 0.35, cell * 0.9, cell * 0.35, 4);
  push(hallW * 0.2, ridgeY + cell * 2.5, hallZ, cell * 0.35, cell * 0.9, cell * 0.35, 4);

  return out;
}

function fitVoxelCount(voxels: Voxel[], need: number, rng: () => number): Voxel[] {
  if (voxels.length === 0) {
    return Array.from({ length: need }, () => ({
      x: 0,
      y: VOX,
      z: 0,
      sx: VOX,
      sy: VOX,
      sz: VOX,
      kind: 0 as Kind,
    }));
  }

  if (voxels.length === need) return voxels;

  if (voxels.length > need) {
    // Never drop door / window / chimney first.
    const scored = voxels
      .map((v) => ({
        v,
        score:
          (v.kind === 1 || v.kind === 5 || v.kind === 6
            ? 20
            : v.kind === 2
              ? 4
              : v.kind === 4
                ? 3
                : 1) +
          rng() * 0.2,
      }))
      .sort((a, b) => b.score - a.score);
    return scored.slice(0, need).map((s) => s.v);
  }

  // Pad: keep features, fill budget with near-copies of walls/roof only.
  const features = voxels.filter((v) => v.kind === 1 || v.kind === 5 || v.kind === 6 || v.kind === 4);
  const filler = voxels.filter((v) => v.kind === 0 || v.kind === 2 || v.kind === 3);
  const pool = filler.length > 0 ? filler : voxels;
  const out = voxels.slice();
  let i = 0;
  while (out.length < need) {
    // Periodically re-stamp features so they stay dense / readable
    if (features.length && i % 7 === 0) {
      const f = features[i % features.length]!;
      out.push({ ...f });
    } else {
      const src = pool[i % pool.length]!;
      out.push({
        ...src,
        x: src.x + (rng() - 0.5) * Math.min(0.06, src.sx * 0.03),
        y: src.y + (rng() - 0.5) * Math.min(0.04, src.sy * 0.02),
        z: src.z + (rng() - 0.5) * Math.min(0.06, src.sz * 0.03),
      });
    }
    i++;
  }
  return out;
}
