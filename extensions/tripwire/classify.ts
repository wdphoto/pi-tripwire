import { DEV_COMMANDS } from "./config.ts";
import type { RawListener, TrackedListener, TripwireMarker } from "./types.ts";

export function labelForCommand(command: string): string {
  const base = command.split(/[\\/]/).pop() ?? command;
  const lower = base.toLowerCase();
  if (lower === "python3") return "python";
  return lower;
}

export function listenerUrl(port: number): string {
  return `http://localhost:${port}`;
}

export function isLocalHost(host: string | undefined): boolean {
  if (!host) return true;
  const normalized = host.toLowerCase();
  if (["*", "localhost", "0.0.0.0", "::", "[::]"].includes(normalized)) return true;
  if (normalized === "::1" || normalized === "[::1]") return true;
  return normalized.startsWith("127.");
}

export function classifyListeners(options: {
  listeners: RawListener[];
  markers: Map<number, TripwireMarker>;
  agentPids: Set<number>;
  sessionId: string;
}): TrackedListener[] {
  const tracked: TrackedListener[] = [];
  const seen = new Set<string>();

  for (const listener of options.listeners) {
    if (!isLocalHost(listener.host)) continue;

    const marker = options.markers.get(listener.pid);
    const fromEnv = marker?.session === options.sessionId && marker.actor === "agent";
    const label = labelForCommand(listener.command);
    const fromSnapshot = options.agentPids.has(listener.pid) && DEV_COMMANDS.has(label);

    if (!fromEnv && !fromSnapshot) continue;

    const key = `${label}:${listener.port}`;
    if (seen.has(key)) continue;
    seen.add(key);

    tracked.push({
      ...listener,
      label,
      url: listenerUrl(listener.port),
      ...(marker ? { marker } : {}),
      source: fromEnv ? "env" : "pid-snapshot",
    });
  }

  return tracked.sort((a, b) => a.port - b.port || a.label.localeCompare(b.label));
}
