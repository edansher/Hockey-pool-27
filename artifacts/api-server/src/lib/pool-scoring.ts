export type ScoringValues = Readonly<{
  goal: number;
  assist: number;
  powerPlayGoal: number;
  shortHandedGoal: number;
  overtimeGoal: number;
  forwardHatTrick: number;
  defensemanHatTrick: number;
  goalieTeamWin: number;
  goalieTeamShutoutWin: number;
  goalieAssist: number;
  goalieGoal: number;
}>;

export type ScoringRules = ScoringValues & Readonly<{
  powerPlayBonusOnOvertime: boolean;
  powerPlayBonusOnHatTrick: boolean;
}>;

export const SCORING_VALUES: ScoringValues = {
  goal: 1,
  assist: 1,
  powerPlayGoal: 2,
  shortHandedGoal: 5,
  overtimeGoal: 3,
  forwardHatTrick: 6,
  defensemanHatTrick: 10,
  goalieTeamWin: 2,
  goalieTeamShutoutWin: 5,
  goalieAssist: 3,
  goalieGoal: 10,
};

export const DEFAULT_SCORING_RULES: ScoringRules = {
  ...SCORING_VALUES,
  powerPlayBonusOnOvertime: true,
  powerPlayBonusOnHatTrick: true,
};

function validateCount(name: string, value: number): void {
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a finite nonnegative integer`);
  }
}

export function scoreOvertimeGoal(
  powerPlay: boolean,
  rules: ScoringValues = SCORING_VALUES,
  powerPlayBonusOnOvertime = true,
): number {
  const powerPlayBonus =
    powerPlay && powerPlayBonusOnOvertime
      ? rules.powerPlayGoal - rules.goal
      : 0;
  return rules.overtimeGoal + powerPlayBonus;
}

export function scoreHatTrick(
  position: "F" | "D",
  powerPlayGoals: number,
  assists = 0,
  rules: ScoringValues = SCORING_VALUES,
  powerPlayBonusOnHatTrick = true,
): number {
  validateCount("powerPlayGoals", powerPlayGoals);
  if (powerPlayGoals > 3) {
    throw new RangeError("powerPlayGoals must be between 0 and 3");
  }
  validateCount("assists", assists);

  const hatTrickValue =
    position === "F"
      ? rules.forwardHatTrick
      : position === "D"
        ? rules.defensemanHatTrick
        : undefined;
  if (hatTrickValue === undefined) {
    throw new RangeError('position must be "F" or "D"');
  }

  const powerPlayBonus = powerPlayBonusOnHatTrick
    ? rules.powerPlayGoal - rules.goal
    : 0;
  return hatTrickValue + powerPlayGoals * powerPlayBonus + assists * rules.assist;
}

export type ScoringGoal = Readonly<{
  powerPlay: boolean;
  shortHanded: boolean;
  overtime: boolean;
}>;

export type ScoredSkaterGame = Readonly<{
  poolPoints: number | null;
  hatTrick: boolean;
  pendingReason: string | null;
}>;

/**
 * Scores goal events as replacements, not additive ordinary-goal bonuses.
 * The pool has not confirmed stacking for the listed overlap cases, so this
 * deliberately withholds the affected game's points rather than guessing.
 */
export function scoreSkaterGame(
  position: "F" | "D",
  goals: readonly ScoringGoal[],
  assists: number,
  rules: ScoringRules = DEFAULT_SCORING_RULES,
): ScoredSkaterGame {
  validateCount("assists", assists);
  const pendingReasons: string[] = [];
  if (goals.length > 3) {
    pendingReasons.push(
      "Scoring policy for four or more goals by one player in a game is unconfirmed.",
    );
  }
  for (const goal of goals) {
    if (goal.shortHanded && goal.overtime) {
      pendingReasons.push("A short-handed overtime goal has unconfirmed scoring overlap.");
    }
    if (goal.overtime && goals.length >= 3) {
      pendingReasons.push("An overtime goal within a hat trick has unconfirmed scoring overlap.");
    }
    if (goal.shortHanded && goals.length >= 3) {
      pendingReasons.push("A short-handed goal within a hat trick has unconfirmed scoring overlap.");
    }
  }
  if (pendingReasons.length > 0) {
    return {
      poolPoints: null,
      hatTrick: goals.length >= 3,
      pendingReason: [...new Set(pendingReasons)].join(" "),
    };
  }

  const hatTrick = goals.length === 3;
  if (hatTrick) {
    const powerPlayGoals = goals.filter(goal => goal.powerPlay).length;
    return {
      poolPoints: scoreHatTrick(
        position,
        powerPlayGoals,
        assists,
        rules,
        rules.powerPlayBonusOnHatTrick,
      ),
      hatTrick: true,
      pendingReason: null,
    };
  }

  const goalPoints = goals.reduce((total, goal) => {
    if (goal.shortHanded) return total + rules.shortHandedGoal;
    if (goal.overtime) {
      return total + scoreOvertimeGoal(
        goal.powerPlay,
        rules,
        rules.powerPlayBonusOnOvertime,
      );
    }
    if (goal.powerPlay) return total + rules.powerPlayGoal;
    return total + rules.goal;
  }, 0);

  return {
    poolPoints: goalPoints + assists * rules.assist,
    hatTrick: false,
    pendingReason: null,
  };
}

export function scoreGoalieTeamGame(
  input: {
    win: boolean;
    shutout: boolean;
    assists: number;
    goals: number;
  },
  rules: ScoringValues = SCORING_VALUES,
): number {
  validateCount("assists", input.assists);
  validateCount("goals", input.goals);

  const teamResultValue = input.win
    ? input.shutout
      ? rules.goalieTeamShutoutWin
      : rules.goalieTeamWin
    : 0;
  return teamResultValue + input.assists * rules.goalieAssist + input.goals * rules.goalieGoal;
}