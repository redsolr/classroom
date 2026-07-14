/**
 * Dev-server preflight: class-room is pinned to :3020 (WorkOS
 * redirect URIs and backend CORS are registered against this port), so
 * `next dev -p 3020` must not silently fall back the way web-app's
 * portless `next dev` does. But Next's failure mode for a pinned port
 * is a raw EADDRINUSE stack with no owner and no remedy. This preflight
 * resolves who holds the port and prints the exact kill command.
 *
 * Deliberately does NOT kill (unlike the e2e port preflights in the
 * sibling repos): at dev time the occupant is usually a server someone
 * started on purpose — telling you what holds the port beats murdering it.
 *
 * No dependencies; wired as the `predev` / `predev:mock` npm hooks.
 */

import { execSync } from "node:child_process";

const PORT = 3020;

function listeningPids(port) {
  const pids = new Set();
  try {
    if (process.platform === "win32") {
      const out = execSync(
        `netstat -ano -p tcp | findstr LISTENING | findstr :${port}`,
        { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
      );
      for (const line of out.split(/\r?\n/)) {
        const m = line
          .trim()
          .match(/^TCP\s+\S+:(\d+)\s+\S+\s+LISTENING\s+(\d+)$/);
        if (m && Number(m[1]) === port) pids.add(Number(m[2]));
      }
    } else {
      const out = execSync(`lsof -ti tcp:${port} -s tcp:listen`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      for (const line of out.split(/\r?\n/)) {
        if (line.trim()) pids.add(Number(line.trim()));
      }
    }
  } catch {
    // Non-zero exit = no matches = port free. That's the happy path.
  }
  pids.delete(0); // PID 0 shows up for TIME_WAIT noise on Windows; never kill it.
  return [...pids];
}

function processName(pid) {
  try {
    if (process.platform === "win32") {
      const out = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
      });
      const m = out.match(/^"([^"]+)"/);
      return m ? m[1] : "unknown";
    }
    return execSync(`ps -p ${pid} -o comm=`, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

const pids = listeningPids(PORT);
if (pids.length === 0) {
  process.exit(0);
}

console.error(`\n[dev preflight] Port ${PORT} is already in use:`);
for (const pid of pids) {
  console.error(`  PID ${pid} — ${processName(pid)}`);
}
console.error("\nKill it with:");
for (const pid of pids) {
  console.error(
    process.platform === "win32"
      ? `  taskkill /PID ${pid} /T /F`
      : `  kill -9 ${pid}`,
  );
}
console.error(
  `\n(class-room must run on :${PORT} — auth redirects and CORS are registered against it, so no port fallback.)\n`,
);
process.exit(1);
