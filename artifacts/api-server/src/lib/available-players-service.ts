import { randomUUID } from "node:crypto";
import { logger } from "./logger";
import { loadDraftRosters } from "./draft-roster-store";
import { poolScoringService, type PoolScoringService } from "./pool-scoring-service";
import {
  NHL_CATALOG_REFRESH_MS,
  NHL_CATALOG_TEAMS,
  postgresAvailableCatalogStore,
  type AvailableCatalogStore,
  type CatalogPlayer,
  type CatalogRecord,
} from "./available-player-catalog-store";

const SEASON = 20262027 as const;
const CATALOG_ERROR = "The NHL player catalog or its archived participant identities could not be fully refreshed; last-good records were retained.";
const REQUEST_TIMEOUT_MS = 12_000;
type Fetcher = typeof fetch;

function asRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function displayName(value: unknown): string | null {
  if (!asRecord(value)) return null;
  const first = asRecord(value.firstName) ? value.firstName.default : null;
  const last = asRecord(value.lastName) ? value.lastName.default : null;
  return typeof first === "string" && typeof last === "string" ? `${first} ${last}` : null;
}
function parseRoster(team: string, payload: unknown): CatalogPlayer[] {
  if (!asRecord(payload)) throw new Error("Invalid official NHL roster response.");
  const result: CatalogPlayer[] = [];
  for (const [field, expected] of [
    ["forwards", "F"], ["defensemen", "D"], ["goalies", "G"],
  ] as const) {
    const members = payload[field];
    if (!Array.isArray(members)) throw new Error("Incomplete official NHL roster response.");
    for (const member of members) {
      if (!asRecord(member) || typeof member.id !== "number" ||
          !Number.isSafeInteger(member.id) || member.id <= 0) {
        throw new Error("Invalid player identity in official NHL roster.");
      }
      const name = displayName(member);
      const positionCode = member.positionCode;
      const position = expected === "F" && positionCode === "C" ? "C"
        : expected === "F" && ["L", "R", "F", "W"].includes(String(positionCode)) ? "F"
        : expected === "D" && positionCode === "D" ? "D"
        : expected === "G" && positionCode === "G" ? "G"
        : null;
      if (!name || !position) throw new Error("Invalid player name or position in official NHL roster.");
      result.push({ nhlPlayerId: member.id, name, team, position });
    }
  }
  if (result.length === 0) throw new Error("Official NHL club roster was empty; last-good catalog retained.");
  return result;
}
async function mapConcurrency<T, R>(
  items: readonly T[], limit: number, fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i]!);
    }
  }));
  return results;
}

export interface AvailablePlayersServiceOptions {
  store?: AvailableCatalogStore;
  fetch?: Fetcher;
  now?: () => Date;
  timersEnabled?: boolean;
  loadRosters?: typeof loadDraftRosters;
  scoring?: Pick<PoolScoringService, "getLeaguePlayerScores"> &
    Partial<Pick<PoolScoringService, "getArchivePlayerIdentities">>;
}

export class AvailablePlayersService {
  private readonly store: AvailableCatalogStore;
  private readonly fetchImpl: Fetcher;
  private readonly now: () => Date;
  private readonly timersEnabled: boolean;
  private readonly loadRosters: typeof loadDraftRosters;
  private readonly scoring: Pick<PoolScoringService, "getLeaguePlayerScores"> &
    Partial<Pick<PoolScoringService, "getArchivePlayerIdentities">>;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;
  private refreshing: Promise<void> | null = null;

  constructor(options: AvailablePlayersServiceOptions = {}) {
    this.store = options.store ?? postgresAvailableCatalogStore;
    this.fetchImpl = options.fetch ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.timersEnabled = options.timersEnabled ?? true;
    this.loadRosters = options.loadRosters ?? loadDraftRosters;
    this.scoring = options.scoring ?? poolScoringService;
  }

