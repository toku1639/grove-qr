export type SeasonId = 'spring' | 'summer' | 'autumn' | 'winter';

export interface Palette {
  id: SeasonId;
  label: string;
  /** Canopy colours, sampled per leaf. */
  leaf: string[];
  /** Darker, high-contrast tones used once the leaves settle into QR modules. */
  qrLeaf: string[];
  bark: string;
  barkDark: string;
  hedge: string[];
  /** Colour of the raised (dark) QR modules on the ground slab. */
  moduleDark: string;
  moduleLight: string;
  slab: string;
  ground: string;
}

/**
 * Spring blossom swatches — sakura / ume / momo / fuji / mimosa 系。
 * Each carries a canopy tone and a deeper `qr` tone so settled modules still
 * binarise cleanly against the pale plot.
 */
export const BLOSSOM_SWATCHES = [
  {
    id: 'sakura',
    label: 'Sakura',
    leaf: ['#f4b8cf', '#efa4c2', '#f8cfe0', '#e88fb2'],
    qr: ['#5e2340', '#4e1c35', '#6b2b4a'],
  },
  {
    id: 'yoshino',
    label: 'Yoshino',
    leaf: ['#f7f0ea', '#efe6dc', '#fffaf6', '#e4d9ce'],
    qr: ['#4a4038', '#3c342e', '#564a41'],
  },
  {
    id: 'ume',
    label: 'Ume',
    leaf: ['#e56a9a', '#d44f85', '#f08bb3', '#c23d72'],
    qr: ['#5a1838', '#4a1230', '#6b2144'],
  },
  {
    id: 'momo',
    label: 'Momo',
    leaf: ['#f2a0b8', '#e888a6', '#f8bdd0', '#db7090'],
    qr: ['#5c2438', '#4c1c2e', '#6d2e44'],
  },
  {
    id: 'fuji',
    label: 'Fuji',
    leaf: ['#c3aae6', '#b295dd', '#d6c4f0', '#a17fd2'],
    qr: ['#392556', '#2f1e48', '#432d63'],
  },
  {
    id: 'mimosa',
    label: 'Mimosa',
    leaf: ['#f0d45c', '#e6c63a', '#f6e48a', '#d4b428'],
    qr: ['#5a4808', '#4a3a06', '#6b5610'],
  },
] as const;

export type BlossomId = (typeof BLOSSOM_SWATCHES)[number]['id'];

/**
 * Autumn foliage swatches. Same rule as spring: pretty canopy colours plus a
 * much deeper `qr` set so settled modules still binarise cleanly.
 */
export const AUTUMN_SWATCHES = [
  {
    id: 'maple',
    label: 'Maple',
    leaf: ['#e24b2f', '#c73a22', '#f06a45', '#a82e1a'],
    qr: ['#6b1a10', '#57150c', '#7a2114'],
  },
  {
    id: 'ginkgo',
    label: 'Ginkgo',
    leaf: ['#f2d14a', '#e8c02e', '#f7e07a', '#d4a91c'],
    qr: ['#6a5208', '#564306', '#7a6010'],
  },
  {
    id: 'amber',
    label: 'Amber',
    leaf: ['#f2a13c', '#e8842a', '#f7c05e', '#d96a1f'],
    qr: ['#8a400c', '#763409', '#9c4c12'],
  },
  {
    id: 'russet',
    label: 'Russet',
    leaf: ['#c46a2e', '#a85520', '#d98948', '#8f4418'],
    qr: ['#5a2a0e', '#4a220a', '#6b3514'],
  },
  {
    id: 'crimson',
    label: 'Crimson',
    leaf: ['#b8203a', '#9a1830', '#d43a55', '#7e1226'],
    qr: ['#4e0c18', '#3f0a13', '#5c121e'],
  },
  {
    id: 'copper',
    label: 'Copper',
    leaf: ['#c8884a', '#b06e35', '#dbad72', '#965828'],
    qr: ['#5c3814', '#4b2e10', '#6d441a'],
  },
] as const;

export type AutumnId = (typeof AUTUMN_SWATCHES)[number]['id'];

export const SEASONS: Record<SeasonId, Palette> = {
  spring: {
    id: 'spring',
    label: 'Spring',
    // Defaults match Sakura until a blossom swatch overrides.
    leaf: ['#f4b8cf', '#efa4c2', '#f8cfe0', '#e88fb2'],
    qrLeaf: ['#5e2340', '#4e1c35', '#6b2b4a'],
    bark: '#8a6a4e',
    barkDark: '#5f4733',
    hedge: ['#8fbf6a', '#7bad57', '#a2cd7e'],
    moduleDark: '#d6d1c4',
    moduleLight: '#fdfbf6',
    slab: '#cfc9bb',
    ground: '#f6f1e7',
  },
  summer: {
    id: 'summer',
    label: 'Summer',
    leaf: ['#6ab24a', '#5aa03c', '#84c664', '#4c8f31'],
    qrLeaf: ['#255417', '#1e4512', '#2c631d'],
    bark: '#8a6a4e',
    barkDark: '#5f4733',
    hedge: ['#7ec25a', '#6bb047', '#93d06f'],
    moduleDark: '#d6d1c4',
    moduleLight: '#fdfbf6',
    slab: '#cfc9bb',
    ground: '#f6f1e7',
  },
  autumn: {
    id: 'autumn',
    label: 'Autumn',
    leaf: ['#f2a13c', '#e8842a', '#f7c05e', '#d96a1f'],
    qrLeaf: ['#8a400c', '#763409', '#9c4c12'],
    bark: '#6f5540',
    barkDark: '#4a382a',
    hedge: ['#dcb84a', '#c9a437', '#e8cc6a'],
    moduleDark: '#d6d1c4',
    moduleLight: '#fdfbf6',
    slab: '#cfc9bb',
    ground: '#f6f1e7',
  },
  winter: {
    id: 'winter',
    label: 'Winter',
    // Evergreen canopy; frost is layered on in the canopy pass.
    leaf: ['#2f6b45', '#3d7f52', '#255538', '#4a8f5e', '#1e4630'],
    qrLeaf: ['#1a3a24', '#152e1d', '#21462c'],
    bark: '#6a5848',
    barkDark: '#43362c',
    hedge: ['#c9d6df', '#b7c7d2', '#dce5ec'],
    moduleDark: '#d0d6dc',
    moduleLight: '#f7f9fb',
    slab: '#c5ced6',
    ground: '#e8eef4',
  },
};

export const SEASON_ORDER: SeasonId[] = ['spring', 'summer', 'autumn', 'winter'];
