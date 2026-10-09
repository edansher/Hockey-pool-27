import assert from "node:assert/strict";
import test from "node:test";
import type { DraftRoster } from "../data/draft-rosters";
import { draftRosters as sourceDraftRosters } from "../data/draft-rosters";
import {
  DEFAULT_SCORING_RULES,
} from "./pool-scoring";
import {
  LIVE_PROVISIONAL_REASON,
  PoolScoringService,
  type PoolScoringArchive,
  type NhlJsonFetch,
  verifiedCoverageThroughDate,
  rowsForRosters,
} from "./pool-scoring-service";
import { scoredStandings } from "./pool-standings";
import type {
  NhlPoolScoringArchiveRecord,
  NhlPoolScoringArchiveStore,
} from "./nhl-source-store";
import type { NhlSourceFeeds } from "./nhl-source-parser";
import { goalieTeamResult, type NormalizedNhlGame } from "./nhl-game-normalizer";
import { addPhotoConfirmedGoalies } from "./draft-roster-identity";
import type { loadDraftRosters } from "./draft-roster-store";

test("pickup excludes completed pre-pickup games even after late NHL corrections", () => {
  const oldGame = gameFact({ goals: 0 });
  oldGame.players["101"]!.assists = 5;
  const newGame = { ...gameFact({ goals: 0 }), gameId: oldGame.gameId + 1, gameDate: "2026-10-03" };
  newGame.players["101"]!.assists = 2;
  const archive = testArchive(oldGame);
  archive.gameFacts[String(newGame.gameId)] = newGame;
  const rosters = testRoster.map(owner => ({ ...owner, selections: owner.selections.map(pick => ({
    ...pick, acquiredAt: "2026-10-02T13:14:00Z", scoringExcludedGameIds: [oldGame.gameId],
  })) }));
  const credited = rowsForRosters(rosters, archive, DEFAULT_SCORING_RULES, true, "2026-10-03");
  const season = rowsForRosters(testRoster, archive, DEFAULT_SCORING_RULES, true);
  assert.equal(credited[0]!.poolPoints, 2 * DEFAULT_SCORING_RULES.assist);
  assert.equal(season[0]!.poolPoints, 7 * DEFAULT_SCORING_RULES.assist);
});

test("two rolling score-feed dates do not masquerade as full-season coverage", () => {
  const rollingOnly = {
    version: 1,
    season: 20262027,
    regularSeasonStartDate: null,
    scheduleCursor: null,
    noGamesBeforeStartConfirmedThrough: null,
    scheduleDates: {
      "2026-09-30": [],
      "2026-10-01": [],
    },
    scheduledGames: {},
    gameFacts: {},
    sourceIssue: null,
  };
  assert.equal(verifiedCoverageThroughDate(rollingOnly, "2026-10-01"), null);
});

test("league available-player projection uses saved per-game skater rules and individual goalie shutout scoring", async () => {
  const skater = gameFact({ goals: 3 });
  skater.players["101"] = {
    ...skater.players["101"]!,
    goals: [
      { powerPlay: true, shortHanded: false, overtime: false },
      { powerPlay: false, shortHanded: false, overtime: false },
      { powerPlay: false, shortHanded: false, overtime: false },
    ],
    assists: 1,
  };
  const goalie = goalieFact({ blackwoodShutout: true });
  skater.players["8478406"] = goalie.players["8478406"]!;
  skater.goalieResultsComplete = true;
  const customRules = {
    ...DEFAULT_SCORING_RULES,
    goal: 1, assist: 3, powerPlayGoal: 5, forwardHatTrick: 10,
    goalieTeamWin: 2, goalieTeamShutoutWin: 5, goalieAssist: 3, goalieGoal: 10,
  };
  const comparisonRoster: DraftRoster[] = [{
    id: "available-comparison",
    name: "Comparison",
    selections: [
      ...testRoster[0]!.selections,
      {
        round: 2,
        originalText: "Blackwood",
        assetType: "goalieTeam",
        position: "G",
        reviewNote: null,
        confirmedTeam: "Colorado Avalanche",
        goalies: [{
          nhlPlayerId: 8478406,
          confirmedName: "Mackenzie Blackwood",
          confirmedTeam: "Colorado Avalanche",
          identitySource: "fixture",
        }],
        goalieNamesPending: false,
      },
    ],
  }];
  const store = new MemoryArchiveStore(testArchive(skater));
  const service = new PoolScoringService({
    store,
    now: () => NOW,
    loadRules: async () => ({ rules: customRules, revision: 19, effectiveFrom: NOW }),
    loadRosters: async () => comparisonRoster as Awaited<ReturnType<typeof loadDraftRosters>>,
  });
  const owned = await service.getSnapshot({ status: "available", lastSuccessAt: NOW.toISOString() });
  const result = await service.getLeaguePlayerScores([
    { nhlPlayerId: 101, team: "EDM", position: "F" },
    { nhlPlayerId: 8478406, team: "COL", position: "G" },
    { nhlPlayerId: 999, team: "EDM", position: "C" },
  ]);
  assert.equal(result.rows[0]?.poolPoints, 17); // 10-point hat trick + 4 PPG bonus + 3 assist
  assert.equal(result.rows[1]?.poolPoints, 18); // goalie goal (10) + assist (3) + shutout win (5)
  assert.equal(result.rows[1]?.wins, 1);
  assert.equal(result.rows[1]?.shutouts, 1);
  assert.equal(result.rows[2]?.poolPoints, 0); // verified through yesterday permits a real zero
  for (const nhlPlayerId of [101, 8478406]) {
    const availableRow = result.rows.find(row => row.nhlPlayerId === nhlPlayerId)!;
    const ownedRow = owned.rows.find(row => row.nhlPlayerId === nhlPlayerId)!;
    for (const field of [
      "goals", "assists", "powerPlayGoals", "shortHandedGoals", "overtimeGoals",
      "poolPoints", "gamesPlayed", "wins", "shutouts",
    ] as const) {
      assert.equal(availableRow[field], ownedRow[field], `${nhlPlayerId} ${field} must match pool scoring`);
    }
  }
});

test("league and owned rows agree with verified-through-yesterday, verified live, and not-yet-archived current games", async () => {
  const base = testArchive(gameFact());
  const liveGame = gameFact({ gameDate: "2026-10-01", gameState: "LIVE", final: false });
  liveGame.gameId = GAME_ID + 1;
  const snapshots: PoolScoringArchive[] = [
    base,
    {
      ...base,
      scheduleDates: { ...base.scheduleDates, "2026-10-01": [GAME_ID + 1] },
      scheduledGames: {
        ...base.scheduledGames,
        [String(GAME_ID + 1)]: {
          id: GAME_ID + 1, season: 20262027, gameType: 2, gameDate: "2026-10-01",
          gameState: "LIVE", awayAbbrev: "EDM", homeAbbrev: "VAN",
        },
      },
      gameFacts: { ...base.gameFacts, [String(GAME_ID + 1)]: liveGame },
    },
    {
      ...base,
      scheduleDates: { ...base.scheduleDates, "2026-10-01": [GAME_ID + 1] },
      scheduledGames: {
        ...base.scheduledGames,
        [String(GAME_ID + 1)]: {
          id: GAME_ID + 1, season: 20262027, gameType: 2, gameDate: "2026-10-01",
          gameState: "FUT", awayAbbrev: "EDM", homeAbbrev: "VAN",
        },
      },
    },
  ];
  for (const archive of snapshots) {
    const service = new PoolScoringService({
      store: new MemoryArchiveStore(archive),
      now: () => NOW,
      loadRosters: async () => testRoster as Awaited<ReturnType<typeof loadDraftRosters>>,
      loadRules: rulesLoader(),
    });
    const owned = await service.getSnapshot({ status: "available", lastSuccessAt: NOW.toISOString() });
    const available = await service.getLeaguePlayerScores([
      { nhlPlayerId: 101, team: "EDM", position: "F" },
    ]);
    const ownedRow = owned.rows.find(row => row.nhlPlayerId === 101)!;
    const availableRow = available.rows[0]!;
    for (const field of [
      "goals", "assists", "powerPlayGoals", "shortHandedGoals", "overtimeGoals",
      "poolPoints", "gamesPlayed",
    ] as const) {
      assert.equal(availableRow[field], ownedRow[field], `${field} must match owned aggregation`);
    }
  }
});

