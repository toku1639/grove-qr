import * as THREE from 'three';
import { moduleToWorld, QUIET_ZONE, type QrMatrix } from './qr';
import { CELL } from './constants';
import { makeRng, clamp01, lerp } from './rng';
import { BUTTERFLY_COLORS } from './fauna';

/** Shared ground styling — tree and building sections both supply this. */
export type PlotStyle = {
  id?: string;
  hedge: string[];
  /** Leaf tones for dark modules (multi-colour QR when overhead). */
  leaf: string[];
  moduleLight: string;
  slab: string;
};

/** How many dark modules carry butterfly wing colours in the QR. */
const BUTTERFLY_MODULE_COUNT = 5;

export interface PlotMeshes {
  group: THREE.Group;
  tiles: THREE.InstancedMesh;
  finderGrass: THREE.InstancedMesh;
  litter: THREE.InstancedMesh;
  slab: THREE.Mesh;
  applyPalette: (p: PlotStyle) => void;
  /**
   * 0 = tree view (QR dots invisible),
   * 1 = overhead scan (dots at full leaf-matched colours).
   */
  setMorph: (t: number) => void;
}

/**
 * The ground plot *is* the code: every module is a tile. Finder corners sit on
 * the outer edge (no quiet-zone hedge). Overhead, dark tiles take leaf colours.
 */
