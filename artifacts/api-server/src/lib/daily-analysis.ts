/** Without a verified scoring source, an empty list is unknown, not a zero-point day. */
export function unavailableDailyAnalysis(date: string) {
  return {
    date,
    status: "unavailable" as const,
    summary: "Official NHL game data is checked every five minutes. Pool analysis still needs verified draft identities and scoring calculations. This night's owner performances, player points, and scoring breakdowns are unavailable—not zero or estimated.",
    owners: [],
    scoring: [],
  };
}