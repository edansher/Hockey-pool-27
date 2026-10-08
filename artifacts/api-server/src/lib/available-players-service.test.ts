import assert from "node:assert/strict";
import test from "node:test";
import {
  AvailablePlayersService,
} from "./available-players-service";
import {
  NHL_CATALOG_TEAMS,
  type AvailableCatalogStore,
  type CatalogRecord,
} from "./available-player-catalog-store";
import type { LeaguePlayerScore } from "./pool-scoring-service";
import type { loadDraftRosters } from "./draft-roster-store";

const current = new Date("2026-10-01T12:00:00.000Z");
const rosterPayload = (team: string) => {
  const idx = NHL_CATALOG_TEAMS.indexOf(team as typeof NHL_CATALOG_TEAMS[number]);
  const duplicate = team === "BOS" ? 102 : null;
  const shared = team === "ANA" ? 102 : duplicate;
  return {
    forwards: [
      { id: 100 + idx, positionCode: "C", firstName: { default: team }, lastName: { default: "Center" } },
      ...(shared ? [{ id: shared, positionCode: "R", firstName: { default: "Shared" }, lastName: { default: "Player" } }] : []),
    ],
    defensemen: [],
    goalies: team === "ANA"
      ? [
        { id: 101, positionCode: "G", firstName: { default: "Named" }, lastName: { default: "Goalie" } },
        { id: 201, positionCode: "G", firstName: { default: "Free" }, lastName: { default: "Goalie" } },
      ]
      : [],
  };
};

class MemoryCatalogStore implements AvailableCatalogStore {
  record: CatalogRecord | null = null;
  claimAllowed = true;
  async read() { return this.record; }
  async claim() {
    if (!this.claimAllowed) return false;
    this.claimAllowed = false;
    return true;
  }
  async succeed(_token: string, record: CatalogRecord) { this.record = record; }
  async fail() { this.claimAllowed = true; }
}

const ownedRosters = (ownedSkater = 100, ownedGoalie = 101) => [{
  id: "owner",
  name: "Owner",
  selections: [
    { assetType: "skater", nhlPlayerId: ownedSkater, goalies: [] },
    { assetType: "goalieTeam", nhlPlayerId: null, goalies: [{ nhlPlayerId: ownedGoalie }] },
  ],
}] as unknown as Awaited<ReturnType<typeof loadDraftRosters>>;

async function waitForCatalog(store: MemoryCatalogStore, expectedTeams = 32) {
  const previousRefresh = store.record?.lastCatalogRefreshAt;
  for (let i = 0; i < 100; i++) {
    if (Object.keys(store.record?.teams ?? {}).length >= expectedTeams &&
      store.record?.lastCatalogRefreshAt &&
      store.record.lastCatalogRefreshAt !== previousRefresh) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

test("discovers all 32 clubs, deduplicates player IDs, excludes named goalies individually, and reflects ownership edits", async () => {
  const store = new MemoryCatalogStore();
  let roster = ownedRosters();
  const requestedTeams: string[] = [];
  const service = new AvailablePlayersService({
    store,
    timersEnabled: false,
    now: () => current,
    loadRosters: async () => roster,
    fetch: async input => {
      const team = new URL(String(input)).pathname.split("/").at(-2)!;
      requestedTeams.push(team);
      return new Response(JSON.stringify(rosterPayload(team)), { status: 200 });
    },
    scoring: {
      async getLeaguePlayerScores(identities) {
        return {
          status: "available", reason: null, asOf: current.toISOString(),
          coverageThroughDate: "2026-10-01",
          rows: identities.map(identity => ({
            nhlPlayerId: identity.nhlPlayerId, goals: 0, assists: 0, powerPlayGoals: 0,
            shortHandedGoals: 0, overtimeGoals: 0,
            poolPoints: identity.nhlPlayerId === 104 ? 9 : identity.nhlPlayerId === 105 ? 2 : identity.nhlPlayerId === 102 ? null : 0,
            gamesPlayed: 0,
            wins: identity.position === "G" ? 0 : null, shutouts: identity.position === "G" ? 0 : null,
            scoringStatus: "complete", reason: null,
          } satisfies LeaguePlayerScore)),
        };
      },
    },
  });
  await service.start();
  await waitForCatalog(store);
  let snapshot = await service.getSnapshot();
  assert.equal(new Set(requestedTeams).size, 32);
  assert.equal(snapshot.catalogTeamsCovered, 32);
   assert.equal(snapshot.totalNhlPlayers, 33);
  assert.equal(snapshot.ownedPlayersExcluded, 2);
  assert.ok(snapshot.rows.some(row => row.nhlPlayerId === 102));
  assert.ok(!snapshot.rows.some(row => row.nhlPlayerId === 100 || row.nhlPlayerId === 101));
  assert.equal(snapshot.rows.filter(row => row.nhlPlayerId === 102).length, 1);
   assert.ok(snapshot.rows.some(row => row.nhlPlayerId === 201 && row.position === "G"),
     "An undrafted goalie remains available even when another goalie from the same club is owned");
   assert.deepEqual(snapshot.rows.slice(0, 2).map(row => row.poolPoints), [9, 2]);
   assert.equal(snapshot.rows.at(-1)?.poolPoints, null, "Pending points rank after genuine zeroes");

  roster = ownedRosters(101, 102);
  snapshot = await service.getSnapshot();
  assert.ok(!snapshot.rows.some(row => row.nhlPlayerId === 101 || row.nhlPlayerId === 102));
  await service.stop();
});

test("a failed club refresh retains that club's last-good catalog and reports partial coverage", async () => {
  const store = new MemoryCatalogStore();
  store.record = {
    catalogType: "available-player-catalog",
    version: 1,
    teams: { ANA: rosterPayload("ANA").forwards.map(player => ({
      nhlPlayerId: player.id, name: "Previously Verified", team: "ANA", position: "F" as const,
    })) },
    lastCatalogRefreshAt: "2026-10-01T10:00:00.000Z",
    nextRefreshAt: null,
    reason: null,
  };
  const service = new AvailablePlayersService({
    store, timersEnabled: false, now: () => current, loadRosters: async () => [],
    fetch: async input => new URL(String(input)).pathname.includes("/ANA/")
      ? new Response("unavailable", { status: 503 })
      : new Response(JSON.stringify(rosterPayload(
          new URL(String(input)).pathname.split("/").at(-2)!,
        )), { status: 200 }),
    scoring: {
      async getLeaguePlayerScores() {
        return { status: "available", reason: null, asOf: null, coverageThroughDate: null, rows: [] };
      },
    },
  });
  await service.start();
  await waitForCatalog(store);
  const snapshot = await service.getSnapshot();
  assert.ok(store.record?.teams.ANA?.some(player => player.name === "Previously Verified"));
  assert.equal(snapshot.catalogTeamsCovered, 32);
  assert.equal(snapshot.status, "partial");
  assert.match(snapshot.reason ?? "", /could not be fully refreshed/);
  await service.stop();
});