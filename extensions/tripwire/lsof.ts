import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScanResult } from "./scanner.ts";
import type { RawListener, TripwireConfig } from "./types.ts";

const execFileAsync = promisify(execFile);

export function scanResultFromLsofError(error: unknown): ScanResult {
  const result = error as { code?: unknown; stdout?: unknown; stderr?: unknown };

  // lsof uses exit code 1, with no output, when the selection matched no files.
  // That is a successful empty inventory rather than a scanner failure.
  if (result.code === 1 && result.stdout === "" && result.stderr === "") {
    return { listeners: [], ok: true };
  }

  return {
    listeners: [],
    ok: false,
    ...(result.code === "ENOENT" ? { unavailable: true } : {}),
  };
}

export function parseLsofListeners(output: string): RawListener[] {
  const listeners: RawListener[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("COMMAND ")) continue;

    const fields = trimmed.split(/\s+/);
    const command = fields[0];
    const pidText = fields[1];
    if (!command || !pidText) continue;

    const pid = Number.parseInt(pidText, 10);
    if (!Number.isInteger(pid) || pid <= 0) continue;

    const addr = trimmed.match(/\bTCP\s+(.+):(\d+)\s+\(LISTEN\)$/);
    if (!addr) continue;

    const host = addr[1];
    const port = Number.parseInt(addr[2] ?? "", 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) continue;

    listeners.push({
      pid,
      command,
      port,
      ...(host ? { host } : {}),
      protocol: "tcp",
    });
  }

  return listeners;
}

export class LsofScanner {
  constructor(private readonly config: Pick<TripwireConfig, "scanTimeoutMs">) {}

  async scan(signal?: AbortSignal): Promise<RawListener[]> {
    return (await this.scanResult(signal)).listeners;
  }

  async scanResult(signal?: AbortSignal): Promise<ScanResult> {
    try {
      const { stdout } = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
        timeout: this.config.scanTimeoutMs,
        maxBuffer: 1024 * 1024,
        ...(signal ? { signal } : {}),
      });
      return { listeners: parseLsofListeners(stdout), ok: true };
    } catch (error) {
      return scanResultFromLsofError(error);
    }
  }
}