export function buildPlot(qr: QrMatrix, palette: PlotStyle): PlotMeshes {
  const group = new THREE.Group();
  const plotUnits = qr.plot * CELL;

  const slabGeo = new THREE.BoxGeometry(plotUnits + 0.4, 0.9, plotUnits + 0.4);
  const slabMat = new THREE.MeshLambertMaterial({ color: palette.slab });
  const slab = new THREE.Mesh(slabGeo, slabMat);
  slab.position.y = -0.45;
  slab.receiveShadow = true;
  group.add(slab);

  const tileGeo = new THREE.BoxGeometry(CELL, 0.3, CELL);
  const tileMat = new THREE.MeshLambertMaterial();
  const total = qr.plot * qr.plot;
  const tiles = new THREE.InstancedMesh(tileGeo, tileMat, total);
  tiles.receiveShadow = true;
  tiles.instanceMatrix.setUsage(THREE.StaticDrawUsage);

  const m = new THREE.Matrix4();
  const darkFlags: boolean[] = new Array(total);
  /**
   * -1 = light; -2 = finder grass; -3 = butterfly; -4 = finder bloom;
   * else seed into leaf pool.
   */
  const toneIndex = new Int16Array(total);
  const toneRng = makeRng(0xa11ce);
  const foliageDark: number[] = [];
  const finderDark: number[] = [];
  let i = 0;

  for (let py = 0; py < qr.plot; py++) {
    for (let px = 0; px < qr.plot; px++) {
      const qx = px - QUIET_ZONE;
      const qy = py - QUIET_ZONE;
      const inside = qx >= 0 && qy >= 0 && qx < qr.size && qy < qr.size;
      const dark = inside ? qr.dark[qy * qr.size + qx] : false;
      darkFlags[i] = dark;

      if (dark && inside) {
        const finder = qr.reserved[qy * qr.size + qx];
        if (finder) {
          toneIndex[i] = -2;
          finderDark.push(i);
        } else {
          toneIndex[i] = Math.floor(toneRng() * 256);
          foliageDark.push(i);
        }
      } else {
        toneIndex[i] = -1;
      }

      const { x, z } = moduleToWorld(px, py, qr.plot, CELL);
      m.makeTranslation(x, dark ? -0.06 : -0.14, z);
      tiles.setMatrixAt(i, m);
      i++;
    }
  }

  // Sprinkle a few butterfly-coloured modules so overhead QR echoes the fauna.
  const pickRng = makeRng(0xb17e ^ 0x71);
  const picks = [...foliageDark];
  for (let a = picks.length - 1; a > 0; a--) {
    const b = Math.floor(pickRng() * (a + 1));
    const tmp = picks[a]!;
    picks[a] = picks[b]!;
    picks[b] = tmp;
  }
  const butterflyN = Math.min(BUTTERFLY_MODULE_COUNT, picks.length);
  for (let b = 0; b < butterflyN; b++) {
    toneIndex[picks[b]!] = -3;
  }

  // Partial finder blooms in the QR — mostly grass, a few flower accents.
  const bloomRng = makeRng(0xf10e ^ 0x99);
  const bloomTargets = Math.max(4, Math.round(finderDark.length * 0.22));
  const finderPicks = [...finderDark];
  for (let a = finderPicks.length - 1; a > 0; a--) {
    const b = Math.floor(bloomRng() * (a + 1));
    const tmp = finderPicks[a]!;
    finderPicks[a] = finderPicks[b]!;
    finderPicks[b] = tmp;
  }
  for (let b = 0; b < Math.min(bloomTargets, finderPicks.length); b++) {
    toneIndex[finderPicks[b]!] = -4;
  }

  tiles.instanceMatrix.needsUpdate = true;
  group.add(tiles);

  const finderGrass = buildFinderGrass(qr, palette);
  group.add(finderGrass);

  const litter = buildLitter(qr, palette);
  group.add(litter);

  const lightCol = new THREE.Color();
  const leafPool: THREE.Color[] = [];
  const hedgePool: THREE.Color[] = [];
  const butterflyPool = BUTTERFLY_COLORS.map((c) => new THREE.Color(c));
  const bloomPool: THREE.Color[] = [];
  const tileCol = new THREE.Color();
  const darkCol = new THREE.Color();
  let lastScan = -1;
  let butterflyAccents = true;
  let springBlooms = false;

  const paintTiles = (scan: number) => {
    const u = clamp01(scan);
    const reveal = clamp01((u - 0.72) / 0.28);
    for (let k = 0; k < total; k++) {
      if (darkFlags[k]) {
        const idx = toneIndex[k]!;
        let pool: THREE.Color[];
        let slot: number;
        if (idx === -2) {
          pool = hedgePool.length > 0 ? hedgePool : leafPool;
          slot = (k * 17) % Math.max(pool.length, 1);
        } else if (idx === -4) {
          // Spring: flower accents. Else fall back to grass so finders stay coherent.
          pool =
            springBlooms && bloomPool.length > 0
              ? bloomPool
              : hedgePool.length > 0
                ? hedgePool
                : leafPool;
          slot = k % Math.max(pool.length, 1);
        } else if (idx === -3 && butterflyAccents) {
          pool = butterflyPool;
          slot = k % butterflyPool.length;
        } else {
          pool = leafPool.length > 0 ? leafPool : hedgePool;
          slot = (idx < 0 ? k : idx) % Math.max(pool.length, 1);
        }
        darkCol.copy(pool[slot] ?? lightCol);
        tileCol.copy(lightCol).lerp(darkCol, reveal);
      } else {
        tileCol.copy(lightCol);
      }
      tiles.setColorAt(k, tileCol);
    }
    if (tiles.instanceColor) tiles.instanceColor.needsUpdate = true;
  };

  const applyPalette = (p: PlotStyle) => {
    slabMat.color.set(p.slab);
    lightCol.set(p.moduleLight);
    leafPool.length = 0;
    for (const hex of p.leaf) leafPool.push(new THREE.Color(hex));
    hedgePool.length = 0;
    for (const hex of p.hedge) hedgePool.push(new THREE.Color(hex));
    bloomPool.length = 0;
    // Muted enough to sit with grass greens in the QR, still read as blooms.
    for (const hex of [...NANOHANA, ...SPRING_PINK, ...p.leaf.slice(0, 2)]) {
      bloomPool.push(new THREE.Color(hex));
    }
    butterflyAccents = p.id === 'summer';
    springBlooms = p.id === 'spring';
    paintGrass(finderGrass, p);
    paintLitter(litter, p);
    paintTiles(Math.max(0, lastScan));
  };

  applyPalette(palette);

  const setMorph = (t: number) => {
    const u = clamp01(t);
    const scan = Math.pow(u, 1.35);
    if (Math.abs(scan - lastScan) > 0.012) {
      lastScan = scan;
      paintTiles(scan);
    }

    const grassShow = lerp(1, 0.08, scan);
    finderGrass.scale.set(1, Math.max(0.04, grassShow), 1);
    finderGrass.visible = grassShow > 0.04;
    (finderGrass.material as THREE.MeshLambertMaterial).opacity = grassShow;
    (finderGrass.material as THREE.MeshLambertMaterial).transparent = grassShow < 0.999;

    // Hide scattered petals when scanning — they read as noise on the code.
    litter.visible = scan < 0.55;
    (litter.material as THREE.MeshLambertMaterial).opacity = lerp(0.95, 0, scan);
    (litter.material as THREE.MeshLambertMaterial).transparent = true;
  };

  setMorph(0);

  return { group, tiles, finderGrass, litter, slab, applyPalette, setMorph };
}

