export type TripwireActor = "agent";

export type RawListener = {
  pid: number;
  command: string;
  port: number;
  host?: string;
  protocol: "tcp";
};

export type TripwireMarker = {
  session?: string;
  actor?: TripwireActor;
};

export type ListenerOrigin = "agent" | "project" | "external";

export type AttributionSource = "env" | "ancestry" | "cwd" | "dev-command";

export type TrackedListener = RawListener & {
  label: string;
  url: string;
  origin: ListenerOrigin;
  source: AttributionSource;
};

export type TripwireConfig = {
  refreshMs: number;
  refreshDebounceMs: number;
  scanTimeoutMs: number;
  maxFooterItems: number;
  maxLabelWidth: number;
  statusKey: string;
  includeProjectListeners: boolean;
  includeExternalListeners: boolean;
};
