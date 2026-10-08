import { createHash } from "node:crypto";
import type { DailyReport } from "@workspace/api-zod";
import type { loadDraftRosters } from "./draft-roster-store";
import type { DailyPoolScoringSnapshot, PoolScoringSnapshot } from "./pool-scoring-service";
import { scoredStandings } from "./pool-standings";

export function torontoReportClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", hourCycle: "h23",
  }).formatToParts(now);
  const value = (key: string) => parts.find(p => p.type === key)!.value;
  return { date: `${value("year")}-${value("month")}-${value("day")}`, ready: Number(value("hour")) >= 8 };
}

export function previousCalendarDate(date: string) {
  const day = new Date(`${date}T12:00:00Z`);
  day.setUTCDate(day.getUTCDate() - 1);
  return day.toISOString().slice(0, 10);
}

export type VerifiedReportInput = {
  reportDate: string;
  daily: DailyPoolScoringSnapshot;
  prior: DailyPoolScoringSnapshot;
  season: PoolScoringSnapshot;
  rosters: Awaited<ReturnType<typeof loadDraftRosters>>;
  activePlayers: Map<string, number | null>;
};

export function verifyReportInput(input: VerifiedReportInput) {
  const { daily, season, rosters, prior, reportDate } = input;
  if (daily.date !== previousCalendarDate(reportDate) || daily.status !== "final" ||
      season.status !== "available" || !season.coverageThroughDate ||
      season.coverageThroughDate < daily.date || !season.asOf ||
      daily.owners.length !== rosters.length || !rosters.length) {
    throw new Error("Daily report is waiting for finalized, complete pool scoring.");
  }
  const standings = scoredStandings(rosters, season, prior, daily, daily.date);
  if (standings.status !== "available" || new Set(daily.owners.map(o => o.ownerId)).size !== rosters.length) {
    throw new Error("Daily report is waiting for verified standings.");
  }
  for (const owner of daily.owners) {
    const row = standings.rows.find(r => r.id === owner.ownerId);
    if (!row || row.seasonPoints !== owner.seasonPoints || row.rank !== owner.rank ||
        row.livePoints !== owner.dailyPoints || row.previousRank !== owner.previousRank ||
        !Number.isFinite(owner.dailyPoints) || !Number.isFinite(owner.seasonPoints)) {
      throw new Error("DAILY ANALYSIS DATA MISMATCH");
    }
  }
}

export function reportFingerprint(input: VerifiedReportInput) {
  // Refresh timestamps are not corrections. Only report evidence changes its fingerprint.
  return createHash("sha256").update(JSON.stringify({
    date: input.daily.date, owners: input.daily.owners, scoring: input.daily.scoring,
    season: input.season.rows, active: [...input.activePlayers.entries()].sort(),
    identities: input.season.rows.map(row => {
      const owner = input.rosters.find(o => o.id === row.ownerId);
      const pick = owner?.selections.find(s => s.nhlPlayerId === row.nhlPlayerId ||
        s.goalies?.some(g => g.nhlPlayerId === row.nhlPlayerId));
      const identity = pick?.assetType === "skater" ? pick :
        pick?.goalies?.find(g => g.nhlPlayerId === row.nhlPlayerId);
      return { owner: owner?.name, name: identity?.confirmedName, team: identity?.confirmedTeam };
    }),
  })).digest("hex");
}

export type ReportWriting = {
  summary: string;
  raceNarrative: string;
  owners: { ownerId: string; narrative: string }[];
};

export function validateWriting(raw: unknown, ids: string[]): ReportWriting {
  if (!raw || typeof raw !== "object") throw new Error("Invalid report commentary");
  const candidate = raw as ReportWriting;
  const textOK = (text: unknown) => typeof text === "string" && text.trim().length >= 30 &&
    text.length <= 6000 && !/\d/.test(text) &&
    !/\b(narrowed|widened|compressed|tightened|shrank)\b/i.test(text);
  if (!textOK(candidate.summary) || !textOK(candidate.raceNarrative) ||
      !Array.isArray(candidate.owners) || candidate.owners.length !== ids.length ||
      new Set(candidate.owners.map(o => o.ownerId)).size !== ids.length ||
      candidate.owners.some(o => !ids.includes(o.ownerId) || !textOK(o.narrative))) {
    throw new Error("AI commentary failed validation; no report was published.");
  }
  return candidate;
}

