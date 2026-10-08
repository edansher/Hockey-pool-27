import assert from "node:assert/strict";
import test from "node:test";
import { correctedDefensemanHatTrick } from "./scoring-rules-corrections";
import { DEFAULT_SCORING_RULES } from "./pool-scoring";

test("the confirmed correction preserves all other custom values and starts on opening night", () => {
  const previous = { revision: 2, config: {
    ...DEFAULT_SCORING_RULES, defensemanHatTrick: 6, assist: 3,
    powerPlayBonusOnHatTrick: false,
  } };
  const corrected = correctedDefensemanHatTrick(previous);
  assert.ok(corrected);
  assert.deepEqual(corrected.config, { ...previous.config, defensemanHatTrick: 10 });
  assert.equal(previous.config.defensemanHatTrick, 6);
  assert.equal(corrected.revision, 3);
  assert.equal(corrected.effectiveFrom.toISOString(), "2026-09-29T04:00:00.000Z");
  assert.equal(correctedDefensemanHatTrick(corrected), null);
});

test("already corrected or subsequent custom rule revisions are not overwritten", () => {
  assert.equal(correctedDefensemanHatTrick({ revision: 2, config: { ...DEFAULT_SCORING_RULES } }), null);
  assert.equal(correctedDefensemanHatTrick({
    revision: 4, config: { ...DEFAULT_SCORING_RULES, defensemanHatTrick: 6 },
  }), null);
});