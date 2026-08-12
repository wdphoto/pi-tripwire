import { isIP } from "node:net";
import { DEV_COMMANDS } from "./config.ts";
import type { ListenerOrigin, RawListener, TrackedListener, TripwireMarker } from "./types.ts";

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

  const normalized = host.trim().toLowerCase().replace(/^\[(.*)\]$/, "$1");
  if (["*", "localhost", "0.0.0.0", "::"].includes(normalized)) return true;
  if (normalized === "::1") return true;

  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return isIP(mappedIpv4) === 4 && mappedIpv4.startsWith("127.");

  return isIP(normalized) === 4 && normalized.startsWith("127.");
}

export function isUnderPath(path: string, root: string): boolean {
  if (!root || root === "/") return root === "/";
  const normalizedRoot = root.endsWith("/") ? root.slice(0, -1) : root;
  return path === normalizedRoot || path.startsWith(`${normalizedRoot}/`);
}

const ORIGIN_PRIORITY: Record<ListenerOrigin, number> = {
  agent: 0,
  project: 1,
  external: 2,
};

export function classifyListeners(options: {
  listeners: RawListener[];
  markers: Map<number, TripwireMarker>;
  ancestryPids?: ReadonlySet<number>;
  sessionId: string;
  projectRoot?: string;
  cwds?: Map<number, string>;
  includeProjectListeners?: boolean;
  includeExternalListeners?: boolean;
}): TrackedListener[] {
  const byKey = new Map<string, TrackedListener>();

  for (const listener of options.listeners) {
    if (!isLocalHost(listener.host)) continue;

    const marker = options.markers.get(listener.pid);
    const label = labelForCommand(listener.command);
    const fromEnv = marker?.session === options.sessionId && marker.actor === "agent";
    const fromAncestry = options.ancestryPids?.has(listener.pid) ?? false;
    const cwd = options.cwds?.get(listener.pid);
    const fromProject =
      Boolean(options.includeProjectListeners) && Boolean(options.projectRoot) && cwd !== undefined &&
      isUnderPath(cwd, options.projectRoot as string);
    const fromExternal = Boolean(options.includeExternalListeners) && DEV_COMMANDS.has(label);

    let candidate: TrackedListener | undefined;
    if (fromEnv || fromAncestry) {
      candidate = {
        ...listener,
        label,
        url: listenerUrl(listener.port),
        origin: "agent",
        source: fromEnv ? "env" : "ancestry",
      };
    } else if (fromProject) {
      candidate = { ...listener, label, url: listenerUrl(listener.port), origin: "project", source: "cwd" };
    } else if (fromExternal) {
      candidate = { ...listener, label, url: listenerUrl(listener.port), origin: "external", source: "dev-command" };
    }
    if (!candidate) continue;

    const key = `${label}:${listener.port}`;
    const existing = byKey.get(key);
    if (!existing || ORIGIN_PRIORITY[candidate.origin] < ORIGIN_PRIORITY[existing.origin]) {
      byKey.set(key, candidate);
    }
  }

  return [...byKey.values()].sort(
    (a, b) => ORIGIN_PRIORITY[a.origin] - ORIGIN_PRIORITY[b.origin] || a.port - b.port || a.label.localeCompare(b.label),
  );
}
