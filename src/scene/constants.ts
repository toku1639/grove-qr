/** One QR module = one world unit. */
export const CELL = 1;
/** Leaves stacked on each dark module. Overlap from above is fine (ECC H). */
export const LEAVES_PER_MODULE = 6;
/** Height of a settled module block. Uniform, so every top face lights equally. */
export const MODULE_HEIGHT = 0.34;

/** Corner view, nudged ~20° clockwise. */
export const ISO_AZIMUTH = Math.PI / 4 - (20 * Math.PI) / 180;
/** Initial orbit elevation from the horizon (~15°). */
export const ISO_ELEVATION = (15 * Math.PI) / 180;
export const TOP_ELEVATION = Math.PI / 2 - 0.0001;
