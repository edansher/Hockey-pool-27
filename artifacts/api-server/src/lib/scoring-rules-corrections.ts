// The owner corrected the previously saved six-point defenseman value.
// Apply only to that known revision; never overwrite subsequent rule edits.
export const CONFIRMED_SCORING_EFFECTIVE_FROM = new Date("2026-09-29T04:00:00.000Z");

export function correctedDefensemanHatTrick(record: {
  revision: number;
  config: Record<string, number | boolean>;
}) {
  if (record.revision !== 2 || record.config.defensemanHatTrick !== 6) return null;
  return {
    config: { ...record.config, defensemanHatTrick: 10 },
    revision: 3,
    effectiveFrom: new Date(CONFIRMED_SCORING_EFFECTIVE_FROM),
  };
}