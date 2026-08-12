import { realpathSync } from "node:fs";
import type { ExtensionAPI, ExtensionContext, SourceInfo, ToolCallEvent, ToolResultEvent } from "@earendil-works/pi-coding-agent";
import { createBashTool } from "@earendil-works/pi-coding-agent";
import { readDescendantListeners } from "./ancestry.ts";
import { classifyListeners, isLocalHost } from "./classify.ts";
import { DEFAULT_CONFIG, TRIPWIRE_ENV } from "./config.ts";
import { readProcessCwds } from "./cwd.ts";
import { readTripwireMarker } from "./env.ts";
import { formatFooterStatus } from "./format.ts";
import { DefaultListenerScanner, type ListenerScanner, type ScanResult } from "./scanner.ts";
import { deriveTripwireSessionId } from "./session.ts";
import type { TripwireConfig, TripwireMarker } from "./types.ts";

type MarkerReader = (pid: number, signal?: AbortSignal) => Promise<TripwireMarker>;
type CwdReader = (pids: number[], signal?: AbortSignal) => Promise<Map<number, string>>;
type AncestryReader = (pids: number[], signal?: AbortSignal) => Promise<ReadonlySet<number>>;

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
  private bashOwnerSourceKey = "";
  private refreshInFlight = false;
  private refreshQueued = false;
  private sessionGeneration = 0;
  private projectRoot = "";
  private readonly defaultScanner: ListenerScanner;

  constructor(
    private readonly options: {
      pi: ExtensionAPI;
      config?: TripwireConfig;
      scanner?: ListenerScanner;
      readMarker?: MarkerReader;
      readCwds?: CwdReader;
      readAncestry?: AncestryReader;
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
    this.bashOwnerSourceKey = "";
    this.sessionGeneration++;
    this.sessionAbortController?.abort();
    this.sessionAbortController = new AbortController();
    this.sessionId = this.deriveSessionId(ctx);
    this.projectRoot = this.resolveProjectRoot(ctx);
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
    this.bashOwnerSourceKey = "";
    this.sessionGeneration++;
    this.refreshQueued = false;
    this.sessionAbortController?.abort();
    this.sessionAbortController = undefined;
    this.projectRoot = "";

    this.clearInterval();
    this.clearScheduledRefresh();

    if (ctx.hasUI) ctx.ui.setStatus(this.config.statusKey, undefined);
  }

  async onToolCall(event: ToolCallEvent, ctx: ExtensionContext): Promise<void> {
    if (!this.enabled || event.toolName !== "bash") return;
    this.scheduleRefresh(ctx);
  }

  async onToolResult(event: ToolResultEvent, ctx: ExtensionContext): Promise<void> {
    if (!this.enabled || event.toolName !== "bash") return;
    this.scheduleRefresh(ctx, 100);
  }

  private get scanner(): ListenerScanner {
    return this.defaultScanner;
  }

  private get readMarker(): MarkerReader {
    return this.options.readMarker ?? readTripwireMarker;
  }

  private get readCwds(): CwdReader {
    return this.options.readCwds ?? ((pids, signal) => readProcessCwds(pids, this.config.scanTimeoutMs, signal));
  }

  private get readAncestry(): AncestryReader {
    return this.options.readAncestry ?? ((pids, signal) => readDescendantListeners(pids, process.pid, this.config.scanTimeoutMs, signal));
  }

  private resolveProjectRoot(ctx: ExtensionContext): string {
    try {
      return realpathSync(ctx.cwd);
    } catch {
      return ctx.cwd;
    }
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
      let scan: ScanResult;
      try {
        scan = this.scanner.scanResult
          ? await this.scanner.scanResult(this.sessionAbortController?.signal)
          : { listeners: await this.scanner.scan(this.sessionAbortController?.signal), ok: true };
      } catch {
        return;
      }
      if (!scan.ok) return;

      const listeners = scan.listeners.filter((listener) => isLocalHost(listener.host));
      const pids = [...new Set(listeners.map((listener) => listener.pid))];
      const signal = this.sessionAbortController?.signal;
      const ancestry = this.bashAttributionIsActive()
        ? Promise.resolve()
            .then(() => this.readAncestry(pids, signal))
            .catch(() => new Set<number>())
        : Promise.resolve(new Set<number>());
      const [markerEntries, ancestryPids] = await Promise.all([
        Promise.all(
          pids.map(
            async (pid): Promise<[number, TripwireMarker]> => {
              try {
                return [pid, await this.readMarker(pid, signal)];
              } catch {
                return [pid, {}];
              }
            },
          ),
        ),
        ancestry,
      ]);
      const markers = new Map(markerEntries);

      if (this.disposed || generation !== this.sessionGeneration) return;

      let cwds: Map<number, string> | undefined;
      if (this.config.includeProjectListeners && this.projectRoot) {
        const unattributedPids = pids.filter((pid) => {
          const marker = markers.get(pid);
          return !(marker?.session === this.sessionId && marker.actor === "agent") && !ancestryPids.has(pid);
        });
        if (unattributedPids.length > 0) {
          try {
            cwds = await this.readCwds(unattributedPids, signal);
          } catch {
            cwds = new Map();
          }
        }
        if (this.disposed || generation !== this.sessionGeneration) return;
      }

      const tracked = classifyListeners({
        listeners,
        markers,
        ancestryPids,
        sessionId: this.sessionId,
        projectRoot: this.projectRoot,
        ...(cwds ? { cwds } : {}),
        includeProjectListeners: this.config.includeProjectListeners,
        includeExternalListeners: this.config.includeExternalListeners,
      });
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
    if (!this.activeBashIsBuiltin()) return;

    const bashTool = createBashTool(ctx.cwd, {
      spawnHook: ({ command, cwd, env }) => ({
        command,
        cwd,
        env: {
          ...env,
          [TRIPWIRE_ENV.session]: this.sessionId,
          [TRIPWIRE_ENV.actor]: "agent",
        },
      }),
    });

    this.options.pi.registerTool({
      ...bashTool,
      execute: async (toolCallId, params, signal, onUpdate, _ctx) =>
        bashTool.execute(toolCallId, params, signal, onUpdate),
    });
    this.bashOwnerSourceKey = sourceKey(this.activeBashSourceInfo());
  }

  private bashAttributionIsActive(): boolean {
    return Boolean(this.bashOwnerSourceKey) && sourceKey(this.activeBashSourceInfo()) === this.bashOwnerSourceKey;
  }

  private activeBashIsBuiltin(): boolean {
    return this.activeBashSourceInfo()?.source === "builtin";
  }

  private activeBashSourceInfo(): SourceInfo | undefined {
    return this.options.pi.getAllTools().find((tool) => tool.name === "bash")?.sourceInfo;
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