test("verified zero-game calendar dates count only inside official season schedule coverage", () => {
  const season = {
    version: 1,
    season: 20262027,
    regularSeasonStartDate: "2026-09-29",
    scheduleCursor: "2026-10-06",
    noGamesBeforeStartConfirmedThrough: null,
    scheduleDates: {
      "2026-09-29": [2026020001],
      "2026-09-30": [],
    },
    scheduledGames: {},
    gameFacts: {
      "2026020001": {
        gameId: 2026020001,
        gameDate: "2026-09-29",
        verified: true,
        final: true,
      },
    },
    sourceIssue: null,
  };
  assert.equal(verifiedCoverageThroughDate(season, "2026-09-30"), "2026-09-30");
});

test("a scheduled game with unverified events stops official zero coverage", () => {
  const season = {
    version: 1,
    season: 20262027,
    regularSeasonStartDate: "2026-09-29",
    scheduleCursor: "2026-10-06",
    noGamesBeforeStartConfirmedThrough: null,
    scheduleDates: {
      "2026-09-29": [2026020001],
      "2026-09-30": [],
    },
    scheduledGames: {},
    gameFacts: {
      "2026020001": {
        gameId: 2026020001,
        gameDate: "2026-09-29",
        verified: false,
        final: true,
      },
    },
    sourceIssue: null,
  };
  assert.equal(verifiedCoverageThroughDate(season, "2026-09-30"), null);
});

const GAME_ID = 2026020001;
const GAME_DATE = "2026-09-29";
const NOW = new Date("2026-10-01T16:00:00.000Z");
const testRoster: DraftRoster[] = [{
  id: "owner",
  name: "Pool Owner",
  selections: [{
    round: 1,
    originalText: "Test Player",
    assetType: "skater",
    position: "F",
    reviewNote: null,
    confirmedName: "Test Player",
    confirmedTeam: "Edmonton Oilers",
    nhlPlayerId: 101,
  }],
}];

const photoGoalieRoster: DraftRoster[] = [{
  id: "joe",
  name: "JOE",
  selections: [
    {
      round: 7,
      originalText: "Colorado",
      assetType: "goalieTeam",
      position: "G",
      reviewNote: null,
      confirmedTeam: "Colorado Avalanche",
      goalies: [
        {
          nhlPlayerId: 8478406,
          confirmedName: "Mackenzie Blackwood",
          confirmedTeam: "Colorado Avalanche",
          identitySource: "https://api-web.nhle.com/v1/player/8478406/landing",
        },
        {
          nhlPlayerId: 8475809,
          confirmedName: "Scott Wedgewood",
          confirmedTeam: "Colorado Avalanche",
          identitySource: "https://api-web.nhle.com/v1/player/8475809/landing",
        },
      ],
      goalieNamesPending: false,
    },
    {
      round: 18,
      originalText: "SJS",
      assetType: "goalieTeam",
      position: "G",
      reviewNote: null,
      confirmedTeam: "San Jose Sharks",
      goalies: [],
      goalieNamesPending: true,
    },
  ],
}];

const everyGoalieSlotRoster: Awaited<ReturnType<typeof loadDraftRosters>> =
  sourceDraftRosters.map(owner => ({
    id: owner.id,
    name: owner.name,
    selections: addPhotoConfirmedGoalies(
      owner.id,
      owner.selections.filter(selection => selection.assetType === "goalieTeam"),
    ).map(selection => {
      // This fixture deliberately models the initial partial ownership evidence.
      // Production photo imports must not turn this missing-coverage test into a
      // complete-roster scenario as more screenshots are supplied.
      const originalPhotoIds = new Set([8478406, 8475809, 8482137, 8477968]);
      const goalies = owner.id === "joe"
        ? (selection.goalies ?? []).filter(goalie => originalPhotoIds.has(goalie.nhlPlayerId))
        : [];
      return { ...selection, goalies, goalieNamesPending: goalies.length === 0 };
    }),
  })) as unknown as Awaited<ReturnType<typeof loadDraftRosters>>;

function rulesLoader() {
  return async () => ({
    rules: DEFAULT_SCORING_RULES,
    revision: 2,
    effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
  });
}

function gameFact(options: {
  verified?: boolean;
  final?: boolean;
  gameDate?: string;
  gameState?: string;
  goals?: number;
} = {}): NormalizedNhlGame {
  const goals = options.goals ?? 1;
  return {
    gameId: GAME_ID,
    season: 20262027,
    gameType: 2,
    gameDate: options.gameDate ?? GAME_DATE,
    gameState: options.gameState ?? (options.final === false ? "LIVE" : "FINAL"),
    homeTeamAbbrev: "VAN",
    awayTeamAbbrev: "EDM",
    homeTeamId: 2,
    awayTeamId: 1,
    homeScore: 0,
    awayScore: goals,
    players: {
      "101": {
        playerId: 101,
        position: "F",
        teamAbbrev: "EDM",
        goals: Array.from({ length: goals }, () => ({
          powerPlay: false,
          shortHanded: false,
          overtime: false,
        })),
        assists: 0,
        boxScoreGoals: goals,
        boxScoreAssists: 0,
        boxScorePowerPlayGoals: 0,
      },
    },
    verified: options.verified ?? true,
    reason: options.verified === false ? "Fixture facts are not verified." : null,
    final: options.final ?? true,
    lastPeriodType: "REG",
  };
}

function testArchive(fact = gameFact()): PoolScoringArchive {
  return {
    version: 1,
    season: 20262027,
    regularSeasonStartDate: "2026-09-29",
    scheduleCursor: "2026-10-08",
    noGamesBeforeStartConfirmedThrough: null,
    scheduleDates: {
      "2026-09-29": [GAME_ID],
      "2026-09-30": [],
    },
    scheduledGames: {
      [String(GAME_ID)]: {
        id: GAME_ID,
        season: 20262027,
        gameType: 2,
        gameDate: fact.gameDate,
        gameState: fact.gameState,
        awayAbbrev: "EDM",
        homeAbbrev: "VAN",
      },
    },
    gameFacts: { [String(GAME_ID)]: fact },
    gameCheckedAt: {},
    revalidationCursor: null,
    scheduleRevalidatedAt: NOW.toISOString(),
    seasonAudit: {
      version: 2,
      startDate: GAME_DATE,
      throughDate: "2026-09-30",
      scheduleCursor: "2026-10-01",
      scheduleComplete: true,
      gameIds: [GAME_ID],
      checkedGameIds: [GAME_ID],
      failedGameIds: [],
      auditCheckedAt: NOW.toISOString(),
      summary: {
        scheduledFinalCount: 1,
        verifiedFinalCount: 1,
        failureCount: 0,
        startDate: GAME_DATE,
        endDate: "2026-09-30",
        auditCheckedAt: NOW.toISOString(),
      },
    },
    sourceIssue: null,
  };
}