  async start(): Promise<void> {
    this.stopped = false;
    void this.refreshIfDue().catch(() => undefined);
    this.arm(NHL_CATALOG_REFRESH_MS);
  }
  async stop(): Promise<void> {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    await this.refreshing;
  }
  private arm(delay: number): void {
    if (!this.timersEnabled || this.stopped) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.timer = null;
      void this.refreshIfDue().finally(() => this.arm(NHL_CATALOG_REFRESH_MS));
    }, Math.max(1_000, Math.min(delay, NHL_CATALOG_REFRESH_MS)));
    this.timer.unref?.();
  }
  private async fetchRoster(team: string): Promise<CatalogPlayer[]> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(
        `https://api-web.nhle.com/v1/roster/${team}/${SEASON}`,
        { headers: { Accept: "application/json" }, signal: controller.signal },
      );
      if (!response.ok) throw new Error("NHL roster request failed.");
      return parseRoster(team, await response.json());
    } finally {
      clearTimeout(timer);
    }
  }
  private async fetchLanding(identity: { nhlPlayerId: number; team: string; position: "F" | "D" | "G" }): Promise<CatalogPlayer> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(
        `https://api-web.nhle.com/v1/player/${identity.nhlPlayerId}/landing`,
        { headers: { Accept: "application/json" }, signal: controller.signal },
      );
      if (!response.ok) throw new Error("NHL player profile request failed.");
      const payload: unknown = await response.json();
      if (!asRecord(payload) || payload.playerId !== identity.nhlPlayerId) {
        throw new Error("Invalid official NHL player profile.");
      }
      const name = displayName(payload);
      const currentTeam = typeof payload.currentTeamAbbrev === "string" &&
        NHL_CATALOG_TEAMS.includes(payload.currentTeamAbbrev as typeof NHL_CATALOG_TEAMS[number])
        ? payload.currentTeamAbbrev
        : identity.team;
      const code = payload.position;
      const position = code === "C" ? "C" : code === "F" || code === "L" || code === "R" || code === "W"
        ? "F" : code === "D" ? "D" : code === "G" ? "G" : identity.position;
      if (!name) throw new Error("NHL player profile is missing a name.");
      return {
        nhlPlayerId: identity.nhlPlayerId,
        name,
        team: currentTeam,
        position,
      };
    } finally {
      clearTimeout(timer);
    }
  }
  private async refreshIfDue(): Promise<void> {
    if (this.refreshing) return this.refreshing;
    const work = this.refreshCycle();
    this.refreshing = work;
    try { await work; } finally { if (this.refreshing === work) this.refreshing = null; }
  }
  private async refreshCycle(): Promise<void> {
    let previous: CatalogRecord | null = null;
    try { previous = await this.store.read(); } catch { /* Attempt lease/cache recovery below. */ }
    const nextAt = previous?.nextRefreshAt ? Date.parse(previous.nextRefreshAt) : NaN;
    if (Number.isFinite(nextAt) && nextAt > this.now().getTime()) {
      this.arm(nextAt - this.now().getTime());
      return;
    }
    const token = randomUUID();
    let claimed = false;
    try {
      claimed = await this.store.claim(token);
      if (!claimed) return;
      const results = await mapConcurrency(NHL_CATALOG_TEAMS, 4, async team => {
        try {
          return { team, players: await this.fetchRoster(team), checkedAt: new Date().toISOString() };
        } catch {
          return { team, players: null, checkedAt: null };
        }
      });
      const teams = { ...(previous?.teams ?? {}) };
      const teamRefreshedAt = { ...(previous?.teamRefreshedAt ?? {}) };
      const refreshedAt = this.now().toISOString();
      for (const result of results) {
        if (result.players) {
          teams[result.team] = result.players;
          teamRefreshedAt[result.team] = result.checkedAt ?? refreshedAt;
        }
      }
      let archivePlayers = [...(previous?.archivePlayers ?? [])];
      let identityFailures = 0;
      if (this.scoring.getArchivePlayerIdentities) {
        try {
          const archived = await this.scoring.getArchivePlayerIdentities();
          const rosterIds = new Set(Object.values(teams).flat().map(player => player.nhlPlayerId));
          const known = new Set(archivePlayers.map(player => player.nhlPlayerId));
          const missing = archived.filter(identity =>
            !rosterIds.has(identity.nhlPlayerId) && !known.has(identity.nhlPlayerId),
          );
          const lookedUp = await mapConcurrency(missing, 4, async identity => {
            try { return await this.fetchLanding(identity); } catch { return null; }
          });
          identityFailures = lookedUp.filter(player => !player).length;
          archivePlayers = [...archivePlayers, ...lookedUp.filter(
            (player): player is CatalogPlayer => player !== null,
          )];
          archivePlayers = archivePlayers.filter(player => !rosterIds.has(player.nhlPlayerId));
        } catch {
          identityFailures = 1;
        }
      }
      const failures = results.filter(result => !result.players).length + identityFailures;
      const now = this.now();
      const record: CatalogRecord = {
        catalogType: "available-player-catalog",
        version: 1,
        teams,
        teamRefreshedAt,
        archivePlayers,
        lastCatalogRefreshAt: failures === 0 || Object.keys(teams).length > 0
          ? now.toISOString()
          : previous?.lastCatalogRefreshAt ?? null,
        nextRefreshAt: new Date(now.getTime() + NHL_CATALOG_REFRESH_MS).toISOString(),
        reason: failures ? CATALOG_ERROR : null,
      };
      await this.store.succeed(token, record);
      if (failures) logger.warn({ failedTeams: failures }, "Available player catalog refresh was partial");
    } catch (error) {
      if (claimed) {
        try { await this.store.fail(token, CATALOG_ERROR); } catch { /* Retain persisted last-good catalog. */ }
      }
      logger.warn({ err: error }, "Available player catalog refresh failed");
    } finally {
      this.arm(NHL_CATALOG_REFRESH_MS);
    }
  }

  async getSnapshot() {
    let catalog: CatalogRecord | null = null;
    let cacheError = false;
    try { catalog = await this.store.read(); } catch { cacheError = true; }
    const due = !catalog?.nextRefreshAt || Date.parse(catalog.nextRefreshAt) <= this.now().getTime();
    if (due) void this.refreshIfDue().catch(() => undefined);
    let rosters: Awaited<ReturnType<typeof loadDraftRosters>>;
    try { rosters = await this.loadRosters(); }
    catch {
      return this.emptySnapshot("The saved draft roster ownership records could not be read.");
    }
    const owned = new Set<number>();
    for (const owner of rosters) for (const selection of owner.selections) {
      if (selection.droppedAt) continue;
      if (selection.assetType === "skater" && selection.nhlPlayerId) owned.add(selection.nhlPlayerId);
      for (const goalie of selection.goalies ?? []) owned.add(goalie.nhlPlayerId);
    }
    const discovered = new Map<number, CatalogPlayer>();
    const evidenceAt = new Map<number, number>();
    for (const team of NHL_CATALOG_TEAMS) {
      for (const player of catalog?.teams[team] ?? []) {
        const freshness = Date.parse(catalog?.teamRefreshedAt?.[team] ??
          catalog?.lastCatalogRefreshAt ?? "");
        if (!discovered.has(player.nhlPlayerId) ||
            freshness > (evidenceAt.get(player.nhlPlayerId) ?? Number.NEGATIVE_INFINITY)) {
          discovered.set(player.nhlPlayerId, player);
          evidenceAt.set(player.nhlPlayerId, freshness);
        }
      }
    }
    for (const player of catalog?.archivePlayers ?? []) {
      if (!discovered.has(player.nhlPlayerId)) discovered.set(player.nhlPlayerId, player);
    }
    const identities = [...discovered.values()];
    const score = await this.scoring.getLeaguePlayerScores(identities);
    const scoreById = new Map(score.rows.map(row => [row.nhlPlayerId, row]));
    const rows = identities.filter(player => !owned.has(player.nhlPlayerId)).map(player => {
      const scored = scoreById.get(player.nhlPlayerId)!;
      return { ...player, ...scored, team: player.team };
    }).sort((a, b) => {
      const pointsA = a.poolPoints, pointsB = b.poolPoints;
      if (pointsA === null && pointsB !== null) return 1;
      if (pointsB === null && pointsA !== null) return -1;
      return (pointsB ?? 0) - (pointsA ?? 0) ||
        a.name.localeCompare(b.name) || a.nhlPlayerId - b.nhlPlayerId;
    });
    const covered = NHL_CATALOG_TEAMS.filter(team => (catalog?.teams[team]?.length ?? 0) > 0).length;
    let reason = cacheError
      ? "The persisted NHL player catalog could not be read."
      : catalog?.reason ?? score.reason ??
        (!catalog ? "The official NHL roster catalog has not been refreshed yet." : null);
    if (covered < NHL_CATALOG_TEAMS.length) {
      reason = `${reason ? `${reason} ` : ""}Catalog covers ${covered} of 32 NHL clubs.`;
    }
    const stale = Boolean(catalog?.lastCatalogRefreshAt &&
      this.now().getTime() - Date.parse(catalog.lastCatalogRefreshAt) > NHL_CATALOG_REFRESH_MS * 2);
    const status = cacheError || !catalog || covered === 0
      ? "unavailable" as const
      : covered < 32 || score.status !== "available" || catalog.reason
        ? "partial" as const
        : stale ? "stale" as const : "available" as const;
    return {
      status,
      reason: reason ?? null,
      asOf: score.asOf,
      lastCatalogRefreshAt: catalog?.lastCatalogRefreshAt ?? null,
      nextRefreshAt: catalog?.nextRefreshAt ?? null,
      season: SEASON,
      coverageThroughDate: score.coverageThroughDate,
      totalNhlPlayers: discovered.size,
      ownedPlayersExcluded: [...owned].filter(id => discovered.has(id)).length,
      catalogTeamsCovered: covered,
      catalogTeamsTotal: 32 as const,
      rows,
    };
  }
  private emptySnapshot(reason: string) {
    return {
      status: "unavailable" as const, reason, asOf: null, lastCatalogRefreshAt: null,
      nextRefreshAt: null, season: SEASON, coverageThroughDate: null,
      totalNhlPlayers: 0, ownedPlayersExcluded: 0, catalogTeamsCovered: 0,
      catalogTeamsTotal: 32 as const, rows: [],
    };
  }
}

export const availablePlayersService = new AvailablePlayersService();