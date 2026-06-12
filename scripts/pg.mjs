// Local embedded PostgreSQL lifecycle helper for development/testing.
//
//   node scripts/pg.mjs start   -> initialise (if needed), start, ensure db "wfm" exists
//   node scripts/pg.mjs stop    -> stop the running cluster (data is persisted)
//
// Runs without root, no docker. Uses a portable PostgreSQL downloaded by the
// `embedded-postgres` package. Data is persisted under ./.pgdata.

import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, ".pgdata");

const PORT = 5433;
const USER = "wfm";
const PASSWORD = "wfm";
const DATABASE = "wfm";

function makePg() {
  return new EmbeddedPostgres({
    databaseDir: dataDir,
    user: USER,
    password: PASSWORD,
    port: PORT,
    persistent: true,
  });
}

function isAlreadyExistsError(error) {
  const message = String(error?.message ?? error ?? "");
  return /already exists/i.test(message);
}

async function start() {
  const pg = makePg();

  // Initialise the cluster only when the data directory is absent. Guard
  // against the "already initialised" case so re-runs do not throw.
  if (!existsSync(dataDir)) {
    console.log(`[pg] Initialising new cluster in ${dataDir} ...`);
    await pg.initialise();
  } else {
    console.log(`[pg] Reusing existing cluster in ${dataDir}`);
  }

  console.log(`[pg] Starting PostgreSQL on port ${PORT} ...`);
  await pg.start();

  // Ensure the application database exists; swallow "already exists".
  try {
    await pg.createDatabase(DATABASE);
    console.log(`[pg] Created database "${DATABASE}"`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`[pg] Database "${DATABASE}" already exists`);
    } else {
      throw error;
    }
  }

  console.log(
    `[pg] Ready. DATABASE_URL="postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}?schema=public"`,
  );

  // Verify it accepts connections.
  const client = pg.getPgClient(DATABASE);
  await client.connect();
  const result = await client.query("SELECT 1 AS ok");
  await client.end();
  console.log(`[pg] Connection check: ok=${result.rows[0].ok}`);

  // The cluster is started as a separate process and is automatically shut
  // down when this script exits. Detach so it keeps running in the background.
  await pg.stop();
  console.log(
    "[pg] NOTE: embedded-postgres stops the cluster on script exit. " +
      "Use the data dir as a persistent store; restart with `node scripts/pg.mjs start`.",
  );
}

async function startForeground() {
  const pg = makePg();
  if (!existsSync(dataDir)) {
    console.log(`[pg] Initialising new cluster in ${dataDir} ...`);
    await pg.initialise();
  } else {
    console.log(`[pg] Reusing existing cluster in ${dataDir}`);
  }
  console.log(`[pg] Starting PostgreSQL on port ${PORT} (foreground) ...`);
  await pg.start();
  try {
    await pg.createDatabase(DATABASE);
    console.log(`[pg] Created database "${DATABASE}"`);
  } catch (error) {
    if (isAlreadyExistsError(error)) {
      console.log(`[pg] Database "${DATABASE}" already exists`);
    } else {
      throw error;
    }
  }
  console.log(`[pg] Ready on port ${PORT}. Press Ctrl+C to stop.`);
  const shutdown = async () => {
    console.log("\n[pg] Stopping ...");
    await pg.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
  // Keep the process alive.
  await new Promise(() => {});
}

async function stop() {
  const pg = makePg();
  console.log("[pg] Stopping PostgreSQL ...");
  try {
    await pg.stop();
    console.log("[pg] Stopped.");
  } catch (error) {
    console.log(`[pg] Stop reported: ${error?.message ?? error}`);
  }
}

const command = process.argv[2];

switch (command) {
  case "start":
    await start();
    break;
  case "run":
    // Long-running foreground server (use this when you need the DB up while
    // running migrations / the app from another shell).
    await startForeground();
    break;
  case "stop":
    await stop();
    break;
  default:
    console.error("Usage: node scripts/pg.mjs <start|run|stop>");
    process.exit(1);
}
