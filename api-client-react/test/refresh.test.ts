import assert from "node:assert/strict";
import test from "node:test";
import type { QueryClient } from "@tanstack/react-query";
import { isPoolLiveQueryKey, isProvisionalPoolStandings, startPoolLiveRefresh } from "../src/refresh";

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function waitUntil(predicate: () => boolean) {
  for (let i = 0; i < 60 && !predicate(); i++) await delay(5);
  assert.ok(predicate(), "refresh condition reached before timeout");
}
function fakeClient(refetch: (options: unknown) => Promise<void>) {
  let notify: (event: unknown) => void = () => {};
  let unsubscribed = false;
  return {
    client: {
      invalidateQueries: async (options: { type: string; refetchType: string }) => {
        assert.equal(options.type, "all");
        assert.equal(options.refetchType, "none");
      },
      refetchQueries: refetch,
      getQueryCache: () => ({
        subscribe: (fn: (event: unknown) => void) => {
          notify = fn;
          return () => { unsubscribed = true; };
        },
      }),
    } as unknown as QueryClient,
    emit: (asOf: string) => notify({
      type: "updated",
      query: { queryKey: ["/api/pool-scoring"], state: { data: { asOf } } },
    }),
    wasUnsubscribed: () => unsubscribed,
  };
}

test("all score views share refresh eligibility; unrelated queries do not", () => {
  for (const key of ["standings", "pool-scoring", "draft-rosters", "available-players", "nhl-source", "scoring-rules", "analysis/2026-10-01"]) {
    assert.ok(isPoolLiveQueryKey([`/api/${key}`]));
  }
  assert.ok(isPoolLiveQueryKey(["/api/standings", { date: "2026-09-30" }]));
  for (const key of ["/api/transactions", "/api/pool-injuries", "/api/standings-unrelated"]) {
    assert.equal(isPoolLiveQueryKey([key]), false);
  }
  assert.equal(isProvisionalPoolStandings("Live provisional: checked points only"), true);
  assert.equal(isProvisionalPoolStandings("Standings confirmed through 2026-09-30"), false);
});

test("a background skip rearms the timer and foreground scoring queries refresh together", async () => {
  let foreground = false;
  let calls = 0;
  const fake = fakeClient(async options => {
    calls++;
    const filters = options as { type: string; predicate: (query: { queryKey: string[] }) => boolean };
    assert.equal(filters.type, "active");
    assert.ok(filters.predicate({ queryKey: ["/api/standings"] }));
    assert.ok(filters.predicate({ queryKey: ["/api/pool-scoring"] }));
  });
  const refresh = startPoolLiveRefresh(fake.client, { isForeground: () => foreground, intervalMs: 15 });
  try {
    await delay(25);
    assert.equal(calls, 0);
    foreground = true;
    await waitUntil(() => calls > 0);
  } finally {
    refresh.stop();
  }
  const stoppedAt = calls;
  await delay(25);
  assert.equal(calls, stoppedAt);
  assert.ok(fake.wasUnsubscribed());
});

test("new archive timestamps refresh active views, without a loop on unchanged timestamps", async () => {
  let calls = 0;
  const fake = fakeClient(async () => { calls++; });
  const refresh = startPoolLiveRefresh(fake.client, { intervalMs: 10_000 });
  try {
    await waitUntil(() => calls === 1);
    fake.emit("2026-10-02T02:00:00Z");
    await waitUntil(() => calls === 2);
    fake.emit("2026-10-02T02:00:00Z");
    await delay(20);
    assert.equal(calls, 2);
  } finally {
    refresh.stop();
  }
});

test("a failed refresh does not stop subsequent live updates", async () => {
  let calls = 0;
  const fake = fakeClient(async () => {
    calls++;
    if (calls === 1) throw new Error("temporarily unavailable");
  });
  const refresh = startPoolLiveRefresh(fake.client, { intervalMs: 15 });
  try {
    await waitUntil(() => calls >= 2);
  } finally {
    refresh.stop();
  }
});