const BLADES_PER_FINDER_CELL = 4;
/** Max bloom slots per dark finder cell (spring paints a partial subset). */
const FLOWERS_PER_FINDER_CELL = 8;
const LITTER_COUNT = 140;

/** Nanohana yellows + soft pinks for spring finder blooms. */
const NANOHANA = ['#f5d63a', '#ffe566', '#f0c92a', '#fff0a0'];
const SPRING_PINK = ['#f4b8cf', '#efa4c2', '#ffd0e0', '#f8cfe0', '#e88fb2'];

function buildFinderGrass(qr: QrMatrix, palette: PlotStyle) {
  const origins: Array<[number, number]> = [
    [0, 0],
    [qr.size - 7, 0],
    [0, qr.size - 7],
  ];

  const darkFinder: Array<{ px: number; py: number }> = [];
  for (const [ox, oy] of origins) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const qx = ox + dx;
        const qy = oy + dy;
        if (qr.dark[qy * qr.size + qx]) {
          darkFinder.push({ px: qx + QUIET_ZONE, py: qy + QUIET_ZONE });
        }
      }
    }
  }

  const bladeCount = darkFinder.length * BLADES_PER_FINDER_CELL;
  const flowerCount = darkFinder.length * FLOWERS_PER_FINDER_CELL;
  const count = bladeCount + flowerCount;
  const rng = makeRng(0xf1ad712);
  const geo = new THREE.BoxGeometry(0.14, 1, 0.14);
  geo.translate(0, 0.5, 0);
  const mat = new THREE.MeshLambertMaterial({ transparent: true });
  const mesh = new THREE.InstancedMesh(geo, mat, Math.max(count, 1));
  mesh.castShadow = false;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  Object.assign(mesh.userData, {
    bladeCount,
    flowerCells: darkFinder,
    plot: qr.plot,
  });

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();

  let k = 0;
  for (const cell of darkFinder) {
    const { x, z } = moduleToWorld(cell.px, cell.py, qr.plot, CELL);
    for (let b = 0; b < BLADES_PER_FINDER_CELL; b++) {
      const jx = (rng() - 0.5) * CELL * 0.85;
      const jz = (rng() - 0.5) * CELL * 0.85;
      pos.set(x + jx, -0.28, z + jz);
      e.set((rng() - 0.5) * 0.35, rng() * Math.PI, (rng() - 0.5) * 0.35);
      q.setFromEuler(e);
      scl.set(0.9 + rng() * 0.35, 1.2 + rng() * 0.85, 0.9 + rng() * 0.35);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(k++, m);
    }
  }
  // Flower slot matrices filled in paintGrass (season-aware).
  while (k < mesh.count) {
    m.makeScale(0, 0, 0);
    mesh.setMatrixAt(k++, m);
  }
  mesh.instanceMatrix.needsUpdate = true;
  paintGrass(mesh, palette);
  return mesh;
}

/** Soft petals / leaves resting on the plot — denser in spring & autumn. */
function buildLitter(qr: QrMatrix, palette: PlotStyle) {
  const half = (qr.plot * CELL) / 2;
  const geo = new THREE.BoxGeometry(1, 0.08, 1);
  const mat = new THREE.MeshLambertMaterial({
    transparent: true,
    depthWrite: false,
  });
  const mesh = new THREE.InstancedMesh(geo, mat, LITTER_COUNT);
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 2;
  (mesh.userData as { half: number }).half = half;
  paintLitter(mesh, palette);
  return mesh;
}

