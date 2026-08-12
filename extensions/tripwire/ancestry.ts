import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function parseProcessParents(output: string): Map<number, number> {
  const parents = new Map<number, number>();

  for (const line of output.split("\n")) {
    const fields = line.trim().split(/\s+/);
    if (fields.length < 2) continue;

    const pid = Number.parseInt(fields[0] ?? "", 10);
    const ppid = Number.parseInt(fields[1] ?? "", 10);
    if (Number.isInteger(pid) && pid > 0 && Number.isInteger(ppid) && ppid >= 0) {
      parents.set(pid, ppid);
    }
  }

  return parents;
}

export function isDescendant(pid: number, rootPid: number, parents: Map<number, number>): boolean {
  const seen = new Set<number>();
  let current = pid;

  while (current > 0 && !seen.has(current)) {
    if (current === rootPid) return true;
    seen.add(current);
    current = parents.get(current) ?? 0;
  }

  return false;
}

export function descendantsAmong(
  pids: number[],
  rootPid: number,
  parents: Map<number, number>,
): Set<number> {
  return new Set(pids.filter((pid) => isDescendant(pid, rootPid, parents)));
}

/** Best-effort ancestry lookup for listener candidates. */
export async function readDescendantListeners(
  pids: number[],
  rootPid = process.pid,
  timeoutMs = 1_000,
  signal?: AbortSignal,
): Promise<Set<number>> {
  if (process.platform === "win32" || signal?.aborted) return new Set();

  const candidates = [...new Set(pids)].filter((pid) => Number.isInteger(pid) && pid > 0);
  if (candidates.length === 0) return new Set();

  try {
    const { stdout } = await execFileAsync("ps", ["-axo", "pid=,ppid="], {
      timeout: timeoutMs,
      maxBuffer: 512 * 1024,
      ...(signal ? { signal } : {}),
    });
    return descendantsAmong(candidates, rootPid, parseProcessParents(stdout));
  } catch {
    return new Set();
  }
}
