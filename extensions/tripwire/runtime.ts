import type { ExtensionAPI, ExtensionContext, SourceInfo, ToolCallEvent, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { createBashTool, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { classifyListeners } from "./classify.ts";
import { DEFAULT_CONFIG, TRIPWIRE_ENV } from "./config.ts";
import { readTripwireMarker } from "./env.ts";
import { formatFooterStatus } from "./format.ts";
import { diffPids, pruneDeadPids, snapshotPids } from "./process.ts";
import { DefaultListenerScanner, type ListenerScanner } from "./scanner.ts";
import { deriveTripwireSessionId } from "./session.ts";
import { buildExportPrelude } from "./shell.ts";
import type { TripwireConfig, TripwireMarker } from "./types.ts";

type BashInjectionMode = "none" | "spawn-hook" | "command-prelude";
type MarkerReader = (pid: number) => Promise<TripwireMarker>;

function sourceKey(sourceInfo: SourceInfo | undefined): string {
  if (!sourceInfo) return "";
  return [sourceInfo.source, sourceInfo.scope, sourceInfo.origin, sourceInfo.path].join("\0");
}

export class TripwireRuntime {
  private sessionId = "";
  private interval: ReturnType<typeof setInterval> | undefined;
  private refreshTimer: ReturnType<typeof setTimeout> | undefined;
  private sessionAbortController: AbortController | undefined;
  private disposed = true;
  private enabled = false;
  private bashInjectionMode: BashInjectionMode = "none";
  private ownedBashSourceKey = "";
  private refreshInFlight = false;
  private refreshQueued = false;
  private sessionGeneration = 0;
  private readonly defaultScanner: ListenerScanner;

  private readonly pendingSnapshots = new Map<string, Set<number>>();
  private readonly agentPids = new Set<number>();

  constructor(
    private readonly options: {
      pi: ExtensionAPI;
      config?: TripwireConfig;
      scanner?: ListenerScanner;
      readMarker?: MarkerReader;
    },
  ) {
    this.defaultScanner = options.scanner ?? new DefaultListenerScanner(this.config);
  }

  get config(): TripwireConfig {
    return this.options.config ?? DEFAULT_CONFIG;
  }

  start(ctx: ExtensionContext): void {
    this.disposed = false;
    this.enabled = ctx.hasUI;
    this.bashInjectionMode = "none";
    this.ownedBashSourceKey = "";
    this.sessionGeneration++;
    this.sessionAbortController?.abort();
    this.sessionAbortController = new AbortController();
    this.sessionId = this.deriveSessionId(ctx);
    this.pendingSnapshots.clear();
    this.agentPids.clear();
    this.refreshQueued = false;

    this.clearInterval();
    this.clearScheduledRefresh();
    if (!this.enabled) return;

    this.installBashAttribution(ctx);
    void this.refresh(ctx);
    this.interval = setInterval(() => void this.refresh(ctx), this.config.refreshMs);
    this.interval.unref?.();
  }

  stop(ctx: ExtensionContext): void {
    this.disposed = true;
    this.enabled = false;
    this.bashInjectionMode = "none";
    this.ownedBashSourceKey = "";
    this.sessionGeneration++;
    this.refreshQueued = false;
    this.sessionAbortController?.abort();
    this.sessionAbortController = undefined;
    this.pendingSnapshots.clear();
    this.agentPids.clear();

    this.clearInterval();
    this.clearScheduledRefresh();

    if (ctx.hasUI) ctx.ui.setStatus(this.config.statusKey, undefined);
  }

  async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<void> {
    if (!this.enabled || event.toolName !== "bash") return;

    if (this.config.enablePidSnapshotFallback) {
      this.pendingSnapshots.set(event.toolCallId, await snapshotPids(this.config.pidSnapshotTimeoutMs));
    }

    if (this.shouldUseCommandPrelude() && isToolCallEventType("bash", event)) {
      this.applyCommandPrelude(event.input.command, ctx, (command) => {
        event.input.command = command;
      });
    }

    this.scheduleRefresh(ctx);
  }

  async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
    if (!this.enabled || !this.config.enablePidSnapshotFallback || event.toolName !== "bash") return;

    const before = this.pendingSnapshots.get(event.toolCallId);
    this.pendingSnapshots.delete(event.toolCallId);
    if (!before) return;

    const after = await snapshotPids(this.config.pidSnapshotTimeoutMs);
    for (const pid of diffPids(before, after)) this.agentPids.add(pid);
    this.scheduleRefresh(ctx, 100);
  }

  private get scanner(): ListenerScanner {
    return this.defaultScanner;
  }

  private get readMarker(): MarkerReader {
    return this.options.readMarker ?? readTripwireMarker;
  }

  private async refresh(ctx: ExtensionContext): Promise<void> {
    if (this.disposed || !this.enabled || !ctx.hasUI) return;
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }

    this.refreshInFlight = true;
    const generation = this.sessionGeneration;

    try {
      const listeners = await this.scanner.scan(this.sessionAbortController?.signal);
      if (this.config.enablePidSnapshotFallback && this.agentPids.size > 0) pruneDeadPids(this.agentPids);

      const pids = [...new Set(listeners.map((listener) => listener.pid))];
      const markerEntries = await Promise.all(
        pids.map(async (pid): Promise<[number, TripwireMarker]> => [pid, await this.readMarker(pid)]),
      );
      const markers = new Map(markerEntries);

      if (this.disposed || generation !== this.sessionGeneration) return;
      const tracked = classifyListeners({ listeners, markers, agentPids: this.agentPids, sessionId: this.sessionId });
      ctx.ui.setStatus(this.config.statusKey, formatFooterStatus(tracked, ctx.ui.theme, this.config));
    } finally {
      this.refreshInFlight = false;
      if (this.refreshQueued && !this.disposed && this.enabled && generation === this.sessionGeneration) {
        this.refreshQueued = false;
        this.scheduleRefresh(ctx, 0);
      }
    }
  }

  private installBashAttribution(ctx: ExtensionContext): void {
    if (!this.activeBashIsBuiltin()) {
      this.bashInjectionMode = this.config.enableCommandPreludeFallback ? "command-prelude" : "none";
      return;
    }

    const bashTool = createBashTool(ctx.cwd, {
      spawnHook: ({ command, cwd, env }) => ({
        command,
        cwd,
        env: {
          ...env,
          [TRIPWIRE_ENV.session]: this.sessionId,
          [TRIPWIRE_ENV.actor]: "agent",
          [TRIPWIRE_ENV.cwd]: cwd,
        },
      }),
    });

    this.options.pi.registerTool({
      ...bashTool,
      execute: async (toolCallId, params, signal, onUpdate, _ctx) =>
        bashTool.execute(toolCallId, params, signal, onUpdate),
    });

    this.ownedBashSourceKey = sourceKey(this.activeBashSourceInfo());
    this.bashInjectionMode = this.ownedBashSourceKey ? "spawn-hook" : "none";
  }

  private shouldUseCommandPrelude(): boolean {
    if (this.bashInjectionMode === "command-prelude") return true;
    if (this.bashInjectionMode !== "spawn-hook") return false;
    if (this.activeBashIsOwned()) return false;

    this.bashInjectionMode = this.config.enableCommandPreludeFallback ? "command-prelude" : "none";
    return this.bashInjectionMode === "command-prelude";
  }

  private activeBashIsBuiltin(): boolean {
    return this.activeBashSourceInfo()?.source === "builtin";
  }

  private activeBashIsOwned(): boolean {
    return Boolean(this.ownedBashSourceKey) && sourceKey(this.activeBashSourceInfo()) === this.ownedBashSourceKey;
  }

  private activeBashSourceInfo(): SourceInfo | undefined {
    return this.options.pi.getAllTools().find((tool) => tool.name === "bash")?.sourceInfo;
  }

  private applyCommandPrelude(command: string, ctx: ExtensionContext, setCommand: (command: string) => void): void {
    if (this.hasTripwirePrelude(command)) return;

    const prelude = buildExportPrelude({
      [TRIPWIRE_ENV.session]: this.sessionId,
      [TRIPWIRE_ENV.actor]: "agent",
      [TRIPWIRE_ENV.cwd]: ctx.cwd,
    });
    setCommand(`${prelude}${command}`);
  }

  private hasTripwirePrelude(command: string): boolean {
    return new RegExp(`(^|\\n)\\s*export\\s+${TRIPWIRE_ENV.session}=`).test(command);
  }

  private deriveSessionId(ctx: ExtensionContext): string {
    const sessionFile = ctx.sessionManager.getSessionFile();
    return deriveTripwireSessionId({
      ...(sessionFile ? { sessionFile } : {}),
      cwd: ctx.cwd,
    });
  }

  private clearInterval(): void {
    if (!this.interval) return;
    clearInterval(this.interval);
    this.interval = undefined;
  }

  private clearScheduledRefresh(): void {
    if (!this.refreshTimer) return;
    clearTimeout(this.refreshTimer);
    this.refreshTimer = undefined;
  }

  private scheduleRefresh(ctx: ExtensionContext, delayMs = this.config.refreshDebounceMs): void {
    if (this.disposed || !this.enabled) return;
    if (this.refreshInFlight) {
      this.refreshQueued = true;
      return;
    }

    this.clearScheduledRefresh();
    this.refreshTimer = setTimeout(() => {
      this.refreshTimer = undefined;
      void this.refresh(ctx);
    }, delayMs);
    this.refreshTimer.unref?.();
  }
}
