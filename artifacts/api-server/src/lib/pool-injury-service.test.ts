import assert from "node:assert/strict";
import test from "node:test";
import {
  PoolInjuryService,
  nextTorontoEight,
  type InjuryScheduler,
  type PoolInjurySnapshot,
  type PoolInjuryStore,
} from "./pool-injury-service";
import { CBS_INJURIES_URL } from "./pool-injury-parser";

const iso = (date: string) => new Date(date).toISOString();

class MemoryStore implements PoolInjuryStore {
  record: Awaited<ReturnType<PoolInjuryStore["read"]>> = null;
  async read() { return this.record ? structuredClone(this.record) : null; }
  async claim(_token: string, nextRefreshAt: string, leaseMs: number) {
    if (this.record?.refreshing) return false;
    this.record = {
      snapshot: this.record?.snapshot ?? null,
      lastCheckedAt: new Date().toISOString(),
      lastSuccessAt: this.record?.lastSuccessAt ?? null,
      nextRefreshAt,
      error: null,
      refreshing: true,
      leaseExpiresAt: new Date(Date.now() + leaseMs).toISOString(),
    };
    return true;
  }
  async succeed(_token: string, snapshot: PoolInjurySnapshot) {
    this.record = {
      snapshot: structuredClone(snapshot), lastCheckedAt: snapshot.lastCheckedAt,
      lastSuccessAt: snapshot.lastSuccessAt, nextRefreshAt: snapshot.nextRefreshAt,
      error: null, refreshing: false, leaseExpiresAt: null,
    };
  }
  async fail(_token: string, error: string, retryAt: string) {
    if (!this.record) return;
    this.record = { ...this.record, nextRefreshAt: retryAt, error, refreshing: false, leaseExpiresAt: null };
  }
}

class ManualScheduler implements InjuryScheduler {
  callback: (() => void) | null = null;
  delay = 0;
  setTimeout(callback: () => void, delayMs: number) {
    this.callback = callback;
    this.delay = delayMs;
    return callback;
  }
  clearTimeout(handle: unknown) {
    if (handle === this.callback) this.callback = null;
  }
  unref() {}
  fire() {
    const callback = this.callback;
    this.callback = null;
    callback?.();
  }
}

const rosterFixture = [{
  id: "owner", name: "Owner", selections: [
    { assetType: "skater", nhlPlayerId: 8478000, confirmedName: "Denver Barkey", confirmedTeam: "PHI", identityCandidates: [] },
    { assetType: "goalieTeam", goalies: [{ nhlPlayerId: 8476889, confirmedName: "Filip Gustavsson", confirmedTeam: "MIN" }] },
    { assetType: "skater", nhlPlayerId: null, confirmedName: null, confirmedTeam: null, identityCandidates: [
      { nhlPlayerId: 8480001, name: "Unconfirmed Candidate", team: "BOS" },
    ] },
  ],
}] as unknown as Awaited<ReturnType<typeof import("./draft-roster-store").loadDraftRosters>>;

const NHL_TEAMS = [
  "Anaheim Ducks", "Boston Bruins", "Buffalo Sabres", "Calgary Flames", "Carolina Hurricanes",
  "Chicago Blackhawks", "Colorado Avalanche", "Columbus Blue Jackets", "Dallas Stars",
  "Detroit Red Wings", "Edmonton Oilers", "Florida Panthers", "Los Angeles Kings",
  "Minnesota Wild", "Montreal Canadiens", "Nashville Predators", "New Jersey Devils",
  "New York Islanders", "New York Rangers", "Ottawa Senators", "Philadelphia Flyers",
  "Pittsburgh Penguins", "San Jose Sharks", "Seattle Kraken", "St. Louis Blues",
  "Tampa Bay Lightning", "Toronto Maple Leafs", "Utah Mammoth", "Vancouver Canucks",
  "Vegas Golden Knights", "Washington Capitals", "Winnipeg Jets",
];