function paintGrass(mesh: THREE.InstancedMesh, palette: PlotStyle) {
  const rng = makeRng(0xc0ffee);
  const blades = palette.hedge.map((c) => new THREE.Color(c));
  const bladeCount = (mesh.userData as { bladeCount?: number }).bladeCount ?? mesh.count;
  const flowerCells =
    (mesh.userData as { flowerCells?: Array<{ px: number; py: number }> }).flowerCells ?? [];

  for (let k = 0; k < bladeCount; k++) {
    mesh.setColorAt(k, blades[Math.floor(rng() * blades.length)]!);
  }

  // Spring: partial blooms on finder turf — nanohana yellow + blossom pink.
  // Other seasons: hide flower slots (grass only).
  const bloom = palette.id === 'spring';
  const bloomPool = [
    ...NANOHANA.map((c) => new THREE.Color(c)),
    ...SPRING_PINK.map((c) => new THREE.Color(c)),
    ...palette.leaf.slice(0, 3).map((c) => new THREE.Color(c)),
  ];
  const poseRng = makeRng(0xf10e);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const pos = new THREE.Vector3();
  const scl = new THREE.Vector3();
  const plot = (mesh.userData as { plot?: number }).plot ?? 21;

  let fi = bladeCount;
  for (const cell of flowerCells) {
    const { x, z } = moduleToWorld(cell.px, cell.py, plot, CELL);
    // Most finder cells bloom in spring — grass is sparse, flowers carry the look.
    const cellBlooms = bloom && poseRng() < 0.78;
    for (let f = 0; f < FLOWERS_PER_FINDER_CELL; f++) {
      if (fi >= mesh.count) break;
      if (!cellBlooms || poseRng() > 0.28) {
        m.makeScale(0, 0, 0);
        mesh.setMatrixAt(fi, m);
        mesh.setColorAt(fi, bloomPool[0]!);
        fi++;
        continue;
      }
      const jx = (poseRng() - 0.5) * CELL * 0.7;
      const jz = (poseRng() - 0.5) * CELL * 0.7;
      // Same height band as the grass tips — large enough to read as blooms.
      pos.set(x + jx, 0.6 + poseRng() * 0.75, z + jz);
      e.set((poseRng() - 0.5) * 0.35, poseRng() * Math.PI, (poseRng() - 0.5) * 0.35);
      q.setFromEuler(e);
      const s = 1.35 + poseRng() * 0.7;
      scl.set(s, 0.45 + poseRng() * 0.4, s);
      m.compose(pos, q, scl);
      mesh.setMatrixAt(fi, m);
      mesh.setColorAt(fi, bloomPool[Math.floor(poseRng() * bloomPool.length)]!);
      fi++;
    }
  }
  while (fi < mesh.count) {
    m.makeScale(0, 0, 0);
    mesh.setMatrixAt(fi, m);
    fi++;
  }

  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}

function paintLitter(mesh: THREE.InstancedMesh, palette: PlotStyle) {
  const rng = makeRng(0xb100);
  // Mix leaf tones with a few brighter accents so petals read on pale tiles.
  const pool = [
    ...palette.leaf.map((c) => new THREE.Color(c)),
    new THREE.Color('#ffe8f0'),
    new THREE.Color('#fff3c4'),
    new THREE.Color('#ffd0e0'),
  ];
  // Petals in spring, fallen leaves in autumn — not summer.
  const keep =
    palette.id === 'spring' ? 1 : palette.id === 'autumn' ? 0.85 : 0;
  const half = (mesh.userData as { half?: number }).half ?? 10;
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const e = new THREE.Euler();
  const scl = new THREE.Vector3();
  const poseRng = makeRng(0x1ea7);
  // Sit above tile tops (dark tiles centre ~-0.06, height 0.3 → top ≈ 0.09).
  const groundY = 0.16;
  for (let i = 0; i < mesh.count; i++) {
    mesh.setColorAt(i, pool[Math.floor(rng() * pool.length)]!);
    const t = Math.pow(poseRng(), 0.5);
    const r = t * half * 0.88;
    const az = poseRng() * Math.PI * 2;
    pos.set(Math.cos(az) * r, groundY, Math.sin(az) * r);
    e.set((poseRng() - 0.5) * 0.25, poseRng() * Math.PI * 2, (poseRng() - 0.5) * 0.35);
    quat.setFromEuler(e);
    const s = 0.42 + poseRng() * 0.55;
    if (poseRng() > keep) scl.set(0, 0, 0);
    else scl.set(s * (0.75 + poseRng() * 0.55), 1, s * (0.5 + poseRng() * 0.55));
    m.compose(pos, quat, scl);
    mesh.setMatrixAt(i, m);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
}
