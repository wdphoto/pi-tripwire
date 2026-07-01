import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ScanResult } from "./scanner.ts";
import type { RawListener, TripwireConfig } from "./types.ts";

const execFileAsync = promisify(execFile);

function parseAddressPort(value: string): { host?: string; port: number } | undefined {
  const bracketed = value.match(/^\[(.*)\]:(\d+)$/);
  if (bracketed) {
    const port = Number.parseInt(bracketed[2] ?? "", 10);
    if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined;
    const host = bracketed[1];
    return { ...(host ? { host } : {}), port };
  }

  const index = value.lastIndexOf(":");
  if (index <= 0) return undefined;

  const host = value.slice(0, index);
  const port = Number.parseInt(value.slice(index + 1), 10);
  if (!Number.isInteger(port) || port <= 0 || port > 65_535) return undefined;

  return { ...(host ? { host } : {}), port };
}

export function parseSsListeners(output: string): RawListener[] {
  const listeners: RawListener[] = [];

  for (const line of output.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || !trimmed.startsWith("LISTEN")) continue;

    const fields = trimmed.split(/\s+/);
    const localAddress = fields[3];
    if (!localAddress) continue;

    const address = parseAddressPort(localAddress);
    if (!address) continue;

    const user = trimmed.match(/users:\(\("([^"]+)",pid=(\d+),fd=\d+\)/);
    if (!user) continue;

    const command = user[1];
    const pid = Number.parseInt(user[2] ?? "", 10);
    if (!command || !Number.isInteger(pid) || pid <= 0) continue;

    listeners.push({
      pid,
      command,
      port: address.port,
      ...(address.host ? { host: address.host } : {}),
      protocol: "tcp",
    });
  }

  return listeners;
}

export class SsScanner {
  constructor(private readonly config: Pick<TripwireConfig, "scanTimeoutMs">) {}

  async scan(signal?: AbortSignal): Promise<RawListener[]> {
    return (await this.scanResult(signal)).listeners;
  }

  async scanResult(signal?: AbortSignal): Promise<ScanResult> {
    try {
      const { stdout } = await execFileAsync("ss", ["-H", "-ltnp"], {
        timeout: this.config.scanTimeoutMs,
        maxBuffer: 1024 * 1024,
        ...(signal ? { signal } : {}),
      });
      return { listeners: parseSsListeners(stdout), ok: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      return { listeners: [], ok: false, ...(code === "ENOENT" ? { unavailable: true } : {}) };
    }
  }
}
