import { readFile } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { TRIPWIRE_ENV } from "./config.ts";
import type { TripwireMarker } from "./types.ts";

const execFileAsync = promisify(execFile);

export function parseTripwireEnvText(text: string): TripwireMarker {
  const marker: TripwireMarker = {};

  const pairs = text.includes("\0") ? text.split("\0") : text.split(/\s+/);
  for (const pair of pairs) {
    const index = pair.indexOf("=");
    if (index <= 0) continue;

    const key = pair.slice(0, index);
    const value = pair.slice(index + 1);
    if (key === TRIPWIRE_ENV.session && value) marker.session = value;
    if (key === TRIPWIRE_ENV.actor && value === "agent") marker.actor = "agent";
  }

  return marker;
}

export async function readTripwireMarker(pid: number): Promise<TripwireMarker> {
  if (process.platform === "linux") {
    try {
      const text = await readFile(`/proc/${pid}/environ`, "utf8");
      return parseTripwireEnvText(text);
    } catch {
      // Fall through to ps fallback below.
    }
  }

  try {
    // BSD/macOS ps can expose environment with the e flag. This is best-effort.
    const { stdout } = await execFileAsync("ps", ["eww", "-p", String(pid), "-o", "command="], {
      timeout: 1_000,
      maxBuffer: 256 * 1024,
    });
    return parseTripwireEnvText(stdout);
  } catch {
    return {};
  }
}
