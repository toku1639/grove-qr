/** Fixed colours per building shape — no user-facing swatches. */
export interface BuildingPalette {
  id: string;
  label: string;
  wall: string[];
  window: string[];
  roof: string[];
  trim: string[];
  door: string[];
  chimney: string[];
  /** Dark QR module tones (must stay scannable). */
  qr: string[];
  hedge: string[];
  moduleDark: string;
  moduleLight: string;
  slab: string;
  ground: string;
}

export type BuildingPaletteId = 'clapboard' | 'tokyo' | 'shrine';

const HOUSE: BuildingPalette = {
  id: 'clapboard',
  label: 'House',
  wall: ['#f4f1ea', '#ebe6dc', '#faf7f1', '#ddd6ca'],
  window: ['#5b7c9a', '#4a6884', '#6d8fad'],
  roof: ['#4a5560', '#3b444d', '#586470'],
  trim: ['#ffffff', '#f7f7f5'],
  door: ['#2f5d4a', '#274e3e', '#3a7260'],
  chimney: ['#9a6a55', '#865844', '#b07d66'],
  qr: ['#3a342c', '#2e2923', '#454038'],
  hedge: ['#8fbf6a', '#7bad57', '#a2cd7e'],
  moduleDark: '#d6d1c4',
  moduleLight: '#fdfbf6',
  slab: '#cfc9bb',
  ground: '#f3eee6',
};

const TOKYO: BuildingPalette = {
  id: 'tokyo',
  label: 'Tokyo',
  wall: ['#e02020', '#d01818', '#ef3030', '#c01010'],
  window: ['#4a90c8', '#3a7ab0', '#5aa0d8'],
  roof: ['#e02020', '#d01818'],
  trim: ['#f5f5f5', '#ffffff', '#e8e8e8'],
  door: ['#c01010', '#a00808'],
  chimney: ['#e02020', '#ffffff'],
  qr: ['#3a1818', '#2e1010', '#4a2020'],
  hedge: ['#7ec25a', '#6bb047', '#93d06f'],
  moduleDark: '#d6d1c4',
  moduleLight: '#fdfbf6',
  slab: '#cfc9bb',
  ground: '#e8f0f8',
};

const SHRINE: BuildingPalette = {
  id: 'shrine',
  label: 'Shrine',
  wall: ['#f4efe6', '#ebe4d8', '#faf6ef', '#ddd4c4'],
  window: ['#2a241c', '#1e1a14', '#3a3228'],
  roof: ['#2c2824', '#1a1816', '#3a3530', '#24201c'],
  trim: ['#d42020', '#c41212', '#e03030', '#b01010'],
  door: ['#c41818', '#b01010', '#d42828'],
  chimney: ['#f0d060', '#e8c040', '#f5dc78'],
  qr: ['#2a241c', '#1e1a14', '#3a3228'],
  hedge: ['#6a9e4a', '#5a8a3c', '#7ab058'],
  moduleDark: '#d6d1c4',
  moduleLight: '#fdfbf6',
  slab: '#c8c0b0',
  ground: '#e8e4d8',
};

export const BUILDING_PALETTES: Record<BuildingPaletteId, BuildingPalette> = {
  clapboard: HOUSE,
  tokyo: TOKYO,
  shrine: SHRINE,
};

export function paletteForBuilding(id: BuildingPaletteId): BuildingPalette {
  return BUILDING_PALETTES[id];
}