const CBS_CODES = [
  "ANA", "BOS", "BUF", "CGY", "CAR", "CHI", "COL", "CLB", "DAL", "DET", "EDM", "FLA",
  "LA", "MIN", "MON", "NSH", "NJ", "NYI", "NYR", "OTT", "PHI", "PIT", "SJ", "SEA",
  "STL", "TB", "TOR", "UTA", "VAN", "LV", "WAS", "WPG",
];

function cbsPage(
  entries: Array<{ team: string; name: string; status: string; injury?: string }>,
  omittedTeams: readonly string[] = [],
) {
  const tables = NHL_TEAMS.filter(team => !omittedTeams.includes(team)).map(team => {
    const index = NHL_TEAMS.indexOf(team);
    const code = CBS_CODES[index]!;
    const rows = entries.filter(entry => entry.team === team).map((entry, playerIndex) =>
      `<tr><td><span class="CellPlayerName--long"><a href="/nhl/players/${700000 + playerIndex}/player-name/">${entry.name}</a></span></td><td>F</td><td>Thu, Oct 1</td><td>${entry.injury ?? ""}</td><td>${entry.status}</td></tr>`,
    ).join("");
    const slug = team.toLowerCase().replace(/[^a-z]+/g, "-");
    return `<div class="TableBaseWrapper"><a href="/nhl/teams/${code}/${slug}/">${team}</a><table><thead><tr><th>Player</th><th>Position</th><th>Updated</th><th>Injury</th><th>Injury Status</th></tr></thead><tbody>${rows}</tbody></table></div>`;
  }).join("");
  return `<html><body>${tables}</body></html>`;
}

async function waitFor(predicate: () => boolean) {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 2));
  }
  assert.fail("Timed out waiting for the background injury refresh");
}

test("daily refresh is scheduled at 8 AM Toronto across standard and daylight time", () => {
  assert.equal(nextTorontoEight(new Date("2026-10-01T12:30:00Z")).toISOString(), "2026-10-02T12:00:00.000Z");
  assert.equal(nextTorontoEight(new Date("2026-11-01T12:30:00Z")).toISOString(), "2026-11-01T13:00:00.000Z");
  assert.equal(nextTorontoEight(new Date("2026-03-08T12:30:00Z")).toISOString(), "2026-03-09T12:00:00.000Z");
});