function goalieFact(options: {
  blackwoodShutout?: boolean;
  sharedShutout?: boolean;
  blackwoodGoals?: number;
  blackwoodAssists?: number;
  goalieResultsComplete?: boolean;
} = {}): NormalizedNhlGame {
  const blackwoodGoals = options.blackwoodGoals ?? 1;
  const blackwoodAssists = options.blackwoodAssists ?? 1;
  return {
    gameId: GAME_ID,
    season: 20262027,
    gameType: 2,
    gameDate: GAME_DATE,
    gameState: "OFF",
    homeTeamAbbrev: "SJS",
    awayTeamAbbrev: "COL",
    homeTeamId: 28,
    awayTeamId: 21,
    homeScore: 0,
    awayScore: blackwoodGoals,
    players: {
      "8478406": {
        playerId: 8478406,
        position: "G",
        teamAbbrev: "COL",
        goals: Array.from({ length: blackwoodGoals }, () => ({
          powerPlay: false,
          shortHanded: false,
          overtime: false,
        })),
        assists: blackwoodAssists,
        boxScoreGoals: blackwoodGoals,
        boxScoreAssists: blackwoodAssists,
        boxScorePowerPlayGoals: 0,
        goalieDecision: "W",
        goalieAppeared: true,
        goalieShutoutWin: options.blackwoodShutout ?? false,
      },
      "8475809": {
        playerId: 8475809,
        position: "G",
        teamAbbrev: "COL",
        goals: [],
        assists: 0,
        boxScoreGoals: 0,
        boxScoreAssists: 0,
        boxScorePowerPlayGoals: 0,
        goalieDecision: options.sharedShutout ? "O" : null,
        goalieAppeared: options.sharedShutout ?? false,
        goalieShutoutWin: false,
      },
      "8482137": {
        playerId: 8482137,
        position: "G",
        teamAbbrev: "SJS",
        goals: [],
        assists: 0,
        boxScoreGoals: 0,
        boxScoreAssists: 0,
        boxScorePowerPlayGoals: 0,
        goalieDecision: "L",
        goalieAppeared: true,
        goalieShutoutWin: false,
      },
    },
    verified: true,
    reason: null,
    final: true,
    lastPeriodType: "REG",
    goalieResultsComplete: options.goalieResultsComplete ?? true,
  };
}

class MemoryArchiveStore implements NhlPoolScoringArchiveStore {
  snapshot: unknown;
  lastSuccessAt: string | null;
  error: string | null = null;
  successes = 0;
  progressWrites = 0;

  constructor(snapshot: unknown, lastSuccessAt = "2026-10-01T14:33:42.000Z") {
    this.snapshot = snapshot;
    this.lastSuccessAt = lastSuccessAt;
  }

  async read(): Promise<NhlPoolScoringArchiveRecord> {
    return {
      snapshot: this.snapshot,
      lastAttemptAt: null,
      lastSuccessAt: this.lastSuccessAt,
      error: this.error,
    };
  }

  async succeed(snapshot: unknown): Promise<void> {
    this.snapshot = snapshot;
    this.lastSuccessAt = NOW.toISOString();
    this.error = null;
    this.successes++;
  }

  async progress(snapshot: unknown, safeError: string): Promise<void> {
    this.snapshot = snapshot;
    this.error = safeError;
    this.progressWrites++;
  }

  async fail(safeError: string): Promise<void> {
    this.error = safeError;
  }
}

const emptyFeeds: NhlSourceFeeds = {
  today: { date: "2026-10-01", games: [] },
  lastNight: { date: "2026-09-30", games: [] },
};

function officialGamecenterPayload(
  goals: number,
  gameDate = GAME_DATE,
  gameState = "OFF",
) {
  const boxscore = {
    id: GAME_ID,
    season: 20262027,
    gameType: 2,
    gameDate,
    gameState,
    awayTeam: { id: 1, abbrev: "EDM", score: goals },
    homeTeam: { id: 2, abbrev: "VAN", score: 0 },
    playerByGameStats: {
      awayTeam: {
        forwards: [{ playerId: 101, goals, assists: 0, powerPlayGoals: 0 }],
        defense: [],
        goalies: [{ playerId: 199 }],
      },
      homeTeam: { forwards: [], defense: [], goalies: [{ playerId: 299 }] },
    },
    gameOutcome: { lastPeriodType: "REG" },
  };
  const plays = goals > 0 ? [{
    typeDescKey: "goal",
    situationCode: "1551",
    periodDescriptor: { number: 1, periodType: "REG" },
    details: { scoringPlayerId: 101, eventOwnerTeamId: 1 },
  }] : [];
  return {
    boxscore,
    playByPlay: {
      id: GAME_ID,
      season: 20262027,
      gameType: 2,
      gameDate,
      plays,
    },
  };
}

