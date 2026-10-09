import app from "./app";
import { logger } from "./lib/logger";
import { nhlSourceService } from "./lib/nhl-source-service";
import { poolInjuryService } from "./lib/pool-injury-service";
import { availablePlayersService } from "./lib/available-players-service";
import { pool } from "@workspace/db";
import { dailyReportService } from "./lib/daily-report-service";

const HTTP_SHUTDOWN_TIMEOUT_MS = 30_000;

// Independent copy safety switches: nothing runs on a timer and no OpenAI call
// is made until the copy's own database and connections are verified.
//   ENABLE_BACKGROUND_JOBS=true  NHL refresh (5 min), injuries, player catalog
//   ENABLE_DAILY_REPORT=true     8:00 a.m. Toronto OpenAI daily report
const backgroundJobsEnabled = process.env["ENABLE_BACKGROUND_JOBS"] === "true";
const dailyReportEnabled = process.env["ENABLE_DAILY_REPORT"] === "true";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const server = app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port, backgroundJobsEnabled, dailyReportEnabled }, "Server listening");
  if (backgroundJobsEnabled) {
    void nhlSourceService.start();
    void poolInjuryService.start();
    void availablePlayersService.start();
  } else {
    logger.warn("Background jobs disabled (set ENABLE_BACKGROUND_JOBS=true to enable NHL, injury and catalog refresh)");
  }
  if (dailyReportEnabled) dailyReportService.start();
  else logger.warn("Daily report scheduler disabled (set ENABLE_DAILY_REPORT=true; requires OpenAI credentials)");
});

let shutdownPromise: Promise<void> | null = null;

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shutdownPromise) return shutdownPromise;
  shutdownPromise = (async () => {
    logger.info({ signal }, "Stopping NHL refresh and HTTP server");
    await nhlSourceService.stop();
    await poolInjuryService.stop();
    await availablePlayersService.stop();
    await dailyReportService.stop();
    await new Promise<void>((resolve) => {
      let finished = false;
      const finish = () => {
        if (finished) return;
        finished = true;
        clearTimeout(timeout);
        resolve();
      };
      const timeout = setTimeout(() => {
        logger.warn("Graceful HTTP shutdown timed out; closing remaining connections");
        server.closeAllConnections();
        finish();
      }, HTTP_SHUTDOWN_TIMEOUT_MS);
      timeout.unref();
      server.close(finish);
    });
    await pool.end();
  })();
  return shutdownPromise;
}

process.once("SIGINT", () => {
  void shutdown("SIGINT").catch((err) => {
    logger.error({ err }, "Error during graceful shutdown");
    process.exitCode = 1;
  });
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM").catch((err) => {
    logger.error({ err }, "Error during graceful shutdown");
    process.exitCode = 1;
  });
});
