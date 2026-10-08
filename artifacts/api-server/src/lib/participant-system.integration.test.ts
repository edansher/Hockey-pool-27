import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { sql, eq, getTableName } from "drizzle-orm";
import { db, pool, draftRostersTable, participantAccountsTable, participantAccountLinksTable, poolTransactionsTable, poolAuditTable,
  scoringRulesTable, type DraftRosterSelection } from "@workspace/db";
import { recordParticipantSwap } from "../scripts/record-participant-swap";
import { managePool } from "./pool-management";
import { loadDraftRosters } from "./draft-roster-store";
import { availablePlayersService } from "./available-players-service";
import { nhlSourceService } from "./nhl-source-service";
import { poolScoringService, rowsForRosters } from "./pool-scoring-service";
import { postgresNhlPoolScoringArchiveStore } from "./nhl-source-store";
import { loadPersistedScoringRules } from "./scoring-rules-store";
import { eligibilityPlan, torontoDate } from "./pickup-eligibility";
import { resolvePendingPickups } from "./pending-pickups";

// The real workflows continue using public. Every connection in THIS process is
// scoped to a disposable schema; test swaps/fees never touch the real pool.
test("atomic participant lifecycle, concurrency, rollback and audited corrections (isolated schema)", async t => {
  const schema = `pool_test_${randomUUID().replaceAll("-", "")}`;
  await pool.query(`CREATE SCHEMA "${schema}"`);
  const scopedOptions = pool as unknown as { options: { options?: string } };
  const originalOptions = scopedOptions.options.options;
  scopedOptions.options.options = `-c search_path=${schema}`;
  await pool.query(`SET search_path TO "${schema}"`);
  const saved = { available: availablePlayersService.getSnapshot, source: nhlSourceService.getSnapshot,
    score: poolScoringService.getSnapshot, archive: postgresNhlPoolScoringArchiveStore.read, fetch: globalThis.fetch };
  try {
    for (const table of [draftRostersTable, participantAccountsTable, participantAccountLinksTable, poolTransactionsTable, poolAuditTable, scoringRulesTable]) {
      const name = getTableName(table);
      await pool.query(`CREATE TABLE "${schema}"."${name}" (LIKE public."${name}" INCLUDING ALL)`);
    }
    const rulesName = getTableName(scoringRulesTable);
    await pool.query(`INSERT INTO "${schema}"."${rulesName}" SELECT * FROM public."${rulesName}"`);
    const asOf = new Date().toISOString();
    const today = torontoDate(new Date());
    let nextStart = new Date(Date.now() + 3600000).toISOString();
    const archive: any = { season: 20262027, gameFacts: {}, scheduledGames: {}, scheduleDates: {}, coverageThroughDate: today };
    let scheduleAvailable = true;
    globalThis.fetch = (async (url: any, options?: any) => {
      if (String(url).includes("/club-schedule-season/")) {
        if (!scheduleAvailable) return new Response("Unavailable", { status: 503 });
        return Response.json({ games: [{ id: 2026029001, season: 20262027, gameType: 2, gameDate: today,
          gameState: "FUT", startTimeUTC: nextStart, homeTeam: { abbrev: String(url).split("/").at(-2) }, awayTeam: { abbrev: "SEA" } }] });
      }
      if (String(url).includes("/v1/roster/")) return Response.json({ goalies: [
        { id: 90050000, firstName: { default: "Test" }, lastName: { default: "Keeper" } },
      ] });
      return saved.fetch(url, options);
    }) as typeof fetch;
    const replacement = { nhlPlayerId: 90009999, name: "Test Replacement", team: "SJS", position: "F",
      poolPoints: 999, scoringStatus: "complete" };
    availablePlayersService.getSnapshot = (async () => ({ status: "available", rows: [replacement], lastCatalogRefreshAt: asOf })) as any;
    nhlSourceService.getSnapshot = (async () => ({ status: "available", lastSuccessAt: asOf })) as any;
    postgresNhlPoolScoringArchiveStore.read = (async () => ({ snapshot: archive, lastSuccessAt: asOf })) as any;
    poolScoringService.getSnapshot = (async () => {
      const rosters = await loadDraftRosters();
      const config = await loadPersistedScoringRules();
      return { asOf, status: "available", rows: rowsForRosters(rosters, archive, config.rules, true) };
    }) as any;
    const picks = (offset = 0): DraftRosterSelection[] => Array.from({ length: 20 }, (_, i) => ({
      round: i + 1, originalText: `Test ${offset + i}`, confirmedName: `Test ${offset + i}`,
      confirmedTeam: "San Jose Sharks", reviewNote: null, nhlPlayerId: i < 18 ? 90000000 + offset + i : null,
      position: i < 13 ? "F" : i < 18 ? "D" : "G", assetType: i < 18 ? "skater" : "goalieTeam",
    }));
    await db.insert(draftRostersTable).values([{ id: "isolated-one", name: "Test one", selections: picks() },
      { id: "isolated-two", name: "Test two", selections: picks(100) }]);
    const counts = async () => (await db.select().from(poolTransactionsTable)).length;
    let first: Awaited<ReturnType<typeof recordParticipantSwap>>;
    await t.test("F for F is one unpaid fee, zero incoming ownership credit, unchanged season reference", async () => {
      first = await recordParticipantSwap("isolated-one", 90000000, replacement.nhlPlayerId, "test-first");
      assert.equal(first.paid, false);
      assert.equal(first.details?.fee, 50);
      assert.equal((first.details?.incoming as any).seasonPoolPoints, 999);
      const [owner] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "isolated-one"));
      const incoming = owner!.selections.find(s => s.nhlPlayerId === replacement.nhlPlayerId)!;
      assert.equal(incoming.acquiredAt, first.effectiveAt.toISOString());
      assert.equal(incoming.scoringBaseline, undefined);
      const configuration = await loadPersistedScoringRules();
      const row = rowsForRosters([{ ...owner!, selections: [incoming] }], archive, configuration.rules, true)[0]!;
      assert.equal(row.poolPoints, 0);
      assert.equal(await counts(), 1);
    });
    await t.test("network retry uses the original record and does not duplicate a fee", async () => {
      const replay = await recordParticipantSwap("isolated-one", 90000000, replacement.nhlPlayerId, "test-first");
      assert.equal(replay.id, first!.id); assert.equal(await counts(), 1);
    });
    await t.test("D for F, goalies and unavailable/owned replacements cannot partially save", async () => {
      await assert.rejects(recordParticipantSwap("isolated-two", 90000113, replacement.nhlPlayerId, "test-wrong-position"), /position/);
      await assert.rejects(recordParticipantSwap("isolated-two", 999, replacement.nhlPlayerId, "test-goalie"), /not actively owned/);
      await assert.rejects(recordParticipantSwap("isolated-two", 90000100, replacement.nhlPlayerId, "test-owned"), /another participant/);
      assert.equal(await counts(), 1);
    });
    await t.test("administrator reversal restores original ownership, voids credits and retains audited history", async () => {
      await managePool({ action: "reverse", reason: "Isolated correction test", requestId: "reverse-test", details: { id: first!.id } }, "test-admin");
      const [owner] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "isolated-one"));
      assert.ok(owner!.selections.some(s => s.nhlPlayerId === 90000000 && !s.droppedAt));
      assert.ok(owner!.selections.some(s => s.nhlPlayerId === replacement.nhlPlayerId && s.voidedAt));
      const [record] = await db.select().from(poolTransactionsTable).where(eq(poolTransactionsTable.id, first!.id));
      assert.ok(record!.reversedAt); assert.equal(record!.reversedBy, "test-admin");
      assert.equal((await db.select().from(poolAuditTable)).length, 1);
      await assert.rejects(recordParticipantSwap("isolated-one", 90000000, replacement.nhlPlayerId, "test-first"), /reversed/);
    });
    await t.test("two participants acquire the same available player: only one commits", async () => {
      const attempts = await Promise.allSettled([
        recordParticipantSwap("isolated-one", 90000000, replacement.nhlPlayerId, "test-race-one"),
        recordParticipantSwap("isolated-two", 90000100, replacement.nhlPlayerId, "test-race-two"),
      ]);
      assert.equal(attempts.filter(a => a.status === "fulfilled").length, 1);
      assert.equal(attempts.filter(a => a.status === "rejected").length, 1);
      const owners = await db.select().from(draftRostersTable);
      assert.equal(owners.flatMap(o => o.selections).filter(s => s.nhlPlayerId === replacement.nhlPlayerId && !s.droppedAt).length, 1);
    });
    await t.test("allowance correction is audited and blocks a exhausted participant without another fee", async () => {
      await managePool({ action: "allowance", reason: "Isolated allowance test", requestId: "allowance-test",
        details: { ownerId: "isolated-two", transactionLimit: 9, countAdjustment: 9 } }, "test-admin");
      const before = await counts();
      await assert.rejects(recordParticipantSwap("isolated-two", 90000101, replacement.nhlPlayerId, "test-limit"), /No drops remaining/);
      assert.equal(await counts(), before);
    });
    await t.test("database write failure fully rolls back the roster and fee", async () => {
      replacement.nhlPlayerId = 90008888;
      await pool.query(`CREATE FUNCTION "${schema}".reject_test_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Isolated forced save failure'; END $$`);
      await pool.query(`CREATE TRIGGER reject_move BEFORE INSERT ON "${schema}".pool_transactions FOR EACH ROW EXECUTE FUNCTION "${schema}".reject_test_move()`);
      const before = await db.select().from(draftRostersTable);
      const count = await counts();
      await assert.rejects(recordParticipantSwap("isolated-one", 90000001, replacement.nhlPlayerId, "test-rollback"),
        (error: unknown) => error instanceof Error && error.cause instanceof Error && /forced save failure/.test(error.cause.message));
      assert.deepEqual(await db.select().from(draftRostersTable), before);
      assert.equal(await counts(), count);
      await pool.query(`DROP TRIGGER reject_move ON "${schema}".pool_transactions`);
    });
    await t.test("ownership authorization lost before commit does not consume a move", async () => {
      const plan = await eligibilityPlan("SJS");
      const count = await counts();
      await assert.rejects(recordParticipantSwap("isolated-one", 90000001, replacement.nhlPlayerId, "test-auth-lost", "unlinked-user",
        { acknowledged: true, eligibilityToken: plan.eligibilityToken }), /authorization changed/);
      assert.equal(await counts(), count);
    });
    await t.test("pending eligibility resolves once against the original confirmation, with audit", async () => {
      const acquiredAt = new Date(Date.parse(nextStart) - 59_000).toISOString();
      const [owner] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "isolated-one"));
      const selection = owner!.selections.find(s => s.nhlPlayerId === 90000001)!;
      Object.assign(selection, { acquiredAt, eligibilityPolicy: "scheduled-minus-one-minute", eligibilityPending: true });
      await db.update(draftRostersTable).set({ selections: owner!.selections }).where(eq(draftRostersTable.id, owner!.id));
      await resolvePendingPickups();
      const [updated] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, owner!.id));
      const resolved = updated!.selections.find(s => s.round === selection.round)!;
      assert.equal(resolved.eligibilityPending, false);
      assert.ok(resolved.scoringExcludedGameIds?.includes(2026029001));
      assert.equal(resolved.eligibilityGames?.[0]?.eligible, false);
      const audits = (await db.select().from(poolAuditTable)).length;
      await resolvePendingPickups();
      assert.equal((await db.select().from(poolAuditTable)).length, audits);
    });
    await t.test("a deadline crossed during saving rolls back all writes and the fee", async () => {
      const team = replacement.team, start = nextStart;
      replacement.team = "MTL";
      nextStart = new Date(Date.now() + 60_500).toISOString();
      const plan = await eligibilityPlan("MTL");
      assert.equal(plan.games[0]!.eligible, true);
      await pool.query(`CREATE FUNCTION "${schema}".delay_test_move() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN PERFORM pg_sleep(0.7); RETURN NEW; END $$`);
      await pool.query(`CREATE TRIGGER delay_move AFTER INSERT ON "${schema}".pool_transactions FOR EACH ROW EXECUTE FUNCTION "${schema}".delay_test_move()`);
      try {
        const before = await db.select().from(draftRostersTable), count = await counts();
        await assert.rejects(recordParticipantSwap("isolated-one", 90000002, replacement.nhlPlayerId, "test-deadline", "test-admin",
          { acknowledged: true, eligibilityToken: plan.eligibilityToken, admin: true }), /deadline|eligibility/i);
        assert.deepEqual(await db.select().from(draftRostersTable), before);
        assert.equal(await counts(), count);
      } finally {
        await pool.query(`DROP TRIGGER delay_move ON "${schema}".pool_transactions`);
        replacement.team = team; nextStart = start;
      }
    });
    await t.test("reacquiring a dropped player creates another fee and zero new credit without duplicating retained points", async () => {
      const race = (await db.select().from(poolTransactionsTable)).find(r => r.requestId.startsWith("test-race-"))!;
      await managePool({ action: "allowance", reason: "Isolated reacquisition test", requestId: "restore-allowance",
        details: { ownerId: race.ownerId, transactionLimit: 9, countAdjustment: 0 } }, "test-admin");
      const [owner] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, race.ownerId));
      owner!.selections.find(s => s.nhlPlayerId === Number(race.outgoingPlayerId) && s.droppedAt)!.frozenScoring!.poolPoints = 8;
      await db.update(draftRostersTable).set({ selections: owner!.selections }).where(eq(draftRostersTable.id, owner!.id));
      replacement.nhlPlayerId = Number(race.outgoingPlayerId);
      const before = await counts();
      const record = await recordParticipantSwap(race.ownerId, Number(race.incomingPlayerId), replacement.nhlPlayerId, "test-reacquire");
      assert.equal(record.details?.fee, 50); assert.equal(await counts(), before + 1);
      const roster = (await loadDraftRosters()).find(o => o.id === race.ownerId)!;
      const rules = await loadPersistedScoringRules();
      const rows = rowsForRosters([roster], archive, rules.rules, true).filter(r => r.nhlPlayerId === replacement.nhlPlayerId);
      assert.deepEqual(rows.map(r => r.poolPoints).sort((a, b) => a! - b!), [0, 8]);
    });
    await t.test("a D for D replacement commits to the same group without changing composition", async () => {
      replacement.nhlPlayerId = 90007777; replacement.position = "D";
      const record = await recordParticipantSwap("isolated-one", 90000013, replacement.nhlPlayerId, "test-defense");
      assert.equal((record.details?.incoming as any).position, "D");
      const owner = (await loadDraftRosters()).find(o => o.id === "isolated-one")!;
      const active = owner.selections.filter(s => !s.droppedAt);
      assert.equal(active.filter(s => s.position === "F").length, 13);
      assert.equal(active.filter(s => s.position === "D").length, 5);
      assert.equal(active.filter(s => s.position === "G").length, 2);
    });
    await t.test("administrator goalie removal retains individual credits; a new goalie group starts at zero", async () => {
      const [raw] = await db.select().from(draftRostersTable).where(eq(draftRostersTable.id, "isolated-one"));
      const pick = raw!.selections.find(s => s.round === 19)!;
      pick.adminGoalies = [{ nhlPlayerId: 90040000, confirmedName: "Test Old Keeper",
        confirmedTeam: "San Jose Sharks", identitySource: "Isolated verified fixture" }];
      await db.update(draftRostersTable).set({ selections: raw!.selections }).where(eq(draftRostersTable.id, raw!.id));
      const before = await counts();
      await managePool({ action: "roster", reason: "Isolated goalie removal", requestId: "remove-goalie",
        details: { ownerId: raw!.id, operation: "remove", round: 19 } }, "test-admin");
      let owner = (await loadDraftRosters()).find(o => o.id === raw!.id)!;
      assert.equal(owner.selections.find(s => s.round === 19)!.frozenGoalieScoring!["90040000"]!.poolPoints, 0);
      await managePool({ action: "roster", reason: "Isolated goalie addition", requestId: "add-goalie",
        details: { ownerId: raw!.id, operation: "add", goalieTeam: "LAK" } }, "test-admin");
      owner = (await loadDraftRosters()).find(o => o.id === raw!.id)!;
      const added = owner.selections.find(s => s.adminGoalies?.[0]?.nhlPlayerId === 90050000)!;
      assert.ok(added.acquiredAt); assert.equal(added.eligibilityPolicy, "scheduled-minus-one-minute");
      archive.gameFacts["2026028000"] = { gameId: 2026028000, gameDate: torontoDate(new Date(Date.now() - 86400000)), homeTeamAbbrev: "LAK",
        awayTeamAbbrev: "SEA", verified: true, final: true, goalieResultsComplete: true,
        players: { "90050000": { position: "G", goals: [], assists: 8, goalieAppeared: true, goalieDecision: "W", goalieShutoutWin: false },
          "90040000": { position: "G", goals: [], assists: 12, goalieAppeared: true, goalieDecision: "W", goalieShutoutWin: false } } };
      const rules = await loadPersistedScoringRules();
      const rows = rowsForRosters([owner], archive, rules.rules, true);
      assert.equal(rows.find(r => r.nhlPlayerId === 90050000)!.poolPoints, 0);
      assert.equal(rows.find(r => r.nhlPlayerId === 90040000)!.poolPoints, 0);
      assert.equal(await counts(), before); // Administrative corrections do not create participant fees.
    });
  } finally {
    availablePlayersService.getSnapshot = saved.available; nhlSourceService.getSnapshot = saved.source;
    poolScoringService.getSnapshot = saved.score; postgresNhlPoolScoringArchiveStore.read = saved.archive;
    globalThis.fetch = saved.fetch;
    scopedOptions.options.options = originalOptions;
    await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await pool.end();
  }
});