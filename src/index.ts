import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { randomUUID } from "node:crypto";
import { classifyListeners } from "./classify.js";
import { DEFAULT_CONFIG, TRIPWIRE_ENV } from "./config.js";
import { readTripwireMarker } from "./env.js";
import { formatFooterStatus } from "./format.js";
import { LsofScanner } from "./lsof.js";
import { diffPids, pruneDeadPids, snapshotPids } from "./process.js";
import { buildExportPrelude } from "./shell.js";
import type { TripwireMarker } from "./types.js";

export default function tripwire(pi: ExtensionAPI) {
  const config = DEFAULT_CONFIG;
  const scanner = new LsofScanner(config);

  let sessionId = randomUUID();
  let interval: ReturnType<typeof setInterval> | undefined;
  let disposed = false;
  let refreshInFlight = false;

  const pendingSnapshots = new Map<string, Set<number>>();
  const agentPids = new Set<number>();

  async function refresh(ctx: ExtensionContext): Promise<void> {
    if (disposed || refreshInFlight || !ctx.hasUI) return;
    refreshInFlight = true;

    try {
      const [listeners, livePids] = await Promise.all([scanner.scan(), snapshotPids()]);
      pruneDeadPids(agentPids, livePids);

      const pids = [...new Set(listeners.map((listener) => listener.pid))];
      const markerEntries = await Promise.all(
        pids.map(async (pid): Promise<[number, TripwireMarker]> => [pid, await readTripwireMarker(pid)]),
      );
      const markers = new Map(markerEntries);

      const tracked = classifyListeners({ listeners, markers, agentPids, sessionId });
      ctx.ui.setStatus(config.statusKey, formatFooterStatus(tracked, ctx.ui.theme, config));
    } finally {
      refreshInFlight = false;
    }
  }

  function scheduleRefresh(ctx: ExtensionContext, delayMs = 250): void {
    setTimeout(() => void refresh(ctx), delayMs).unref?.();
  }

  pi.on("session_start", (_event, ctx) => {
    disposed = false;
    sessionId = randomUUID();
    pendingSnapshots.clear();
    agentPids.clear();

    if (interval) clearInterval(interval);
    if (!ctx.hasUI) return;

    void refresh(ctx);
    interval = setInterval(() => void refresh(ctx), config.refreshMs);
    interval.unref?.();
  });

  pi.on("tool_call", async (event, ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    pendingSnapshots.set(event.toolCallId, await snapshotPids());

    const prelude = buildExportPrelude({
      [TRIPWIRE_ENV.session]: sessionId,
      [TRIPWIRE_ENV.actor]: "agent",
      [TRIPWIRE_ENV.cwd]: ctx.cwd,
    });

    if (!event.input.command.includes(TRIPWIRE_ENV.session)) {
      event.input.command = `${prelude}${event.input.command}`;
    }

    scheduleRefresh(ctx);
  });

  pi.on("tool_result", async (event, ctx) => {
    if (event.toolName !== "bash") return;

    const before = pendingSnapshots.get(event.toolCallId);
    pendingSnapshots.delete(event.toolCallId);
    if (!before) return;

    const after = await snapshotPids();
    for (const pid of diffPids(before, after)) agentPids.add(pid);
    scheduleRefresh(ctx, 100);
  });

  pi.on("session_shutdown", (_event, ctx) => {
    disposed = true;
    pendingSnapshots.clear();
    agentPids.clear();

    if (interval) clearInterval(interval);
    interval = undefined;

    if (ctx.hasUI) ctx.ui.setStatus(config.statusKey, undefined);
  });
}
