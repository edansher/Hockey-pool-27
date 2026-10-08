import type { ScoringGoal } from "./pool-scoring";

type UnknownRecord = Record<string, unknown>;

export interface NormalizedPlayerGame {
  playerId: number;
  position: "F" | "D" | "G";
  teamAbbrev: string;
  goals: ScoringGoal[];
  assists: number;
  boxScoreGoals: number | null;
  boxScoreAssists: number | null;
  boxScorePowerPlayGoals: number | null;
  /** Official gamecenter goalie decision; absent on legacy archived facts. */
  goalieDecision?: "W" | "L" | "O" | null;
  /** Whether official gamecenter shows this goalie appeared in the game. */
  goalieAppeared?: boolean | null;
  /** Individual goalie shutout, never a shared team shutout. */
  goalieShutoutWin?: boolean | null;
}

export interface NormalizedNhlGame {
  gameId: number;
  season: number;
  gameType: number;
  gameDate: string;
  gameState: string;
  homeTeamAbbrev: string;
  awayTeamAbbrev: string;
  homeTeamId: number;
  awayTeamId: number;
  homeScore: number;
  awayScore: number;
  players: Record<string, NormalizedPlayerGame>;
  verified: boolean;
  reason: string | null;
  final: boolean;
  lastPeriodType: string | null;
  /** Legacy archives omit this and are eligible for gamecenter re-normalization. */
  goalieResultsComplete?: boolean;
}

export function replacePerGameFact<T extends { gameId: number }>(
  facts: Record<string, T>,
  correctedFact: T,
): void {
  facts[String(correctedFact.gameId)] = correctedFact;
}

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

function nonnegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function nullableCount(value: unknown): number | null {
  return nonnegativeInteger(value) ? value : null;
}

function stringField(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function teamRecord(value: unknown, name: string) {
  if (!isRecord(value) || !positiveInteger(value.id) || !stringField(value.abbrev)) {
    throw new Error(`NHL ${name} team metadata is invalid.`);
  }
  if (!nonnegativeInteger(value.score)) {
    throw new Error(`NHL ${name} team score is unavailable.`);
  }
  return {
    id: value.id,
    abbrev: value.abbrev,
    score: value.score,
  };
}

function strengthForGoal(
  situationCode: unknown,
  teamId: number,
  awayTeamId: number,
  homeTeamId: number,
): { powerPlay: boolean; shortHanded: boolean; ambiguous: boolean } {
  if (typeof situationCode !== "string" || !/^[01][0-6][0-6][01]$/.test(situationCode)) {
    throw new Error("NHL play-by-play goal has an invalid situation code.");
  }
  const awayGoalie = Number(situationCode[0]);
  const awaySkaters = Number(situationCode[1]);
  const homeSkaters = Number(situationCode[2]);
  const homeGoalie = Number(situationCode[3]);
  const isAwayTeam = teamId === awayTeamId;
  if (!isAwayTeam && teamId !== homeTeamId) {
    throw new Error("NHL play-by-play goal owner is not a game participant.");
  }
  // Six skaters with no goalie is an extra attacker, not a power play. Lower
  // counts may or may not include a replacement skater, so retain both possible
  // effective counts and classify only when they agree on the goal strength.
  const effectiveAwaySkaters =
    awayGoalie === 0 && awaySkaters === 6 ? awaySkaters - 1 : awaySkaters;
  const effectiveHomeSkaters =
    homeGoalie === 0 && homeSkaters === 6 ? homeSkaters - 1 : homeSkaters;
  const awayMinimum = awayGoalie === 0 && awaySkaters < 6
    ? Math.max(0, awaySkaters - 1)
    : effectiveAwaySkaters;
  const homeMinimum = homeGoalie === 0 && homeSkaters < 6
    ? Math.max(0, homeSkaters - 1)
    : effectiveHomeSkaters;
  const scoringMinimum = isAwayTeam ? awayMinimum : homeMinimum;
  const scoringMaximum = isAwayTeam ? effectiveAwaySkaters : effectiveHomeSkaters;
  const defendingMinimum = isAwayTeam ? homeMinimum : awayMinimum;
  const defendingMaximum = isAwayTeam ? effectiveHomeSkaters : effectiveAwaySkaters;
  const minimumStrengthDifference = scoringMinimum - defendingMaximum;
  const maximumStrengthDifference = scoringMaximum - defendingMinimum;
  if (minimumStrengthDifference <= 0 && maximumStrengthDifference >= 0 &&
      (minimumStrengthDifference !== 0 || maximumStrengthDifference !== 0)) {
    return { powerPlay: false, shortHanded: false, ambiguous: true };
  }
  return {
    powerPlay: minimumStrengthDifference > 0,
    shortHanded: maximumStrengthDifference < 0,
    ambiguous: false,
  };
}

function goalieDecision(value: unknown): "W" | "L" | "O" | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return normalized === "W" || normalized === "L" || normalized === "O"
    ? normalized
    : null;
}

