import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { RawListener, TripwireConfig } from "./types.js";

const execFileAsync = promisify(execFile);

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

  async scan(): Promise<RawListener[]> {
    try {
      const { stdout } = await execFileAsync("lsof", ["-nP", "-iTCP", "-sTCP:LISTEN"], {
        timeout: this.config.scanTimeoutMs,
        maxBuffer: 1024 * 1024,
      });
      return parseLsofListeners(stdout);
    } catch {
      return [];
    }
  }
}
