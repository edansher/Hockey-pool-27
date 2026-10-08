import assert from "node:assert/strict";
import test from "node:test";
import { db, pool } from "@workspace/db";
import { DailyReportService } from "./daily-report-service";
import { logger } from "./logger";

test("connection acquisition failures are observed and the next tick still retries", async t => {
  let connections = 0;
  t.mock.method(logger, "warn", () => {});
  t.mock.method(pool, "connect", async () => {
    connections++;
    throw new Error("timeout exceeded when trying to connect");
  });
  t.mock.method(db, "select", () => { throw new Error("database unavailable"); });
  const service = new DailyReportService();
  await service.tick(new Date("2026-10-05T11:59:00Z"));
  assert.equal(connections, 0, "no publication attempt before Toronto deadline");
  await service.tick(new Date("2026-10-05T12:00:00Z"));
  await service.tick(new Date("2026-10-05T12:05:00Z"));
  assert.equal(connections, 2);
  const status = await service.getHealth(new Date("2026-10-05T12:15:00Z"));
  assert.equal(status.status, "delayed");
  assert.equal(status.lastAttemptAt, "2026-10-05T12:05:00.000Z");
  assert.equal(status.failureCategory, "database_unavailable");
  assert.equal(status.publicationVerified, false);
  assert.equal(status.lastPublishedAt, null);
});

test("health reads saved publication metadata without auditing or rewriting history", async t => {
  t.mock.method(db, "update", () => { throw new Error("health must not update reports"); });
  t.mock.method(db, "insert", () => { throw new Error("health must not publish reports"); });
  const select = t.mock.method(db, "select", () => ({
    from: () => ({
      orderBy: () => ({
        limit: async () => [{ reportDate: "2026-10-05", publishedAt: new Date("2026-10-05T12:07:00Z") }],
      }),
    }),
  }) as unknown as ReturnType<typeof db.select>);
  const service = new DailyReportService();
  const status = await service.getHealth(new Date("2026-10-05T12:20:00Z"));
  assert.equal(status.status, "published");
  assert.equal(status.lastPublishedAt, "2026-10-05T12:07:00.000Z");
  assert.equal(status.lastAttemptAt, null, "do not invent a previous process's attempt");
  select.mock.mockImplementation(() => { throw new Error("query failed"); });
  const cached = await service.getHealth(new Date("2026-10-05T12:25:00Z"));
  assert.equal(cached.status, "published");
  assert.equal(cached.failureCategory, null);
  assert.equal(cached.lastPublishedAt, status.lastPublishedAt);
});