function timeOnIceSeconds(value: unknown): number | null {
  if (typeof value !== "string" || !/^\d{1,3}:\d{2}$/.test(value)) return null;
  const [minutes, seconds] = value.split(":").map(Number);
  if (seconds! > 59) return null;
  return minutes! * 60 + seconds!;
}

function playerStats(value: unknown, position: "F" | "D" | "G", teamAbbrev: string) {
  if (!Array.isArray(value)) throw new Error(`NHL box score ${position} list is invalid.`);
  return value.map(entry => {
    if (!isRecord(entry) || !positiveInteger(entry.playerId)) {
      throw new Error(`NHL box score contains an invalid player ID.`);
    }
    return {
      playerId: entry.playerId,
      position,
      teamAbbrev,
      goals: nullableCount(entry.goals),
      assists: nullableCount(entry.assists),
      powerPlayGoals: nullableCount(entry.powerPlayGoals),
      shortHandedGoals: nullableCount(entry.shorthandedGoals ?? entry.shortHandedGoals),
      ...(position === "G" ? {
        goalieDecision: goalieDecision(entry.decision),
        goalieAppeared: timeOnIceSeconds(entry.toi ?? entry.timeOnIce) === null
          ? goalieDecision(entry.decision) === null ? null : true
          : timeOnIceSeconds(entry.toi ?? entry.timeOnIce)! > 0,
      } : {}),
    };
  });
}

function getPeriodType(play: UnknownRecord): string | null {
  const descriptor = play.periodDescriptor;
  return isRecord(descriptor) && stringField(descriptor.periodType)
    ? descriptor.periodType.toUpperCase()
    : null;
}

function isOvertime(periodType: string): boolean {
  return periodType === "OT" || /^OT\d+$/.test(periodType);
}

/**
 * Converts official NHL gamecenter boxscore and play-by-play payloads into
 * idempotent per-game event facts. Shootout decisions never become skater
 * goals or overtime goals.
 */
