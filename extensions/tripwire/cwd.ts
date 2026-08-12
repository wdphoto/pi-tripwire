import { execFile } from "node:child_process";
import { readlink } from "node:fs/promises";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const MAX_CWD_PIDS = 64;

/**
 * Parse `lsof -a -p <pids> -d cwd -Fn` field output into pid -> cwd.
 *
 * Output shape per process:
 *   p<pid>
 *   fcwd
 *   n<path>
 */
export function parseLsofCwdOutput(output: string): Map<number, string> {
  const cwds = new Map<number, string>();
  let currentPid: number | undefined;
  let inCwdRecord = false;

  for (const line of output.split("\n")) {
    if (line.startsWith("p")) {
      const pid = Number.parseInt(line.slice(1), 10);
      currentPid = Number.isInteger(pid) && pid > 0 ? pid : undefined;
      inCwdRecord = false;
      continue;
    }
    if (line === "fcwd") {
      inCwdRecord = true;
      continue;
    }
    if (line.startsWith("f")) {
      inCwdRecord = false;
      continue;
    }
    if (inCwdRecord && line.startsWith("n") && currentPid !== undefined && !cwds.has(currentPid)) {
      const path = line.slice(1);
      if (path) cwds.set(currentPid, path);
    }
  }

  return cwds;
}

async function readProcessCwdsViaProc(pids: number[], signal?: AbortSignal): Promise<Map<number, string>> {
  const entries = await Promise.all(
    pids.map(async (pid): Promise<readonly [number, string] | undefined> => {
      if (signal?.aborted) return undefined;
      try {
        const cwd = await readlink(`/proc/${pid}/cwd`);
        return cwd ? ([pid, cwd] as const) : undefined;
      } catch {
        return undefined;
      }
    }),
  );

  const cwds = new Map<number, string>();
  for (const entry of entries) {
    if (entry) cwds.set(entry[0], entry[1]);
  }
  return cwds;
}

async function readProcessCwdsViaLsof(
  pids: number[],
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  try {
    const { stdout } = await execFileAsync("lsof", ["-a", "-p", pids.join(","), "-d", "cwd", "-Fn"], {
      timeout: timeoutMs,
      maxBuffer: 256 * 1024,
      ...(signal ? { signal } : {}),
    });
    return parseLsofCwdOutput(stdout);
  } catch (error) {
    // lsof exits non-zero when a pid vanished mid-scan; it may still emit
    // partial field output on stdout, which is better than nothing.
    const stdout = (error as { stdout?: string }).stdout;
    if (typeof stdout === "string" && stdout) return parseLsofCwdOutput(stdout);
    return new Map();
  }
}

/** Best-effort cwd lookup for listener processes. Missing pids are simply absent. */
export async function readProcessCwds(
  pids: number[],
  timeoutMs = 1_000,
  signal?: AbortSignal,
): Promise<Map<number, string>> {
  const unique = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0).slice(0, MAX_CWD_PIDS);
  if (unique.length === 0) return new Map();

  if (signal?.aborted) return new Map();
  if (process.platform === "linux") return readProcessCwdsViaProc(unique, signal);
  return readProcessCwdsViaLsof(unique, timeoutMs, signal);
}
