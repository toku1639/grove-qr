import type { SeasonId } from './palette';

export type ClimateId = 'calm' | 'wind' | 'rain' | 'snow';

export interface Climate {
  id: ClimateId;
  label: string;
  /** Canopy sway multiplier while the tree is up. */
  wind: number;
  /** How busy the falling particles feel. */
  density: number;
}

export const CLIMATES: Record<ClimateId, Climate> = {
  calm: { id: 'calm', label: 'Calm', wind: 0.45, density: 0.55 },
  wind: { id: 'wind', label: 'Wind', wind: 1.85, density: 1.15 },
  rain: { id: 'rain', label: 'Rain', wind: 0.9, density: 1.4 },
  snow: { id: 'snow', label: 'Snow', wind: 0.7, density: 1.05 },
};

/** Climates that make sense for each season. Snow only belongs to winter. */
export function climatesForSeason(season: SeasonId): readonly ClimateId[] {
  if (season === 'winter') return ['calm', 'wind', 'snow'];
  return ['calm', 'wind', 'rain'];
}

export function defaultClimateForSeason(season: SeasonId): ClimateId {
  return season === 'winter' ? 'snow' : 'calm';
}

export function clampClimateToSeason(season: SeasonId, climate: ClimateId): ClimateId {
  const allowed = climatesForSeason(season);
  return allowed.includes(climate) ? climate : defaultClimateForSeason(season);
}
