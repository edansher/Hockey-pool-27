import assert from "node:assert/strict";
import test from "node:test";
import {
  SCORING_VALUES,
  DEFAULT_SCORING_RULES,
  scoreGoalieTeamGame,
  scoreHatTrick,
  scoreOvertimeGoal,
  scoreSkaterGame,
} from "./pool-scoring";

test("exports the confirmed scoring values", () => {
  assert.deepEqual(SCORING_VALUES, {
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
  });
});

test("scores overtime goals with only the confirmed power-play bonus", () => {
  assert.equal(scoreOvertimeGoal(false), 3);
  assert.equal(scoreOvertimeGoal(true), 4);
});

test("scores each non-hat-trick goal as one replacement value and adds assists", () => {
  const goals = [
    { powerPlay: false, shortHanded: false, overtime: false },
    { powerPlay: true, shortHanded: false, overtime: false },
    { powerPlay: false, shortHanded: true, overtime: false },
    { powerPlay: false, shortHanded: false, overtime: true },
    { powerPlay: true, shortHanded: false, overtime: true },
  ];
  const expectedGoalPoints = [1, 2, 5, 3, 4];
  goals.forEach((goal, index) => {
    assert.deepEqual(scoreSkaterGame("F", [goal], 2), {
      poolPoints: expectedGoalPoints[index]! + 2,
      hatTrick: false,
      pendingReason: null,
    });
  });
  assert.deepEqual(scoreSkaterGame("F", goals.slice(0, 2), 2), {
    poolPoints: 5, hatTrick: false, pendingReason: null,
  });
});

test("scores the confirmed PP hat-trick example as 10 and honors both saved bonus flags", () => {
  const goals = [
    { powerPlay: true, shortHanded: false, overtime: false },
    { powerPlay: true, shortHanded: false, overtime: false },
    { powerPlay: false, shortHanded: false, overtime: false },
  ];
  assert.deepEqual(scoreSkaterGame("F", goals, 2), {
    poolPoints: 10,
    hatTrick: true,
    pendingReason: null,
  });
  const noBonuses = {
    ...DEFAULT_SCORING_RULES,
    powerPlayBonusOnHatTrick: false,
    powerPlayBonusOnOvertime: false,
  };
  assert.equal(scoreSkaterGame("D", goals, 2, noBonuses).poolPoints, 12);
  assert.equal(
    scoreSkaterGame("D", [{ powerPlay: true, shortHanded: false, overtime: true }], 0, noBonuses).poolPoints,
    3,
  );
});

test("defers only unconfirmed skater scoring overlaps and the four-goal policy", () => {
  const withGoal = (changes: Partial<{ powerPlay: boolean; shortHanded: boolean; overtime: boolean }> = {}) => ({
    powerPlay: false,
    shortHanded: false,
    overtime: false,
    ...changes,
  });
  assert.match(
    scoreSkaterGame("F", [withGoal({ shortHanded: true, overtime: true })], 0).pendingReason ?? "",
    /short-handed overtime/,
  );
  assert.match(
    scoreSkaterGame("F", [withGoal({ shortHanded: true }), withGoal(), withGoal()], 0).pendingReason ?? "",
    /short-handed goal within a hat trick/,
  );
  assert.match(
    scoreSkaterGame("D", [withGoal({ overtime: true }), withGoal(), withGoal()], 0).pendingReason ?? "",
    /overtime goal within a hat trick/,
  );
  const four = scoreSkaterGame("F", [withGoal(), withGoal(), withGoal(), withGoal()], 0);
  assert.equal(four.poolPoints, null);
  assert.match(four.pendingReason ?? "", /four or more goals/);
});

test("uses six points for forward hat tricks and ten for defensemen, plus saved power-play bonuses", () => {
  for (const position of ["F", "D"] as const) {
    for (let powerPlayGoals = 0; powerPlayGoals <= 3; powerPlayGoals++) {
      assert.equal(scoreHatTrick(position, powerPlayGoals), (position === "D" ? 10 : 6) + powerPlayGoals);
    }
  }
  assert.equal(scoreHatTrick("F", 1, 2), 9);
});

test("counts two assists separately for a hat trick with two power-play goals", () => {
  assert.equal(scoreHatTrick("F", 2, 2), 10);
  assert.equal(scoreHatTrick("D", 2, 2), 14);
});

test("Bouchard's three ordinary goals and two assists earn twelve, without adding the goals twice", () => {
  const goals = Array.from({ length: 3 }, () => ({
    powerPlay: false, shortHanded: false, overtime: false,
  }));
  assert.equal(scoreSkaterGame("D", goals, 0).poolPoints, 10);
  assert.equal(scoreSkaterGame("D", goals, 2).poolPoints, 12);
  assert.equal(scoreSkaterGame("F", goals, 2).poolPoints, 8);
});

test("validates hat-trick power-play goal and assist counts", () => {
  for (const invalidCount of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => scoreHatTrick("F", invalidCount), RangeError);
    assert.throws(() => scoreHatTrick("D", 0, invalidCount), RangeError);
  }
  assert.throws(() => scoreHatTrick("F", 4), RangeError);
  assert.throws(() => scoreHatTrick("X" as never, 0), RangeError);
});

test("scores goalie wins, shutout wins, assists, and goals", () => {
  assert.equal(scoreGoalieTeamGame({ win: true, shutout: false, assists: 0, goals: 0 }), 2);
  assert.equal(scoreGoalieTeamGame({ win: true, shutout: true, assists: 0, goals: 0 }), 5);
  assert.equal(scoreGoalieTeamGame({ win: false, shutout: false, assists: 1, goals: 1 }), 13);
});

test("a shutout without a win earns no team-result points", () => {
  assert.equal(scoreGoalieTeamGame({ win: false, shutout: true, assists: 0, goals: 0 }), 0);
  assert.equal(scoreGoalieTeamGame({ win: false, shutout: true, assists: 1, goals: 1 }), 13);
});

test("validates goalie assist and goal counts", () => {
  for (const invalidCount of [-1, 1.5, Number.NaN, Number.NEGATIVE_INFINITY]) {
    assert.throws(
      () =>
        scoreGoalieTeamGame({
          win: false,
          shutout: false,
          assists: invalidCount,
          goals: 0,
        }),
      RangeError,
    );
    assert.throws(
      () =>
        scoreGoalieTeamGame({
          win: false,
          shutout: false,
          assists: 0,
          goals: invalidCount,
        }),
      RangeError,
    );
  }
});