test("failed CBS source keeps last-good injuries stale and live timer retries recover", async () => {
  let clock = new Date("2026-10-01T12:30:00Z");
  const stalePlayer = {
    nhlPlayerId: 8478000, name: "Denver Barkey", team: "PHI", status: "injured" as const,
    details: "lower body", sourceUrl: "https://www.nhl.com/news/old", reportedAt: iso("2026-09-30T10:00:00Z"),
    checkedAt: iso("2026-09-30T10:00:00Z"),
  };
  const oldSnapshot: PoolInjurySnapshot = {
    status: "available", lastCheckedAt: stalePlayer.checkedAt, lastSuccessAt: stalePlayer.checkedAt,
    nextRefreshAt: iso("2026-10-01T12:00:00Z"), timezone: "America/Toronto", refreshHour: 8,
    error: null, sourceUrl: "https://www.nhl.com/news/nhl-lineup-projections-2026-27-season",
    totalPlayers: 2, confirmedInjured: 1, unknownPlayers: 0, sourceReports: 1, players: [stalePlayer],
  };
  const store = new MemoryStore();
  store.record = {
    snapshot: oldSnapshot, lastCheckedAt: oldSnapshot.lastCheckedAt,
    lastSuccessAt: oldSnapshot.lastSuccessAt, nextRefreshAt: oldSnapshot.nextRefreshAt,
    error: null, refreshing: false, leaseExpiresAt: null,
  };
  const scheduler = new ManualScheduler();
  let failEspn = true;
  const html = cbsPage([
    { team: "Philadelphia Flyers", name: "Denver Barkey", status: "IR", injury: "Lower Body" },
    { team: "Minnesota Wild", name: "Filip Gustavsson", status: "Day-To-Day", injury: "Lower Body" },
  ]);
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date(clock), loadRosters: async () => rosterFixture,
    fetch: async input => {
      const url = String(input);
      return url === CBS_INJURIES_URL
        ? failEspn ? new Response("unavailable", { status: 503 }) : new Response(html, { status: 200 })
        : new Response("unexpected source", { status: 404 });
    },
  });
  await service.start();
  await waitFor(() => Boolean(store.record?.error));
  assert.deepEqual(store.record?.snapshot?.players, oldSnapshot.players);
  assert.equal(store.record?.snapshot?.sourceUrl, oldSnapshot.sourceUrl,
    "a failed CBS migration retains and honestly labels the ESPN/NHL-source last-good snapshot");
  assert.equal((await service.getSnapshot()).status, "stale");
  assert.ok(scheduler.delay >= 5 * 60_000);

  failEspn = false;
  clock = new Date(clock.getTime() + 5 * 60_000);
  scheduler.fire();
  await waitFor(() => store.record?.snapshot?.lastCheckedAt === clock.toISOString());
  assert.equal(store.record?.snapshot?.confirmedInjured, 2);
  assert.equal(store.record?.snapshot?.totalPlayers, 2);
  assert.equal(store.record?.snapshot?.sourceUrl, CBS_INJURIES_URL);
  assert.ok(store.record?.snapshot?.players.some(player => player.nhlPlayerId === 8476889 && player.status === "injured"));
  assert.equal(store.record?.snapshot?.timezone, "America/Toronto");
  await service.stop();
});

test("an HTTP 200 empty or incomplete CBS feed is invalid and cannot clear a last-good snapshot", async () => {
  const clock = new Date("2026-10-01T12:30:00Z");
  const stalePlayer = {
    nhlPlayerId: 8478000, name: "Denver Barkey", team: "PHI", status: "injured" as const,
    details: "Lower Body", sourceUrl: CBS_INJURIES_URL, reportedAt: iso("2026-09-30T10:00:00Z"),
    checkedAt: iso("2026-09-30T10:00:00Z"),
  };
  const snapshot: PoolInjurySnapshot = {
    status: "available", lastCheckedAt: stalePlayer.checkedAt, lastSuccessAt: stalePlayer.checkedAt,
    nextRefreshAt: iso("2026-10-01T12:00:00Z"), timezone: "America/Toronto", refreshHour: 8,
    error: null, sourceUrl: CBS_INJURIES_URL,
    totalPlayers: 1, confirmedInjured: 1, unknownPlayers: 0, sourceReports: 1, players: [stalePlayer],
  };
  const store = new MemoryStore();
  store.record = {
    snapshot, lastCheckedAt: snapshot.lastCheckedAt, lastSuccessAt: snapshot.lastSuccessAt,
    nextRefreshAt: snapshot.nextRefreshAt, error: null, refreshing: false, leaseExpiresAt: null,
  };
  const scheduler = new ManualScheduler();
  const empty = "<html><body>No injury data</body></html>";
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date(clock), loadRosters: async () => rosterFixture,
    fetch: async input => String(input) === CBS_INJURIES_URL
      ? new Response(empty, { status: 200 })
      : new Response("unexpected source", { status: 404 }),
  });
  await service.start();
  await waitFor(() => Boolean(store.record?.error));
  assert.deepEqual(store.record?.snapshot?.players, snapshot.players);
  assert.equal((await service.getSnapshot()).status, "stale");
  await service.stop();
});

