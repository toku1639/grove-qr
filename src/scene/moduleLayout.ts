import { moduleToWorld, QUIET_ZONE, type QrMatrix } from './qr';
import { CELL, LEAVES_PER_MODULE, MODULE_HEIGHT } from './constants';
import type { Species } from './species';

export function leavesPerModule(_species?: Species) {
  return LEAVES_PER_MODULE;
}

export interface LeafTarget {
  x: number;
  y: number;
  z: number;
  sx: number;
  sy: number;
  sz: number;
}

/**
 * Dark modules that foliage may sit on. Finder corners are excluded — those
 * read as grass (切り出しシンボル), not leaves.
 */
export function foliageCells(qr: QrMatrix) {
  return qr.darkCells.filter((c) => !qr.reserved[c.y * qr.size + c.x]);
}

/**
 * Flat QR packing for tests / reference — foliage modules only.
 */
export function leafTarget(qr: QrMatrix, index: number, species?: Species): LeafTarget {
  const per = leavesPerModule(species);
  const cells = foliageCells(qr);
  const cell = cells[Math.floor(index / per)]!;
  const slot = index % per;
  const cols = Math.ceil(Math.sqrt(per));
  const rows = Math.ceil(per / cols);
  const col = slot % cols;
  const row = Math.floor(slot / cols);
  const gx = (col + 0.5) / cols - 0.5;
  const gz = (row + 0.5) / rows - 0.5;

  const { x, z } = moduleToWorld(cell.x + QUIET_ZONE, cell.y + QUIET_ZONE, qr.plot, CELL);

  return {
    x: x + gx * CELL * 0.62,
    y: MODULE_HEIGHT / 2,
    z: z + gz * CELL * 0.62,
    sx: 0.38,
    sy: MODULE_HEIGHT,
    sz: 0.56,
  };
}

/**
 * Rest pose: XZ on a foliage dark module, Y within a soft broadleaf crown.
 */
export function leafColumnPose(
  qr: QrMatrix,
  index: number,
  treeHeight: number,
  rng: () => number,
  organicY?: number,
  organicSize?: number,
  species?: Species,
): LeafTarget {
  const per = leavesPerModule(species);
  const cells = foliageCells(qr);
  const cell = cells[Math.floor(index / per)]!;
  const { x: cx, z: cz } = moduleToWorld(cell.x + QUIET_ZONE, cell.y + QUIET_ZONE, qr.plot, CELL);

  const half = (qr.plot * CELL) / 2;
  const radial = Math.min(1, Math.hypot(cx, cz) / Math.max(half, 1e-3));

  const crownTop = treeHeight * (0.62 + (1 - radial) * 0.4);
  const crownBase = treeHeight * (0.16 + radial * 0.1);

  const slot = index % per;
  const u = Math.pow((slot + rng() * 0.85) / per, 0.62);
  let y = crownBase + u * Math.max(crownTop - crownBase, 0.05);

  if (organicY != null && Number.isFinite(organicY)) {
    y = y * 0.72 + Math.min(Math.max(organicY, crownBase), crownTop) * 0.28;
  }
  y += (rng() - 0.5) * 0.2;
  y = Math.min(Math.max(y, crownBase), crownTop);

  const j = CELL * 0.28;
  const x = cx + (rng() - 0.5) * j;
  const z = cz + (rng() - 0.5) * j;

  const size = (organicSize ?? 0.65) * (0.95 + rng() * 0.4);
  const stretch = 0.75 + rng() * 0.45;
  const sx = size * stretch;
  const sy = size * (0.26 + rng() * 0.2);
  const sz = size * (1.3 - stretch * 0.35);

  return { x, y, z, sx, sy, sz };
}

/** Leaves for every non-finder dark module. */
export const leafCountFor = (qr: QrMatrix, species?: Species) =>
  foliageCells(qr).length * leavesPerModule(species);