export function normalizeNhlGame(
  expected: {
    id: number;
    season: number;
    gameType: number;
    gameDate: string;
    gameState: string;
    awayAbbrev: string;
    homeAbbrev: string;
  },
  boxscoreValue: unknown,
  playByPlayValue: unknown,
): NormalizedNhlGame {
  if (!isRecord(boxscoreValue) || !isRecord(playByPlayValue)) {
    throw new Error("NHL gamecenter returned an invalid payload.");
  }
  for (const payload of [boxscoreValue, playByPlayValue]) {
    if (
      payload.id !== expected.id ||
      payload.season !== expected.season ||
      payload.gameType !== expected.gameType ||
      payload.gameDate !== expected.gameDate
    ) {
      throw new Error("NHL gamecenter payload does not match its official game.");
    }
  }

  const away = teamRecord(boxscoreValue.awayTeam, "away");
  const home = teamRecord(boxscoreValue.homeTeam, "home");
  if (away.abbrev !== expected.awayAbbrev || home.abbrev !== expected.homeAbbrev) {
    throw new Error("NHL gamecenter teams do not match the official score feed.");
  }
  const statsByTeam = boxscoreValue.playerByGameStats;
  if (!isRecord(statsByTeam) || !isRecord(statsByTeam.awayTeam) || !isRecord(statsByTeam.homeTeam)) {
    throw new Error("NHL box score player statistics are unavailable.");
  }

  const boxPlayers = [
    ...playerStats(statsByTeam.awayTeam.forwards, "F", away.abbrev),
    ...playerStats(statsByTeam.awayTeam.defense, "D", away.abbrev),
    ...playerStats(statsByTeam.awayTeam.goalies, "G", away.abbrev),
    ...playerStats(statsByTeam.homeTeam.forwards, "F", home.abbrev),
    ...playerStats(statsByTeam.homeTeam.defense, "D", home.abbrev),
    ...playerStats(statsByTeam.homeTeam.goalies, "G", home.abbrev),
  ];
  const players: Record<string, NormalizedPlayerGame> = {};
  const boxById = new Map<number, (typeof boxPlayers)[number]>();
  for (const player of boxPlayers) {
    if (boxById.has(player.playerId)) {
      throw new Error("NHL box score repeats a player ID.");
    }
    boxById.set(player.playerId, player);
    players[String(player.playerId)] = {
      playerId: player.playerId,
      position: player.position,
      teamAbbrev: player.teamAbbrev,
      goals: [],
      assists: 0,
      boxScoreGoals: player.goals,
      boxScoreAssists: player.assists,
      boxScorePowerPlayGoals: player.powerPlayGoals,
      ...(player.position === "G" ? {
        goalieDecision: player.goalieDecision,
        goalieAppeared: player.goalieAppeared,
        goalieShutoutWin: null,
      } : {}),
    };
  }

  if (!Array.isArray(playByPlayValue.plays)) {
    throw new Error("NHL play-by-play event list is unavailable.");
  }
  const eventGoalsByTeam = new Map<number, number>([[away.id, 0], [home.id, 0]]);
  const eventGoalsByPlayer = new Map<number, number>();
  const eventAssistsByPlayer = new Map<number, number>();
  const reasons: string[] = [];
  let shootoutWinnerId: number | null = null;
  const lastPeriodType = isRecord(boxscoreValue.gameOutcome) &&
      stringField(boxscoreValue.gameOutcome.lastPeriodType)
    ? boxscoreValue.gameOutcome.lastPeriodType.toUpperCase()
    : null;
  if (lastPeriodType === "SO" || lastPeriodType === "SHOOTOUT") {
    shootoutWinnerId = away.score > home.score ? away.id : home.id;
  }

  const goals: Array<{
    playerId: number;
    teamId: number;
    overtime: boolean;
    strength: ReturnType<typeof strengthForGoal>;
  }> = [];
  for (const playValue of playByPlayValue.plays) {
    if (!isRecord(playValue) || playValue.typeDescKey !== "goal") continue;
    const periodType = getPeriodType(playValue);
    if (!periodType) {
      reasons.push("A goal event has no valid period descriptor.");
      continue;
    }
    if (periodType === "SO" || periodType === "SHOOTOUT") continue;
    const details = playValue.details;
    if (!isRecord(details) || !positiveInteger(details.scoringPlayerId) ||
        !positiveInteger(details.eventOwnerTeamId)) {
      reasons.push("A goal event has invalid scoring-player or team identifiers.");
      continue;
    }
    let strength: ReturnType<typeof strengthForGoal>;
    try {
      strength = strengthForGoal(
        playValue.situationCode,
        details.eventOwnerTeamId,
        away.id,
        home.id,
      );
    } catch (error) {
      reasons.push(error instanceof Error ? error.message : "A goal event has invalid strength.");
      continue;
    }
    const player = players[String(details.scoringPlayerId)];
    if (!player) {
      reasons.push("A goal event player is missing from the official box score.");
      continue;
    }
    if (player.teamAbbrev !== (details.eventOwnerTeamId === away.id ? away.abbrev : home.abbrev)) {
      reasons.push("NHL play-by-play scorer team does not match the official box score.");
      continue;
    }
    goals.push({
      playerId: details.scoringPlayerId,
      teamId: details.eventOwnerTeamId,
      overtime: isOvertime(periodType),
      strength,
    });
    eventGoalsByTeam.set(
      details.eventOwnerTeamId,
      (eventGoalsByTeam.get(details.eventOwnerTeamId) ?? 0) + 1,
    );
    eventGoalsByPlayer.set(
      details.scoringPlayerId,
      (eventGoalsByPlayer.get(details.scoringPlayerId) ?? 0) + 1,
    );

    const assistIds: number[] = [];
    for (const key of ["assist1PlayerId", "assist2PlayerId"] as const) {
      const assistId = details[key];
      if (assistId === undefined || assistId === null) continue;
      if (!positiveInteger(assistId) || assistId === details.scoringPlayerId ||
          assistIds.includes(assistId) || !players[String(assistId)]) {
        reasons.push("A goal event has invalid or duplicate assist-player identifiers.");
        continue;
      }
      assistIds.push(assistId);
      eventAssistsByPlayer.set(assistId, (eventAssistsByPlayer.get(assistId) ?? 0) + 1);
    }
  }

  // Aggregate box-score strength totals can resolve ambiguous goals only when
  // they identify every ambiguous goal's strength. Never assign flags by
  // play-by-play order: an OT and a regulation goal may otherwise be swapped.
  const goalsByPlayer = new Map<number, typeof goals>();
  for (const goal of goals) {
    const group = goalsByPlayer.get(goal.playerId) ?? [];
    group.push(goal);
    goalsByPlayer.set(goal.playerId, group);
  }
  const unresolvedStrengthPlayers = new Set<number>();
  for (const [playerId, playerGoals] of goalsByPlayer) {
    const box = boxById.get(playerId)!;
    const officialPpgCount = box.powerPlayGoals;
    const officialShgCount = box.shortHandedGoals;
    const clearPowerPlayCount = playerGoals.filter(goal =>
      !goal.strength.ambiguous && goal.strength.powerPlay,
    ).length;
    const clearShortHandedCount = playerGoals.filter(goal =>
      !goal.strength.ambiguous && goal.strength.shortHanded,
    ).length;
    const ambiguousGoals = playerGoals.filter(goal => goal.strength.ambiguous);
    const residualPpgCount = officialPpgCount === null
      ? null
      : officialPpgCount - clearPowerPlayCount;
    const residualShgCount = officialShgCount === null
      ? null
      : officialShgCount - clearShortHandedCount;
    let ambiguousResolution: "powerPlay" | "shortHanded" | "even" | null = null;

    if (ambiguousGoals.length > 0) {
      if (
        (residualPpgCount !== null && residualPpgCount < 0) ||
        (residualShgCount !== null && residualShgCount < 0) ||
        (residualPpgCount !== null && residualPpgCount > ambiguousGoals.length) ||
        (residualShgCount !== null && residualShgCount > ambiguousGoals.length) ||
        (residualPpgCount !== null && residualShgCount !== null &&
          residualPpgCount + residualShgCount > ambiguousGoals.length)
      ) {
        unresolvedStrengthPlayers.add(playerId);
        reasons.push(`NHL box-score strength totals disagree for player ${playerId}.`);
      } else if (
        residualPpgCount === ambiguousGoals.length &&
        (residualShgCount === null || residualShgCount === 0)
      ) {
        ambiguousResolution = "powerPlay";
      } else if (
        residualShgCount === ambiguousGoals.length &&
        (residualPpgCount === null || residualPpgCount === 0)
      ) {
        ambiguousResolution = "shortHanded";
      } else if (residualPpgCount === 0 && residualShgCount === 0) {
        ambiguousResolution = "even";
      } else {
        unresolvedStrengthPlayers.add(playerId);
        reasons.push(
          `Empty-net strength for player ${playerId} cannot be uniquely corroborated by official box-score totals.`,
        );
      }
    }

    for (const goal of playerGoals) {
      const player = players[String(goal.playerId)]!;
      let powerPlay = goal.strength.powerPlay;
      let shortHanded = goal.strength.shortHanded;
      if (goal.strength.ambiguous) {
        if (ambiguousResolution === "powerPlay") {
          powerPlay = true;
        } else if (ambiguousResolution === "shortHanded") {
          shortHanded = true;
        }
      }
      player.goals.push({
        powerPlay,
        shortHanded,
        overtime: goal.overtime,
      });
    }
  }

  for (const [playerId, player] of Object.entries(players)) {
    const id = Number(playerId);
    player.assists = eventAssistsByPlayer.get(id) ?? 0;
    const box = boxById.get(id)!;
    if (
      (box.goals !== null && box.goals !== (eventGoalsByPlayer.get(id) ?? 0)) ||
      (box.assists !== null && box.assists !== (eventAssistsByPlayer.get(id) ?? 0))
    ) {
      reasons.push(`NHL box score and play-by-play disagree for player ${id}.`);
    }

    const strengthResolved = !unresolvedStrengthPlayers.has(id);
    const powerPlayGoals = player.goals.filter(goal => goal.powerPlay).length;
    const shortHandedGoals = player.goals.filter(goal => goal.shortHanded).length;
    if (
      strengthResolved &&
      ((box.powerPlayGoals !== null && box.powerPlayGoals !== powerPlayGoals) ||
        (box.shortHandedGoals !== null && box.shortHandedGoals !== shortHandedGoals))
    ) {
      reasons.push(`NHL box score and play-by-play goal strength disagree for player ${id}.`);
    }
  }

  const final = expected.gameState === "FINAL" || expected.gameState === "OFF";
  const winningTeamId = away.score > home.score
    ? away.id
    : home.score > away.score
      ? home.id
      : null;
  const goalies = Object.values(players).filter(player => player.position === "G");
  const goaliesByTeam = new Map<string, NormalizedPlayerGame[]>();
  for (const goalie of goalies) {
    const group = goaliesByTeam.get(goalie.teamAbbrev) ?? [];
    group.push(goalie);
    goaliesByTeam.set(goalie.teamAbbrev, group);
  }
  let goalieResultsComplete = !final;
  if (final && winningTeamId !== null) {
    const winningTeam = winningTeamId === away.id ? away.abbrev : home.abbrev;
    const winningGoalies = goaliesByTeam.get(winningTeam) ?? [];
    goalieResultsComplete = winningGoalies.length > 0 &&
      (goaliesByTeam.get(away.abbrev)?.length ?? 0) > 0 &&
      (goaliesByTeam.get(home.abbrev)?.length ?? 0) > 0 &&
      goalies.every(goalie => goalie.goalieAppeared !== null) &&
      winningGoalies.filter(goalie =>
        goalie.goalieDecision === "W" && goalie.goalieAppeared === true,
      ).length === 1;
    const losingTeamId = winningTeamId === away.id ? home.id : away.id;
    const losingGoals = eventGoalsByTeam.get(losingTeamId) ?? 0;
    const winningTeamGoalies = goaliesByTeam.get(winningTeam) ?? [];
    const appearedWinningGoalies = winningTeamGoalies.filter(goalie => goalie.goalieAppeared);
    for (const goalie of goalies) {
      if (goalie.goalieDecision !== "W") {
        goalie.goalieShutoutWin = goalie.goalieDecision === null
          ? null
          : false;
      } else if (
        goalie.teamAbbrev === winningTeam &&
        goalie.goalieAppeared === true &&
        goalie.goalieDecision === "W" &&
        goalie.goalieAppeared !== null &&
        goalies.every(candidate => candidate.goalieAppeared !== null)
      ) {
        goalie.goalieShutoutWin =
          appearedWinningGoalies.length === 1 && losingGoals === 0;
      } else {
        goalie.goalieShutoutWin = null;
      }
    }
  } else {
    for (const goalie of goalies) goalie.goalieShutoutWin = null;
  }

  const expectedAwayEventGoals = away.score - (shootoutWinnerId === away.id ? 1 : 0);
  const expectedHomeEventGoals = home.score - (shootoutWinnerId === home.id ? 1 : 0);
  if (
    expectedAwayEventGoals !== eventGoalsByTeam.get(away.id) ||
    expectedHomeEventGoals !== eventGoalsByTeam.get(home.id)
  ) {
    reasons.push("NHL team goal totals and non-shootout play-by-play goals disagree.");
  }

  return {
    gameId: expected.id,
    season: expected.season,
    gameType: expected.gameType,
    gameDate: expected.gameDate,
    gameState: expected.gameState,
    homeTeamAbbrev: home.abbrev,
    awayTeamAbbrev: away.abbrev,
    homeTeamId: home.id,
    awayTeamId: away.id,
    homeScore: home.score,
    awayScore: away.score,
    players,
    verified: reasons.length === 0,
    reason: reasons.length ? [...new Set(reasons)].join(" ") : null,
    final,
    lastPeriodType,
    goalieResultsComplete,
  };
}

export function goalieTeamResult(
  game: NormalizedNhlGame,
  teamAbbrev: string,
): { win: boolean; shutoutWin: boolean } {
  if (!game.final) return { win: false, shutoutWin: false };
  const homeWon = game.homeScore > game.awayScore;
  const awayWon = game.awayScore > game.homeScore;
  const winningTeam = homeWon
    ? game.homeTeamAbbrev
    : awayWon
      ? game.awayTeamAbbrev
      : null;
  if (teamAbbrev !== winningTeam) return { win: false, shutoutWin: false };
  const losingTeamScore = homeWon ? game.awayScore : game.homeScore;
  return { win: true, shutoutWin: losingTeamScore === 0 };
}