test("initial startup refresh runs without a page request and timers are cleared on stop", async () => {
  const store = new MemoryStore();
  const scheduler = new ManualScheduler();
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date("2026-10-01T12:30:00Z"),
    loadRosters: async () => rosterFixture,
    fetch: async input => String(input) === CBS_INJURIES_URL
      ? new Response("<html>invalid</html>", { status: 200 })
      : new Response("unexpected source", { status: 404 }),
  });
  await service.start();
  await waitFor(() => Boolean(store.record?.error));
  assert.equal(scheduler.callback !== null, true);
  await service.stop();
  assert.equal(scheduler.callback, null);
});

test("a startup cache read failure remains scheduled and recovers on the live timer", async () => {
  let clock = new Date("2026-10-01T12:30:00Z");
  class FailsOneReadStore extends MemoryStore {
    shouldFail = true;
    async read() {
      if (this.shouldFail) {
        this.shouldFail = false;
        throw new Error("temporary cache read failure");
      }
      return super.read();
    }
  }
  const store = new FailsOneReadStore();
  const scheduler = new ManualScheduler();
  const html = cbsPage([
    { team: "Anaheim Ducks", name: "Unowned CBS Player", status: "IR", injury: "Lower Body" },
  ]);
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date(clock), loadRosters: async () => rosterFixture,
    fetch: async input => String(input) === CBS_INJURIES_URL
      ? new Response(html, { status: 200 })
      : new Response("unexpected source", { status: 404 }),
  });
  await service.start();
  assert.ok(scheduler.delay >= 5 * 60_000);
  clock = new Date(clock.getTime() + scheduler.delay);
  scheduler.fire();
  await waitFor(() => Boolean(store.record?.snapshot));
  assert.equal(store.record?.snapshot?.totalPlayers, 2);
  assert.equal(store.record?.snapshot?.unknownPlayers, 0);
  assert.equal(store.record?.snapshot?.status, "available");
  assert.ok(store.record?.snapshot?.players.every(player => player.status === "not_reported_injured"));
  await service.stop();
});

test("a valid complete CBS list clears missing prior injuries but source failures do not", async () => {
  let clock = new Date("2026-10-01T12:30:00Z");
  let returning = false;
  const store = new MemoryStore();
  const scheduler = new ManualScheduler();
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date(clock), loadRosters: async () => rosterFixture,
    fetch: async input => {
      if (String(input) !== CBS_INJURIES_URL) return new Response("unexpected source", { status: 404 });
      return new Response(cbsPage(returning
        ? [{ team: "Minnesota Wild", name: "Filip Gustavsson", status: "IR", injury: "Lower Body" }]
        : [
          { team: "Philadelphia Flyers", name: "Denver Barkey", status: "IR", injury: "Lower Body" },
          { team: "Minnesota Wild", name: "Filip Gustavsson", status: "IR", injury: "Lower Body" },
        ]));
    },
  });
  await service.start();
  await waitFor(() => store.record?.snapshot?.confirmedInjured === 2);
  await waitFor(() => scheduler.callback !== null);
  returning = true;
  clock = new Date("2026-10-02T12:30:00Z");
  scheduler.fire();
  await waitFor(() => store.record?.snapshot?.lastSuccessAt === clock.toISOString());
  assert.equal(store.record?.snapshot?.confirmedInjured, 1);
  assert.equal(store.record?.snapshot?.players.find(p => p.nhlPlayerId === 8478000)?.status, "not_reported_injured");
  assert.equal(store.record?.snapshot?.players.find(p => p.nhlPlayerId === 8476889)?.status, "injured");
  assert.equal(store.record?.snapshot?.totalPlayers, 2);
  await service.stop();
});

