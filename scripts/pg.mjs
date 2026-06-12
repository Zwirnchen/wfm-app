// Local embedded PostgreSQL lifecycle helper for development/testing.
//
//   node scripts/pg.mjs run     -> foreground: start cluster + ensure db, stay alive
//   node scripts/pg.mjs start   -> detached background: spawn `run`, wait until up
//   node scripts/pg.mjs stop    -> signal the detached `run` process to stop
//
// Runs without root, no docker. Uses a portable PostgreSQL downloaded by the
// `embedded-postgres` package. Data is persisted under ./.pgdata.
//
// IMPORTANT: embedded-postgres shuts the server down when the Node process that
// started it exits, and stop() only kills the process handle held by THAT
// instance. So we keep one long-lived `run` process that owns the cluster, and
// `start`/`stop` manage that process out-of-band via a pid file + signals.

import { existsSync, openSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import net from "node:net";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.join(rootDir, ".pgdata");
const logFile = path.join(dataDir, "pg.log");
const pidFile = path.join(dataDir, "pg.pid");

const HOST = "127.0.0.1";
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

// Initialise the cluster only when the data directory is absent, start it, and
// ensure the application database exists (swallowing only "already exists").
async function ensureClusterAndDb(pg) {
  if (!existsSync(dataDir)) {
    console.log(`[pg] Initialising new cluster in ${dataDir} ...`);
    await pg.initialise();
  } else {
    console.log(`[pg] Reusing existing cluster in ${dataDir}`);
  }

  console.log(`[pg] Starting PostgreSQL on port ${PORT} ...`);
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
}

// Resolve once a TCP connection to host:port succeeds (true) or the timeout
// elapses (false). Polls every `intervalMs`.
function waitForPort({ shouldAccept, timeoutMs = 20000, intervalMs = 250 }) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const attempt = () => {
      const socket = new net.Socket();
      let settled = false;
      const done = (accepting) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (accepting === shouldAccept) {
          resolve(true);
          return;
        }
        if (Date.now() >= deadline) {
          resolve(false);
          return;
        }
        setTimeout(attempt, intervalMs);
      };
      socket.setTimeout(intervalMs);
      socket.once("connect", () => done(true));
      socket.once("timeout", () => done(false));
      socket.once("error", () => done(false));
      socket.connect(PORT, HOST);
    };
    attempt();
  });
}

// Foreground: owns the cluster for its whole lifetime. This is the mode that
// actually keeps a DB up.
async function run() {
  const pg = makePg();
  await ensureClusterAndDb(pg);
  console.log(
    `[pg] Ready on ${HOST}:${PORT}. ` +
      `DATABASE_URL="postgresql://${USER}:${PASSWORD}@localhost:${PORT}/${DATABASE}?schema=public"`,
  );

  const shutdown = async () => {
    console.log("[pg] Stopping ...");
    try {
      await pg.stop();
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Keep the process alive so the cluster stays up.
  await new Promise(() => {});
}

// Detached background: spawn `run` as a detached child, record its pid, and
// wait until the port accepts connections.
async function start() {
  if (existsSync(pidFile)) {
    const existingPid = Number(readFileSync(pidFile, "utf8").trim());
    if (existingPid && isProcessAlive(existingPid)) {
      const up = await waitForPort({ shouldAccept: true, timeoutMs: 2000 });
      if (up) {
        console.log(`[pg] already running (pid ${existingPid})`);
        process.exit(0);
      }
    }
  }

  const out = openSync(logFile, "a");
  const err = openSync(logFile, "a");
  const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "run"], {
    cwd: rootDir,
    detached: true,
    stdio: ["ignore", out, err],
    env: process.env,
  });
  child.unref();
  writeFileSync(pidFile, String(child.pid));

  const up = await waitForPort({ shouldAccept: true, timeoutMs: 20000 });
  if (up) {
    console.log(`[pg] started (pid ${child.pid})`);
    process.exit(0);
  }

  console.error("[pg] failed to come up within 20s. Tail of pg.log:");
  try {
    const log = readFileSync(logFile, "utf8");
    console.error(log.split("\n").slice(-30).join("\n"));
  } catch {
    console.error("[pg] (no log available)");
  }
  process.exit(1);
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// Signal the detached `run` process to stop Postgres via its signal handler.
async function stop() {
  if (!existsSync(pidFile)) {
    console.log("[pg] not running");
    process.exit(0);
  }

  const pid = Number(readFileSync(pidFile, "utf8").trim());
  if (!pid || !isProcessAlive(pid)) {
    console.log("[pg] not running");
    try {
      unlinkSync(pidFile);
    } catch {
      /* ignore */
    }
    process.exit(0);
  }

  try {
    process.kill(pid, "SIGTERM");
  } catch {
    /* already gone */
  }

  const down = await waitForPort({ shouldAccept: false, timeoutMs: 20000 });
  try {
    unlinkSync(pidFile);
  } catch {
    /* ignore */
  }

  if (down) {
    console.log("[pg] stopped");
    process.exit(0);
  }
  console.error("[pg] still accepting connections after 20s");
  process.exit(1);
}

const command = process.argv[2];

switch (command) {
  case "run":
    await run();
    break;
  case "start":
    await start();
    break;
  case "stop":
    await stop();
    break;
  default:
    console.error("Usage: node scripts/pg.mjs <run|start|stop>");
    process.exit(1);
}
