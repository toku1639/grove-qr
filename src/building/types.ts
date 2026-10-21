import type { BuildingPaletteId } from './palette';

export type BuildingTypeId = 'house' | 'tower' | 'shrine';

export interface BuildingType {
  id: BuildingTypeId;
  label: string;
  /** Overall height as a multiple of plot width (oak ≈ 0.86). */
  heightFactor: number;
  /** Fixed colours for this shape (no swatch picker). */
  paletteId: BuildingPaletteId;
}

export const BUILDING_TYPES: Record<BuildingTypeId, BuildingType> = {
  house: {
    id: 'house',
    label: 'House',
    heightFactor: 0.84,
    paletteId: 'clapboard',
  },
  tower: {
    id: 'tower',
    label: 'Tokyo',
    heightFactor: 1.2,
    paletteId: 'tokyo',
  },
  shrine: {
    id: 'shrine',
    label: 'Shrine',
    heightFactor: 0.78,
    paletteId: 'shrine',
  },
};

export const BUILDING_TYPE_ORDER: BuildingTypeId[] = ['house', 'tower', 'shrine'];
