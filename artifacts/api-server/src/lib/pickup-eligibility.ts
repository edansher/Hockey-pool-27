import { createHash } from "node:crypto";
import type { DraftRosterSelection } from "@workspace/db";

export interface EligibilityGame {
  gameId: number; gameDate: string; matchup: string;
  scheduledStart: string | null; cutoff: string | null; eligible: boolean | null;
}
interface ScheduleGame { gameId: number; gameDate: string; matchup: string; scheduledStart: string | null }
const scheduleCache = new Map<string, { until: number; games: ScheduleGame[] | null }>();
export function cutoffEligibility(confirmation: string | Date, scheduledStart: string | null): boolean | null {
  if (!scheduledStart || !Number.isFinite(Date.parse(scheduledStart))) return null;
  return new Date(confirmation).getTime() <= Date.parse(scheduledStart) - 60_000;
}
export function torontoDate(now: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Toronto", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export async function eligibilityPlan(team: string, now = new Date(), relevantDate?: string) {
  let cached = scheduleCache.get(team);
  if (!cached || cached.until < now.getTime()) {
    let games: ScheduleGame[] | null = null;
    try {
      if (!/^[A-Z]{2,3}$/.test(team)) throw new Error("Invalid NHL team");
      const response = await fetch(`https://api-web.nhle.com/v1/club-schedule-season/${team}/20262027`, { signal: AbortSignal.timeout(10_000) });
      if (!response.ok) throw new Error("Official schedule unavailable");
      const data = await response.json() as { games?: any[] };
      if (!Array.isArray(data.games) || !data.games.length) throw new Error("Official schedule incomplete");
      games = data.games.filter(g => g.gameType === 2 && g.season === 20262027)
        .map(g => {
          if (!Number.isSafeInteger(g.id) || typeof g.gameDate !== "string") throw new Error("Invalid official game");
          const time = typeof g.startTimeUTC === "string" && Number.isFinite(Date.parse(g.startTimeUTC)) ? new Date(g.startTimeUTC).toISOString() : null;
          return { gameId: g.id, gameDate: g.gameDate, matchup: `${g.awayTeam?.abbrev ?? "Away"} vs. ${g.homeTeam?.abbrev ?? "Home"}`, scheduledStart: time };
        }).sort((a, b) => a.gameDate.localeCompare(b.gameDate) || (a.scheduledStart ?? "").localeCompare(b.scheduledStart ?? ""));
    } catch { /* Fail explicitly as pending; never promise eligibility from guessed schedules. */ }
    cached = { games, until: now.getTime() + (games ? 60_000 : 10_000) };
    scheduleCache.set(team, cached);
  }
  const today = relevantDate ?? torontoDate(now);
  const remaining = cached.games?.filter(g => g.gameDate >= today) ?? [];
  const todayGames = remaining.filter(g => g.gameDate === today);
  const next = remaining.find(g => g.gameDate > today);
  const games: EligibilityGame[] = [...todayGames, ...(next ? [next] : [])].map(g => ({
    ...g, cutoff: g.scheduledStart ? new Date(Date.parse(g.scheduledStart) - 60_000).toISOString() : null,
    eligible: cutoffEligibility(now, g.scheduledStart),
  }));
  const pendingVerification = cached.games === null || games.some(g => g.eligible === null);
  const eligibilityToken = createHash("sha256").update(JSON.stringify({ games, pendingVerification })).digest("hex");
  return { games, pendingVerification, eligibilityToken };
}
export function recheckEligibility(plan: Awaited<ReturnType<typeof eligibilityPlan>>, now: Date) {
  const games = plan.games.map(g => ({ ...g, eligible: cutoffEligibility(now, g.scheduledStart) }));
  return { ...plan, games, eligibilityToken: createHash("sha256")
    .update(JSON.stringify({ games, pendingVerification: plan.pendingVerification })).digest("hex") };
}
/** Each new ownership period applies the recorded official deadline, never puck drop. */
export function ownershipGameEligibility(
  selection: DraftRosterSelection, gameId: number, gameDate: string, scheduledStart?: string | null,
): boolean | null {
  if (selection.scoringExcludedGameIds?.includes(gameId)) return false;
  if (!selection.acquiredAt || !selection.eligibilityPolicy) return true; // Preserve legacy moves.
  const saved = selection.eligibilityGames?.find(g => g.gameId === gameId);
  if (saved?.overriddenByAdministrator && saved.eligible !== null) return saved.eligible;
  if (gameDate < torontoDate(new Date(selection.acquiredAt))) return false;
  if (selection.eligibleAfterGameDate && gameDate <= selection.eligibleAfterGameDate) return false;
  if (saved?.eligible !== undefined && saved.eligible !== null) return saved.eligible;
  return cutoffEligibility(selection.acquiredAt, saved?.scheduledStart ?? scheduledStart ?? null);
}