function response(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("unverified historical game facts are retried, preserve last-good freshness on failure, then recover", async () => {
  const store = new MemoryArchiveStore(testArchive(gameFact({ verified: false })));
  let upstreamAvailable = false;
  const fetchImpl: NhlJsonFetch = async input => {
    if (!upstreamAvailable) return response({ error: "temporary failure" }, 503);
    const payload = officialGamecenterPayload(1);
    return response(String(input).endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});
  assert.equal(store.progressWrites, 1);
  assert.equal(store.successes, 0);
  assert.equal(store.lastSuccessAt, "2026-10-01T14:33:42.000Z");
  assert.ok(store.error);

  upstreamAvailable = true;
  await service.ingest(emptyFeeds, {});
  assert.equal(store.successes, 1);
  assert.equal(store.lastSuccessAt, NOW.toISOString());
  assert.equal(store.error, null);
  const archive = store.snapshot as PoolScoringArchive;
  assert.equal(archive.gameFacts[String(GAME_ID)]?.verified, true);
  assert.equal(archive.gameCheckedAt[String(GAME_ID)], NOW.toISOString());
});

test("verified historical games are revalidated on a bounded correction TTL and replaced by game ID", async () => {
  const oldCheckedAt = "2026-09-30T00:00:00.000Z";
  const archive = {
    ...testArchive(gameFact()),
    gameCheckedAt: { [String(GAME_ID)]: oldCheckedAt },
  };
  const store = new MemoryArchiveStore(archive);
  const fetchImpl: NhlJsonFetch = async input => {
    const corrected = officialGamecenterPayload(0);
    return response(String(input).endsWith("/boxscore") ? corrected.boxscore : corrected.playByPlay);
  };
  const service = new PoolScoringService({
    store,
    fetch: fetchImpl,
    now: () => NOW,
    loadRosters: async () => testRoster,
    loadRules: rulesLoader(),
  });

  await service.ingest(emptyFeeds, {});
  const correctedArchive = store.snapshot as PoolScoringArchive;
  assert.equal(store.successes, 1);
  assert.equal(correctedArchive.gameFacts[String(GAME_ID)]?.awayScore, 0);
  assert.equal(correctedArchive.gameCheckedAt[String(GAME_ID)], NOW.toISOString());
  assert.equal(Object.keys(correctedArchive.gameFacts).length, 1);
  const reread = await service.getSnapshot({ status: "available", lastSuccessAt: NOW.toISOString() });
  assert.equal(reread.rows[0]?.goals, 0);
  assert.equal(reread.rows[0]?.poolPoints, 0);
});

test("legacy final goalie facts are re-normalized before their ordinary correction TTL", async () => {
  const archive: PoolScoringArchive = {
    ...testArchive(gameFact()),
    gameCheckedAt: { [String(GAME_ID)]: NOW.toISOString() },
  };
  const store = new MemoryArchiveStore(archive);
  let requests = 0;
  const fetchImpl: NhlJsonFetch = async input => {
    requests++;
    const payload = officialGamecenterPayload(1);
    return response(String(input).endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});

  const refreshed = store.snapshot as PoolScoringArchive;
  assert.equal(requests, 2);
  assert.equal(refreshed.gameFacts[String(GAME_ID)]?.goalieResultsComplete, false);
  assert.equal(refreshed.gameCheckedAt[String(GAME_ID)], NOW.toISOString());
});

test("a missed historical LIVE game's fresh gamecenter state promotes it to final without schedule backfill", async () => {
  const oldDate = "2026-09-28";
  const oldLiveFact = gameFact({
    gameDate: oldDate,
    gameState: "LIVE",
    final: false,
    goals: 0,
  });
  const oldArchive: PoolScoringArchive = {
    ...testArchive(oldLiveFact),
    scheduleCursor: "2026-10-08",
    scheduleDates: { [oldDate]: [GAME_ID] },
    scheduledGames: {
      [String(GAME_ID)]: {
        id: GAME_ID,
        season: 20262027,
        gameType: 2,
        gameDate: oldDate,
        gameState: "LIVE",
        awayAbbrev: "EDM",
        homeAbbrev: "VAN",
      },
    },
  };
  const store = new MemoryArchiveStore(oldArchive);
  const requests: string[] = [];
  const fetchImpl: NhlJsonFetch = async input => {
    const url = String(input);
    requests.push(url);
    const latest = officialGamecenterPayload(2, oldDate, "OFF");
    return response(url.endsWith("/boxscore") ? latest.boxscore : latest.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });
  const staleCachedLive = officialGamecenterPayload(0, oldDate, "LIVE");

  await service.ingest(emptyFeeds, {
    [String(GAME_ID)]: staleCachedLive,
  });

  assert.equal(requests.length, 2);
  assert.ok(requests.every(url => url.includes(`/gamecenter/${GAME_ID}/`)));
  const recovered = store.snapshot as PoolScoringArchive;
  const scheduled = recovered.scheduledGames[String(GAME_ID)];
  const fact = recovered.gameFacts[String(GAME_ID)];
  assert.equal(scheduled?.gameState, "OFF");
  assert.equal(scheduled?.awayTeamId, 1);
  assert.equal(scheduled?.homeTeamId, 2);
  assert.equal(scheduled?.awayScore, 2);
  assert.equal(scheduled?.homeScore, 0);
  assert.equal(fact?.gameState, "OFF");
  assert.equal(fact?.final, true);
  assert.equal(fact?.awayScore, 2);
  assert.equal(fact?.homeScore, 0);
  assert.equal(fact?.awayTeamId, 1);
  assert.equal(fact?.homeTeamId, 2);
  assert.equal(goalieTeamResult(fact!, "EDM").win, true);
});

test("the season audit recovers all eight Sep 29-30 finals, excludes preseason and future games, and is idempotent", async () => {
  const scheduledFinals = Array.from({ length: 8 }, (_, index) => ({
    id: GAME_ID + index,
    season: 20262027,
    gameType: 2,
    gameState: "OFF",
    awayTeam: { abbrev: "EDM" },
    homeTeam: { abbrev: "VAN" },
  }));
  const schedule = {
    regularSeasonStartDate: GAME_DATE,
    nextStartDate: "2026-10-06",
    gameWeek: [
      ...["2026-09-29", "2026-09-30", "2026-10-01"].map(date => ({
        date,
        games: date === GAME_DATE
          ? [
              ...scheduledFinals.slice(0, 5),
              { ...scheduledFinals[0]!, id: GAME_ID + 50, gameType: 1 },
            ]
          : date === "2026-09-30"
            ? scheduledFinals.slice(5)
            : [{
                ...scheduledFinals[0]!,
                id: GAME_ID + 60,
                gameDate: "2026-10-01",
                gameState: "FUT",
              }],
      })),
    ],
  };
  const oldFact = gameFact({ goals: 0 });
  const oldArchive = {
    ...testArchive(oldFact),
    scheduleCursor: "2026-10-08",
    scheduleDates: { "2026-09-29": [], "2026-09-30": [] },
    scheduledGames: {},
    scheduleRevalidatedAt: null,
    // Simulate the now-invalid earlier checkpoint that completed against the
    // NHL schedule's absent per-game gameDate and incorrectly recorded 3 finals.
    seasonAudit: {
      version: 1,
      startDate: GAME_DATE,
      throughDate: "2026-10-01",
      scheduleCursor: "2026-09-29",
      scheduleComplete: true,
      gameIds: [GAME_ID + 5, GAME_ID + 6, GAME_ID + 7],
      checkedGameIds: [GAME_ID + 5, GAME_ID + 6, GAME_ID + 7],
      failedGameIds: [],
      auditCheckedAt: NOW.toISOString(),
    },
  } as unknown as PoolScoringArchive;
  const store = new MemoryArchiveStore(oldArchive);
  const requests: string[] = [];
  const fetchImpl: NhlJsonFetch = async input => {
    const url = String(input);
    requests.push(url);
    if (url.startsWith("https://api-web.nhle.com/v1/schedule/")) return response(schedule);
    const gameId = Number(url.match(/gamecenter\/(\d+)\//)?.[1]);
    const payload = officialGamecenterPayload(1, gameId <= GAME_ID + 4 ? GAME_DATE : "2026-09-30");
    payload.boxscore.id = gameId;
    payload.playByPlay.id = gameId;
    Object.assign(payload.boxscore.playerByGameStats.awayTeam.goalies[0]!, { decision: "W" });
    Object.assign(payload.boxscore.playerByGameStats.homeTeam.goalies[0]!, { decision: "L" });
    return response(url.endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});

  const audited = store.snapshot as PoolScoringArchive;
  assert.equal(audited.seasonAudit?.summary.scheduledFinalCount, 8);
  assert.equal(audited.seasonAudit?.summary.verifiedFinalCount, 8);
  assert.equal(audited.seasonAudit?.summary.failureCount, 0);
  assert.equal(audited.seasonAudit?.summary.startDate, "2026-09-29");
  assert.equal(audited.seasonAudit?.summary.endDate, "2026-10-01");
  assert.equal(audited.seasonAudit?.auditCheckedAt, NOW.toISOString());
  assert.equal(Object.keys(audited.gameFacts).length, 8);
  assert.equal(audited.gameFacts[String(GAME_ID)]?.players["101"]?.goals.length, 1);
  assert.equal(audited.gameFacts[String(GAME_ID)]?.verified, true);
  assert.equal(audited.gameFacts[String(GAME_ID)]?.goalieResultsComplete, true);
  assert.equal(audited.gameFacts[String(GAME_ID)]?.gameDate, "2026-09-29");
  assert.equal(audited.scheduledGames[String(GAME_ID + 60)]?.gameState, "FUT");
  assert.equal(audited.gameFacts[String(GAME_ID + 60)], undefined);
  assert.equal(audited.scheduledGames[String(GAME_ID + 50)], undefined);
  assert.equal(requests.filter(url => url.includes("/gamecenter/")).length, 16);

  await service.ingest(emptyFeeds, {});
  assert.equal(requests.filter(url => url.includes("/gamecenter/")).length, 16);
  assert.equal((store.snapshot as PoolScoringArchive).seasonAudit?.auditCheckedAt, NOW.toISOString());
});

test("season audit validation failures preserve verified facts and retry until the official pair validates", async () => {
  const schedule = {
    regularSeasonStartDate: GAME_DATE,
    nextStartDate: "2026-10-06",
    gameWeek: [{
      date: GAME_DATE,
      games: [{
        id: GAME_ID,
        season: 20262027,
        gameType: 2,
        gameDate: GAME_DATE,
        gameState: "OFF",
        awayTeam: { abbrev: "EDM" },
        homeTeam: { abbrev: "VAN" },
      }],
    }, { date: "2026-10-01", games: [] }],
  };
  const priorFact = { ...gameFact({ goals: 2 }), goalieResultsComplete: true };
  const store = new MemoryArchiveStore({
    ...testArchive(priorFact),
    scheduleCursor: "2026-10-08",
    gameCheckedAt: { [String(GAME_ID)]: NOW.toISOString() },
    scheduleRevalidatedAt: null,
    seasonAudit: null,
  });
  let invalid = true;
  let gamecenterRequests = 0;
  const fetchImpl: NhlJsonFetch = async input => {
    const url = String(input);
    if (url.startsWith("https://api-web.nhle.com/v1/schedule/")) return response(schedule);
    gamecenterRequests++;
    const payload = officialGamecenterPayload(1);
    Object.assign(payload.boxscore.playerByGameStats.awayTeam.goalies[0]!, { decision: "W" });
    Object.assign(payload.boxscore.playerByGameStats.homeTeam.goalies[0]!, { decision: "L" });
    if (invalid && url.endsWith("/boxscore")) payload.boxscore.id += 1;
    return response(url.endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});
  let persisted = store.snapshot as PoolScoringArchive;
  assert.equal(persisted.gameFacts[String(GAME_ID)]?.players["101"]?.goals.length, 2);
  assert.equal(persisted.gameFacts[String(GAME_ID)]?.verified, true);
  assert.deepEqual(persisted.seasonAudit?.failedGameIds, [GAME_ID]);
  assert.equal(persisted.seasonAudit?.auditCheckedAt, null);
  assert.ok(store.error);

  invalid = false;
  await service.ingest(emptyFeeds, {});
  persisted = store.snapshot as PoolScoringArchive;
  assert.equal(persisted.gameFacts[String(GAME_ID)]?.players["101"]?.goals.length, 1);
  assert.deepEqual(persisted.seasonAudit?.failedGameIds, []);
  assert.equal(persisted.seasonAudit?.summary.verifiedFinalCount, 1);
  assert.equal(persisted.seasonAudit?.auditCheckedAt, NOW.toISOString());
  assert.equal(gamecenterRequests, 4);
});

test("invalid official regular-season schedule rows cannot validate a cached empty date", async () => {
  const oldFact = gameFact({ goals: 2 });
  const archive: PoolScoringArchive = {
    ...testArchive(oldFact),
    scheduleDates: { "2026-09-29": [], "2026-09-30": [] },
    scheduledGames: {},
    scheduleRevalidatedAt: null,
    seasonAudit: null,
  };
  const malformedSchedule = {
    regularSeasonStartDate: GAME_DATE,
    nextStartDate: "2026-10-06",
    gameWeek: [
      {
        date: GAME_DATE,
        games: [{
          id: GAME_ID,
          season: 20262027,
          gameType: 2,
          gameDate: "2026-10-01",
          gameState: "OFF",
          awayTeam: { abbrev: "EDM" },
          homeTeam: { abbrev: "VAN" },
        }],
      },
      { date: "2026-09-30", games: [] },
      { date: "2026-10-01", games: [] },
    ],
  };
  const store = new MemoryArchiveStore(archive);
  const fetchImpl: NhlJsonFetch = async () => response(malformedSchedule);
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});

  const persisted = store.snapshot as PoolScoringArchive;
  assert.equal(persisted.seasonAudit?.scheduleComplete, false);
  assert.equal(persisted.seasonAudit?.auditCheckedAt, null);
  assert.equal(verifiedCoverageThroughDate(persisted, "2026-09-30"), null);
  assert.equal(persisted.gameFacts[String(GAME_ID)]?.players["101"]?.goals.length, 2);
  assert.ok(store.error);
});

test("recent official schedule refresh revisits cached empty dates and archives newly discovered finals", async () => {
  const archive: PoolScoringArchive = {
    ...testArchive(),
    scheduleDates: { "2026-09-29": [], "2026-09-30": [], "2026-10-01": [] },
    scheduledGames: {},
    gameFacts: {},
    gameCheckedAt: {},
    scheduleRevalidatedAt: "2026-09-30T00:00:00.000Z",
  };
  const schedule = {
    regularSeasonStartDate: GAME_DATE,
    nextStartDate: "2026-10-06",
    gameWeek: [
      { date: "2026-09-25", games: [] },
      {
        date: GAME_DATE,
        games: [{
          id: GAME_ID,
          season: 20262027,
          gameType: 2,
          gameDate: GAME_DATE,
          gameState: "OFF",
          awayTeam: { abbrev: "EDM" },
          homeTeam: { abbrev: "VAN" },
        }],
      },
      { date: "2026-09-30", games: [] },
      { date: "2026-10-01", games: [] },
    ],
  };
  const fetchImpl: NhlJsonFetch = async input => {
    const url = String(input);
    if (url.startsWith("https://api-web.nhle.com/v1/schedule/")) return response(schedule);
    const payload = officialGamecenterPayload(1);
    Object.assign(payload.boxscore.playerByGameStats.awayTeam.goalies[0]!, { decision: "W" });
    Object.assign(payload.boxscore.playerByGameStats.homeTeam.goalies[0]!, { decision: "L" });
    return response(url.endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const store = new MemoryArchiveStore(archive);
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});

  const refreshed = store.snapshot as PoolScoringArchive;
  assert.deepEqual(refreshed.scheduleDates["2026-09-29"], [GAME_ID]);
  assert.equal(refreshed.gameFacts[String(GAME_ID)]?.verified, true);
  assert.equal(refreshed.scheduleRevalidatedAt, NOW.toISOString());
});

test("mismatched fresh gamecenter teams unverify a prior nonfinal fact instead of promoting it", async () => {
  const liveFact = gameFact({ gameState: "LIVE", final: false, goals: 0 });
  const archive: PoolScoringArchive = {
    ...testArchive(liveFact),
    scheduledGames: {
      [String(GAME_ID)]: {
        id: GAME_ID,
        season: 20262027,
        gameType: 2,
        gameDate: GAME_DATE,
        gameState: "LIVE",
        awayAbbrev: "EDM",
        homeAbbrev: "VAN",
      },
    },
  };
  const store = new MemoryArchiveStore(archive);
  const fetchImpl: NhlJsonFetch = async input => {
    const payload = officialGamecenterPayload(2);
    payload.boxscore.awayTeam.abbrev = "BOS";
    return response(String(input).endsWith("/boxscore") ? payload.boxscore : payload.playByPlay);
  };
  const service = new PoolScoringService({ store, fetch: fetchImpl, now: () => NOW });

  await service.ingest(emptyFeeds, {});

  const persisted = store.snapshot as PoolScoringArchive;
  assert.equal(persisted.scheduledGames[String(GAME_ID)]?.gameState, "LIVE");
  assert.equal(persisted.gameFacts[String(GAME_ID)]?.verified, false);
  assert.ok(store.error);
});

test("live pool scoring continues after midnight until 2am without shifting official NHL dates", async () => {
  const liveFact = gameFact({ gameDate: "2026-10-01", gameState: "LIVE", final: false });
  const archive: PoolScoringArchive = {
    ...testArchive(liveFact),
    scheduleDates: {
      "2026-09-29": [],
      "2026-09-30": [],
      "2026-10-01": [GAME_ID],
      "2026-10-02": [],
    },
  };
  const store = new MemoryArchiveStore(archive);
  let clock = new Date("2026-10-02T05:59:59Z"); // 01:59:59 Toronto
  const service = new PoolScoringService({
    store,
    now: () => clock,
    loadRosters: async () => testRoster,
    loadRules: rulesLoader(),
  });
  const source = { status: "available", lastSuccessAt: clock.toISOString() };
  const before = await service.getSnapshot(source);
  assert.equal(before.status, "partial");
  assert.ok(before.reason?.startsWith(LIVE_PROVISIONAL_REASON));
  const ongoingDay = await service.getDailySnapshot("2026-10-01", source);
  assert.ok(ongoingDay.scoring.some(row => row.poolPoints > 0));
  assert.equal(ongoingDay.date, "2026-10-01");
  const nextDayBeforeBoundary = await service.getDailySnapshot("2026-10-02", source);
  assert.equal(nextDayBeforeBoundary.status, "pending");
  assert.deepEqual(nextDayBeforeBoundary.scoring, []);
  assert.match(nextDayBeforeBoundary.summary, /Future/);
  const league = await service.getLeaguePlayerScores([{ nhlPlayerId: 101, team: "EDM", position: "F" }]);
  assert.ok((league.rows[0]?.poolPoints ?? 0) > 0);

  // New verified facts still update the same day's scores during the extension.
  const updatedFact = gameFact({
    gameDate: "2026-10-01", gameState: "LIVE", final: false, goals: 2,
  });
  store.snapshot = {
    ...archive,
    gameFacts: { ...archive.gameFacts, [String(GAME_ID)]: updatedFact },
  };
  const updated = await service.getDailySnapshot("2026-10-01", source);
  assert.ok(updated.scoring[0]!.poolPoints > ongoingDay.scoring[0]!.poolPoints);
  assert.equal(updatedFact.gameDate, "2026-10-01");

  clock = new Date("2026-10-02T06:00:00Z"); // exactly 02:00 Toronto
  const newDay = await service.getDailySnapshot("2026-10-02", source);
  assert.doesNotMatch(newDay.summary, /Future/);
  assert.equal(newDay.date, "2026-10-02");
  assert.deepEqual(newDay.scoring, []);
  const priorDay = await service.getDailySnapshot("2026-10-01", source);
  assert.deepEqual(priorDay.scoring, updated.scoring);
});

test("daily analysis excludes unverified events and verified live events retain provisional standings", async () => {
  const liveFact = gameFact({ gameDate: "2026-10-01", gameState: "LIVE", final: false });
  const archive: PoolScoringArchive = {
    ...testArchive(liveFact),
    scheduleDates: {
      "2026-09-29": [],
      "2026-09-30": [],
      "2026-10-01": [GAME_ID],
    },
    scheduledGames: {
      [String(GAME_ID)]: {
        id: GAME_ID,
        season: 20262027,
        gameType: 2,
        gameDate: "2026-10-01",
        gameState: "LIVE",
        awayAbbrev: "EDM",
        homeAbbrev: "VAN",
      },
    },
  };
  const store = new MemoryArchiveStore(archive);
  const service = new PoolScoringService({
    store,
    now: () => NOW,
    loadRosters: async () => testRoster,
    loadRules: rulesLoader(),
  });
  const source = { status: "available", lastSuccessAt: NOW.toISOString() };

  store.snapshot = {
    ...archive,
    gameFacts: {
      [String(GAME_ID)]: gameFact({
        verified: false,
        gameDate: "2026-10-01",
        gameState: "FINAL",
        final: true,
      }),
    },
    scheduledGames: {
      [String(GAME_ID)]: {
        ...archive.scheduledGames[String(GAME_ID)]!,
        gameState: "FINAL",
      },
    },
  };
  const unverifiedDay = await service.getDailySnapshot("2026-10-01", source);
  assert.equal(unverifiedDay.status, "pending");
  assert.equal(unverifiedDay.scoring.length, 0);

  store.snapshot = archive;
  const liveDay = await service.getDailySnapshot("2026-10-01", source);
  assert.equal(liveDay.status, "pending");
  assert.equal(liveDay.scoring[0]?.poolPoints, 1);

  const scoring = await service.getSnapshot(source);
  assert.equal(scoring.status, "partial");
  assert.equal(scoring.reason, LIVE_PROVISIONAL_REASON);
  assert.equal(scoring.rows[0]?.poolPoints, 1);
  assert.equal(scoring.asOf, store.lastSuccessAt);

  const standings = scoredStandings(testRoster, scoring, {
    date: "2026-09-30",
    status: "final",
    summary: "Prior season day is verified.",
    scoring: [],
    owners: [{
      ownerId: "owner",
      ownerName: "Pool Owner",
      dailyPoints: 0,
      seasonPoints: 0,
      rank: 1,
      previousRank: null,
      narrative: "",
      scoring: [],
    }],
  }, liveDay, null);
  assert.equal(standings.status, "partial");
  assert.equal(standings.rows[0]?.rank, 1);
  assert.equal(standings.rows[0]?.seasonPoints, 1);
});

test("daily scoring rows sort globally by verified points with deterministic ties", async () => {
  const rosters: DraftRoster[] = [
    {
      id: "owner-z",
      name: "Zeta Owner",
      selections: [
        {
          round: 1,
          originalText: "Zulu Player",
          assetType: "skater",
          position: "F",
          reviewNote: null,
          confirmedName: "Zulu Player",
          confirmedTeam: "Edmonton Oilers",
          nhlPlayerId: 101,
        },
        {
          round: 2,
          originalText: "Shared Player",
          assetType: "skater",
          position: "F",
          reviewNote: null,
          confirmedName: "Shared Player",
          confirmedTeam: "Edmonton Oilers",
          nhlPlayerId: 102,
        },
      ],
    },
    {
      id: "owner-a",
      name: "Alpha Owner",
      selections: [
        {
          round: 1,
          originalText: "Alpha Player",
          assetType: "skater",
          position: "F",
          reviewNote: null,
          confirmedName: "Alpha Player",
          confirmedTeam: "Edmonton Oilers",
          nhlPlayerId: 201,
        },
        {
          round: 2,
          originalText: "Shared Player",
          assetType: "skater",
          position: "F",
          reviewNote: null,
          confirmedName: "Shared Player",
          confirmedTeam: "Edmonton Oilers",
          nhlPlayerId: 202,
        },
      ],
    },
  ];
  const playerFact = (playerId: number, goals: number, assists = 0) => ({
    playerId,
    position: "F" as const,
    teamAbbrev: "EDM",
    goals: Array.from({ length: goals }, () => ({
      powerPlay: false,
      shortHanded: false,
      overtime: false,
    })),
    assists,
    boxScoreGoals: goals,
    boxScoreAssists: assists,
    boxScorePowerPlayGoals: 0,
  });
  const fact: NormalizedNhlGame = {
    ...gameFact({ goals: 0 }),
    players: {
      "101": playerFact(101, 1),
      "102": playerFact(102, 1),
      "201": playerFact(201, 2, 1),
      "202": playerFact(202, 1),
    },
  };
  const service = new PoolScoringService({
    store: new MemoryArchiveStore(testArchive(fact)),
    now: () => NOW,
    loadRosters: async () => rosters,
    loadRules: rulesLoader(),
  });

  // /api/daily-scoring returns this method's scoring array; the report retains
  // per-owner rows separately in their existing owner-specific order.
  const report = await service.getDailySnapshot("2026-09-29", {
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  assert.equal(report.status, "final");
  assert.deepEqual(
    report.scoring.map(row => [row.playerName, row.ownerName, row.poolPoints]),
    [
      ["Alpha Player", "Alpha Owner", 3],
      ["Shared Player", "Alpha Owner", 1],
      ["Shared Player", "Zeta Owner", 1],
      ["Zulu Player", "Zeta Owner", 1],
    ],
  );
  assert.deepEqual(
    report.owners.find(owner => owner.ownerId === "owner-z")?.scoring.map(row => row.playerName),
    ["Shared Player", "Zulu Player"],
  );
  assert.deepEqual(
    report.owners.find(owner => owner.ownerId === "owner-a")?.scoring.map(row => row.playerName),
    ["Alpha Player", "Shared Player"],
  );
});

test("archive refresh errors keep factually complete prior-day totals and ranks stale but known", async () => {
  const store = new MemoryArchiveStore(testArchive());
  store.error = "Official NHL scoring archive could not be refreshed; last good data was retained.";
  const service = new PoolScoringService({
    store,
    now: () => NOW,
    loadRosters: async () => testRoster,
    loadRules: rulesLoader(),
  });
  const source = { status: "available", lastSuccessAt: NOW.toISOString() };

  const staleSeason = await service.getSnapshot(source);
  const priorDay = await service.getDailySnapshot("2026-09-30", source);
  const currentDay = await service.getDailySnapshot("2026-10-01", source);
  assert.equal(staleSeason.status, "stale");
  assert.equal(priorDay.status, "pending");
  assert.equal(priorDay.verifiedFinalCoverage, true);
  assert.equal(priorDay.owners[0]?.rank, 1);

  const standings = scoredStandings(testRoster, staleSeason, priorDay, currentDay, null);
  assert.equal(standings.status, "partial");
  assert.equal(standings.rows[0]?.rank, 1);
  assert.equal(standings.rows[0]?.seasonPoints, 1);
  assert.match(standings.reason ?? "", /last good data was retained/);
});

test("photo goalie rows credit individual G/A and only the official winner, never bench goalies or club assets", async () => {
  const service = new PoolScoringService({
    store: new MemoryArchiveStore(testArchive(goalieFact())),
    now: () => NOW,
    loadRosters: async () => photoGoalieRoster,
    loadRules: rulesLoader(),
  });
  const season = await service.getSnapshot({
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  const blackwood = season.rows.find(row => row.nhlPlayerId === 8478406)!;
  const wedgewood = season.rows.find(row => row.nhlPlayerId === 8475809)!;
  const pending = season.rows.find(row => row.round === 18)!;
  assert.deepEqual(
    [blackwood.ownerId, blackwood.round, blackwood.nhlPlayerId],
    ["joe", 7, 8478406],
  );
  assert.equal(blackwood.assetType, "goalie");
  assert.deepEqual(
    [blackwood.goals, blackwood.assists, blackwood.wins, blackwood.shutouts, blackwood.poolPoints],
    [1, 1, 1, 0, 15],
  );
  assert.deepEqual(
    [wedgewood.goals, wedgewood.assists, wedgewood.gamesPlayed, wedgewood.wins, wedgewood.poolPoints],
    [0, 0, 0, 0, 0],
  );
  assert.deepEqual(
    [pending.assetType, pending.nhlPlayerId, pending.goals, pending.assists, pending.poolPoints],
    ["goalie", null, null, null, null],
  );
  assert.equal(season.rows.some(row => row.assetType === "goalieTeam"), false);
  assert.equal(season.status, "partial");
  assert.match(season.reason ?? "", /no photo-confirmed individual goalie names/);

  const daily = await service.getDailySnapshot("2026-09-29", {
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  assert.deepEqual(
    daily.scoring.map(row => [row.playerId, row.playerName, row.goals, row.assists, row.poolPoints]),
    [["8478406", "Mackenzie Blackwood", 1, 1, 15]],
  );
  assert.deepEqual(
    daily.scoring[0]?.scoringBreakdown.map(row => [row.label, row.points]),
    [["Goalie goal", 10], ["Goalie assist", 3], ["Goalie win", 2]],
  );
  assert.equal(daily.scoring.some(row => row.playerId.startsWith("goalie-team:")), false);
  assert.equal(daily.status, "pending");
  const standings = scoredStandings(
    photoGoalieRoster,
    season,
    {
      date: "2026-09-28",
      status: "final",
      verifiedFinalCoverage: true,
      summary: "Prior date is verified.",
      scoring: [],
      owners: [],
    },
    daily,
    null,
  );
  assert.equal(standings.status, "partial");
  assert.equal(standings.rows[0]?.rank, null);
  assert.equal(standings.rows[0]?.seasonPoints, null);
});

for (const [winnerId, scenario] of [
  [8475809, "backup earns the win after the starter is pulled"],
  [8478406, "starter retains the official win despite the backup appearing"],
] as const) {
  test(`${scenario}: only the official winner receives two points`, async () => {
    const fact = goalieFact({ blackwoodGoals: 0, blackwoodAssists: 0 });
    fact.awayScore = 3;
    fact.homeScore = 2;
    for (const playerId of [8478406, 8475809]) {
      const goalie = fact.players[String(playerId)]!;
      goalie.goalieAppeared = true;
      goalie.goalieDecision = playerId === winnerId ? "W" : null;
      goalie.goalieShutoutWin = playerId === winnerId ? false : null;
    }
    const service = new PoolScoringService({
      store: new MemoryArchiveStore(testArchive(fact)),
      now: () => NOW,
      loadRosters: async () => photoGoalieRoster,
      loadRules: rulesLoader(),
    });
    const source = { status: "available", lastSuccessAt: NOW.toISOString() };
    const season = await service.getSnapshot(source);
    const winner = season.rows.find(row => row.nhlPlayerId === winnerId)!;
    const nonWinner = season.rows.find(row =>
      row.nhlPlayerId === (winnerId === 8475809 ? 8478406 : 8475809))!;
    assert.deepEqual([winner.gamesPlayed, winner.wins, winner.poolPoints], [1, 1, 2]);
    assert.deepEqual([nonWinner.gamesPlayed, nonWinner.wins, nonWinner.poolPoints], [1, 0, 0]);
    assert.equal(season.rows.reduce((sum, row) => sum + (row.poolPoints ?? 0), 0), 2);
    const daily = await service.getDailySnapshot(GAME_DATE, source);
    assert.equal(daily.scoring.length, 1);
    assert.equal(daily.scoring[0]?.playerId, String(winnerId));
    assert.equal(daily.scoring[0]?.poolPoints, 2);
    assert.deepEqual(daily.scoring[0]?.scoringBreakdown.map(item =>
      [item.label, item.count, item.points]), [["Goalie win", 1, 2]]);
    assert.doesNotMatch(daily.summary, /individual goalie decision or shutout facts are pending/);
  });
}

test("individual shutout win is five total points and shared team shutout is not credited", async () => {
  const source = { status: "available", lastSuccessAt: NOW.toISOString() };
  const shutoutService = new PoolScoringService({
    store: new MemoryArchiveStore(testArchive(goalieFact({
      blackwoodShutout: true,
      blackwoodAssists: 0,
    }))),
    now: () => NOW,
    loadRosters: async () => photoGoalieRoster,
    loadRules: rulesLoader(),
  });
  const shutoutRows = (await shutoutService.getSnapshot(source)).rows;
  const shutoutStarter = shutoutRows.find(row => row.nhlPlayerId === 8478406)!;
  assert.equal(shutoutStarter.shutouts, 1);
  assert.equal(shutoutStarter.poolPoints, 15);
  const shutoutDaily = await shutoutService.getDailySnapshot(GAME_DATE, source);
  assert.deepEqual(
    shutoutDaily.scoring[0]?.scoringBreakdown.map(row => [row.label, row.points]),
    [["Goalie goal", 10], ["Goalie shutout win", 5]],
  );

  const sharedService = new PoolScoringService({
    store: new MemoryArchiveStore(testArchive(goalieFact({
      sharedShutout: true,
      blackwoodAssists: 0,
    }))),
    now: () => NOW,
    loadRosters: async () => photoGoalieRoster,
    loadRules: rulesLoader(),
  });
  const sharedRows = (await sharedService.getSnapshot(source)).rows;
  const winningGoalie = sharedRows.find(row => row.nhlPlayerId === 8478406)!;
  const otherAppearingGoalie = sharedRows.find(row => row.nhlPlayerId === 8475809)!;
  assert.equal(winningGoalie.wins, 1);
  assert.equal(winningGoalie.shutouts, 0);
  assert.equal(winningGoalie.poolPoints, 12);
  assert.equal(otherAppearingGoalie.wins, 0);
  assert.equal(otherAppearingGoalie.shutouts, 0);
  assert.equal(otherAppearingGoalie.poolPoints, 0);
});

test("goalie decisions pending do not erase verified goalie G/A facts", async () => {
  const service = new PoolScoringService({
    store: new MemoryArchiveStore(testArchive(goalieFact({
      blackwoodAssists: 0,
      goalieResultsComplete: false,
    }))),
    now: () => NOW,
    loadRosters: async () => photoGoalieRoster,
    loadRules: rulesLoader(),
  });
  const snapshot = await service.getSnapshot({
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  const blackwood = snapshot.rows.find(row => row.nhlPlayerId === 8478406)!;
  assert.deepEqual([blackwood.goals, blackwood.assists], [1, 0]);
  assert.deepEqual([blackwood.wins, blackwood.shutouts, blackwood.poolPoints], [null, null, 10]);
  assert.equal(snapshot.rows.find(row => row.nhlPlayerId === 8475809)?.poolPoints, null);
  assert.equal(snapshot.status, "partial");
  const daily = await service.getDailySnapshot(GAME_DATE, {
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  assert.equal(daily.status, "pending");
  assert.equal(daily.verifiedFinalCoverage, false);
  assert.equal(daily.scoring.find(row => row.playerId === "8478406")?.poolPoints, 10);
  assert.match(daily.summary, /individual goalie decision or shutout facts are pending/);
  const league = await service.getLeaguePlayerScores([
    { nhlPlayerId: 8478406, team: "COL", position: "G" },
  ]);
  assert.equal(league.status, "partial");
  assert.equal(league.rows[0]?.poolPoints, 10);
  assert.equal(league.rows[0]?.wins, null);
  assert.equal(league.rows[0]?.shutouts, null);
  assert.equal(league.rows[0]?.scoringStatus, "partial");
  assert.match(league.rows[0]?.reason ?? "", /known subtotal/);
});

test("a verified goalie goal and individual win total twelve despite an unrelated unverified game", async () => {
  const verified = goalieFact({ blackwoodAssists: 0 });
  const unrelated = {
    ...gameFact({ gameDate: GAME_DATE, verified: false }),
    gameId: GAME_ID + 1,
    homeTeamAbbrev: "TOR",
    awayTeamAbbrev: "MTL",
    players: {},
    reason: "Unrelated fixture game is unverified.",
  };
  const archive = {
    ...testArchive(verified),
    gameFacts: {
      [String(GAME_ID)]: verified,
      [String(GAME_ID + 1)]: unrelated,
    },
  };
  const service = new PoolScoringService({
    store: new MemoryArchiveStore(archive),
    now: () => NOW,
    loadRosters: async () => photoGoalieRoster,
    loadRules: rulesLoader(),
  });
  const source = { status: "available", lastSuccessAt: NOW.toISOString() };

  const season = await service.getSnapshot(source);
  const blackwood = season.rows.find(row => row.nhlPlayerId === 8478406)!;
  assert.equal(blackwood.poolPoints, 12);
  assert.equal(blackwood.wins, 1);
  const daily = await service.getDailySnapshot(GAME_DATE, source);
  assert.equal(daily.status, "pending");
  assert.equal(daily.scoring.find(row => row.playerId === "8478406")?.poolPoints, 12);
});

test("pending photo goalie and NHL attribution warnings are aggregated", async () => {
  const base = goalieFact({ goalieResultsComplete: false });
  const games = [GAME_ID, GAME_ID + 1, GAME_ID + 2].map(gameId => ({
    ...base,
    gameId,
  }));
  const archive = {
    ...testArchive(base),
    gameFacts: Object.fromEntries(games.map(game => [String(game.gameId), game])),
  };
  const service = new PoolScoringService({
    store: new MemoryArchiveStore(archive),
    now: () => NOW,
    loadRosters: async () => everyGoalieSlotRoster,
    loadRules: rulesLoader(),
  });
  const snapshot = await service.getSnapshot({
    status: "available",
    lastSuccessAt: NOW.toISOString(),
  });
  const reasons = snapshot.reason ?? "";
  assert.match(reasons, /16 goalie slots have no photo-confirmed individual goalie names and are not scored/);
  assert.equal((reasons.match(/no photo-confirmed individual goalie names/g) ?? []).length, 1);
  assert.match(reasons, /3 games await official individual goalie appearance\/decision\/shutout verification \(IDs: 2026020001, 2026020002, 2026020003\)/);
  assert.equal((reasons.match(/official individual goalie appearance\/decision\/shutout verification/g) ?? []).length, 1);
});