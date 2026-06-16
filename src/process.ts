import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function snapshotPids(timeoutMs = 2_000): Promise<Set<number>> {
  try {
    const { stdout } = await execFileAsync("ps", ["-A", "-o", "pid="], { timeout: timeoutMs });
    const pids = new Set<number>();
    for (const line of stdout.split("\n")) {
      const pid = Number.parseInt(line.trim(), 10);
      if (Number.isInteger(pid) && pid > 0) pids.add(pid);
    }
    return pids;
  } catch {
    return new Set();
  }
}

export function diffPids(before: Set<number>, after: Set<number>): Set<number> {
  const added = new Set<number>();
  for (const pid of after) {
    if (!before.has(pid)) added.add(pid);
  }
  return added;
}

export function pruneDeadPids(tracked: Set<number>, live: Set<number>): void {
  for (const pid of tracked) {
    if (!live.has(pid)) tracked.delete(pid);
  }
}
