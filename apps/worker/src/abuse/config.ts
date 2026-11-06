/** Anti-abuse thresholds (spec §8b). The only place these numbers live. */
export const ABUSE = {
  cooldownDays: 7,
  anonPerHour: 3,
  anonPerDay: 10,
  userPerDay: 30,
  burstAnonPerPlacePerHour: 3,
  haterWindowH: 24,
  haterMinPlaces: 3,
  haterLowStars: 2,
  maxText: 280,
  softPublishMin: 10,
  anonWeight: 0.5,
  userWeight: 1,
} as const;