export function assembleReport(input: VerifiedReportInput, writing: ReportWriting, publishedAt: string): DailyReport {
  verifyReportInput(input);
  const ordered = [...input.daily.owners].sort((a, b) => a.rank - b.rank || a.ownerName.localeCompare(b.ownerName));
  const leaderPoints = Math.max(...ordered.map(o => o.seasonPoints));
  const owners = ordered.map(o => ({
    ...o,
    narrative: writing.owners.find(w => w.ownerId === o.ownerId)!.narrative,
    gapFromFirst: leaderPoints - o.seasonPoints,
    movement: o.previousRank === null ? null : o.previousRank - o.rank,
    tied: ordered.filter(other => other.rank === o.rank).length > 1,
    activePlayers: input.activePlayers.get(o.ownerId) ?? null,
  }));
  const daily = [...input.daily.scoring].sort((a, b) => b.poolPoints - a.poolPoints || a.playerName.localeCompare(b.playerName));
  const highestDaily = Math.max(0, ...owners.map(o => o.dailyPoints));
  const highestPlayer = Math.max(0, ...daily.map(p => p.poolPoints));
  const seasonLeaders: DailyReport["seasonLeaders"] = [];
  for (const row of input.season.rows) {
    if (!row.nhlPlayerId || row.poolPoints === null) continue;
    const roster = input.rosters.find(o => o.id === row.ownerId);
    const pick = roster?.selections.find(s => s.nhlPlayerId === row.nhlPlayerId ||
      s.goalies?.some(g => g.nhlPlayerId === row.nhlPlayerId));
    const identity = pick?.assetType === "skater" ? pick :
      pick?.goalies?.find(g => g.nhlPlayerId === row.nhlPlayerId);
    if (!roster || !identity?.confirmedName) throw new Error("Season leaderboard identity is not verified.");
    seasonLeaders.push({
      playerId: String(row.nhlPlayerId), playerName: identity.confirmedName, ownerName: roster.name,
      team: identity.confirmedTeam ?? "", poolPoints: row.poolPoints,
    });
  }
  seasonLeaders.sort((a, b) => b.poolPoints - a.poolPoints || a.playerName.localeCompare(b.playerName));
  const closestRaces = owners.slice(1).map((o, index) => ({
    participants: [owners[index].ownerName, o.ownerName],
    gap: owners[index].seasonPoints - o.seasonPoints,
  })).sort((a, b) => a.gap - b.gap).slice(0, 5);
  const topWithTies = <T extends { poolPoints: number }>(rows: T[], count: number) =>
    rows.filter(r => r.poolPoints >= (rows[count - 1]?.poolPoints ?? -Infinity));
  const prior = [...input.prior.owners].sort((a, b) => a.rank - b.rank);
  const leadComparison = owners.length >= 2 && input.prior.status === "final" && prior.length === owners.length
    ? `The leader's advantage is ${owners[0].seasonPoints - owners[1].seasonPoints} pool points, compared with ${prior[0].seasonPoints - prior[1].seasonPoints} at the previous verified cutoff.`
    : "";
  return {
    reportDate: input.reportDate, gamesThroughDate: input.daily.date,
    dataUpdatedAt: input.season.asOf!, publishedAt, corrected: false,
    summary: writing.summary, raceNarrative: [writing.raceNarrative, leadComparison].filter(Boolean).join("\n\n"), owners,
    playersOfNight: highestPlayer > 0 ? daily.filter(p => p.poolPoints === highestPlayer) : [],
    participantsOfNight: highestDaily > 0 ? owners.filter(o => o.dailyPoints === highestDaily).map(o => o.ownerId) : [],
    dailyLeaders: topWithTies(daily, 10), seasonLeaders: topWithTies(seasonLeaders, 10),
    closestRaces,
    topThreeGap: owners.length >= 3 ? leaderPoints - owners[2].seasonPoints : null,
    topFiveGap: owners.length >= 5 ? leaderPoints - owners[4].seasonPoints : null,
  };
}