test("a valid CBS partial league feed applies positive rows and leaves omitted-club owners unknown", async () => {
  const clock = new Date("2026-10-02T12:30:00Z");
  const nashvilleRosters = [{
    ...rosterFixture[0]!,
    selections: [
      ...rosterFixture[0]!.selections,
      {
        assetType: "goalieTeam",
        goalies: [
          { nhlPlayerId: 8477424, confirmedName: "Juuse Saros", confirmedTeam: "NSH" },
          { nhlPlayerId: 8480041, confirmedName: "Justus Annunen", confirmedTeam: "Nashville Predators" },
        ],
      },
    ],
  }] as unknown as Awaited<ReturnType<typeof import("./draft-roster-store").loadDraftRosters>>;
  const previousAt = iso("2026-10-01T12:00:00Z");
  const previousPlayers = [
    {
      nhlPlayerId: 8478000, name: "Denver Barkey", team: "PHI", status: "not_reported_injured" as const,
      details: null, sourceUrl: null, reportedAt: null, checkedAt: previousAt,
    },
    {
      nhlPlayerId: 8476889, name: "Filip Gustavsson", team: "MIN", status: "not_reported_injured" as const,
      details: null, sourceUrl: null, reportedAt: null, checkedAt: previousAt,
    },
    {
      nhlPlayerId: 8477424, name: "Juuse Saros", team: "NSH", status: "injured" as const,
      details: "Old last-good report", sourceUrl: "https://www.espn.com/nhl/injuries",
      reportedAt: previousAt, checkedAt: previousAt,
    },
    {
      nhlPlayerId: 8480041, name: "Justus Annunen", team: "NSH", status: "not_reported_injured" as const,
      details: null, sourceUrl: null, reportedAt: null, checkedAt: previousAt,
    },
  ];
  const snapshot: PoolInjurySnapshot = {
    status: "available", lastCheckedAt: previousAt, lastSuccessAt: previousAt,
    nextRefreshAt: previousAt, timezone: "America/Toronto", refreshHour: 8,
    error: null, sourceUrl: "https://www.espn.com/nhl/injuries",
    totalPlayers: previousPlayers.length, confirmedInjured: 1, unknownPlayers: 0,
    sourceReports: 1, players: previousPlayers,
  };
  const store = new MemoryStore();
  store.record = {
    snapshot, lastCheckedAt: previousAt, lastSuccessAt: previousAt, nextRefreshAt: previousAt,
    error: null, refreshing: false, leaseExpiresAt: null,
  };
  const scheduler = new ManualScheduler();
  const service = new PoolInjuryService({
    store, scheduler, now: () => new Date(clock), loadRosters: async () => nashvilleRosters,
    fetch: async input => String(input) === CBS_INJURIES_URL
      ? new Response(cbsPage([
        { team: "Philadelphia Flyers", name: "Denver Barkey", status: "IR", injury: "Lower Body" },
      ], ["Nashville Predators"]), { status: 200 })
      : new Response("unexpected source", { status: 404 }),
  });
  await service.start();
  await waitFor(() => store.record?.snapshot?.lastSuccessAt === clock.toISOString());
  const updated = store.record!.snapshot!;
  assert.equal(updated.status, "partial");
  assert.equal(updated.sourceUrl, CBS_INJURIES_URL);
  assert.equal(updated.lastCheckedAt, clock.toISOString());
  assert.equal(updated.error, "CBS Sports returned injury tables for 31 of 32 clubs; omitted clubs remain unknown.");
  assert.equal(updated.confirmedInjured, 2, "the positive CBS report and retained NSH last-good injury remain");
  assert.equal(updated.unknownPlayers, 1);
  assert.equal(updated.players.find(player => player.nhlPlayerId === 8478000)?.status, "injured");
  assert.equal(updated.players.find(player => player.nhlPlayerId === 8476889)?.status, "not_reported_injured",
    "a validated complete MIN table can clear an absent player");
  const saros = updated.players.find(player => player.nhlPlayerId === 8477424)!;
  assert.equal(saros.status, "injured");
  assert.equal(saros.sourceUrl, "https://www.espn.com/nhl/injuries");
  assert.equal(updated.players.find(player => player.nhlPlayerId === 8480041)?.status, "unknown",
    "an absent Nashville table is never treated as healthy");
  await service.stop();
});