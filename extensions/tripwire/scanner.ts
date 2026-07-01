import { LsofScanner } from "./lsof.ts";
import { SsScanner } from "./ss.ts";
import type { RawListener, TripwireConfig } from "./types.ts";

export type ScanResult = {
  listeners: RawListener[];
  ok: boolean;
  unavailable?: boolean;
};

export interface ListenerScanner {
  scan(signal?: AbortSignal): Promise<RawListener[]>;
  scanResult?(signal?: AbortSignal): Promise<ScanResult>;
}

export function scanResultFromListeners(listeners: RawListener[]): ScanResult {
  return { listeners, ok: true };
}

export function dedupeListeners(listeners: RawListener[]): RawListener[] {
  const seen = new Set<string>();
  const deduped: RawListener[] = [];

  for (const listener of listeners) {
    const key = [listener.pid, listener.protocol, listener.host ?? "", listener.port].join(":");
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(listener);
  }

  return deduped;
}

export class DefaultListenerScanner implements ListenerScanner {
  private readonly lsof: ListenerScanner;
  private readonly ss: ListenerScanner | undefined;

  constructor(
    config: Pick<TripwireConfig, "scanTimeoutMs">,
    scanners?: { lsof?: ListenerScanner; ss?: ListenerScanner },
  ) {
    this.lsof = scanners?.lsof ?? new LsofScanner(config);
    this.ss = scanners?.ss ?? (process.platform === "linux" ? new SsScanner(config) : undefined);
  }

  async scan(signal?: AbortSignal): Promise<RawListener[]> {
    return (await this.scanResult(signal)).listeners;
  }

  async scanResult(signal?: AbortSignal): Promise<ScanResult> {
    const lsof = await readScanner(this.lsof, signal);
    if (!this.ss) return lsof;

    const ss = await readScanner(this.ss, signal);
    const ok = lsof.ok || ss.ok;
    const unavailable = Boolean(lsof.unavailable && ss.unavailable);
    return {
      listeners: dedupeListeners([...lsof.listeners, ...ss.listeners]),
      ok,
      ...(unavailable ? { unavailable } : {}),
    };
  }
}

async function readScanner(scanner: ListenerScanner, signal?: AbortSignal): Promise<ScanResult> {
  if (scanner.scanResult) return scanner.scanResult(signal);

  try {
    return scanResultFromListeners(await scanner.scan(signal));
  } catch {
    return { listeners: [], ok: false };
  }
}
