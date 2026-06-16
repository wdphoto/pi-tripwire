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
  cwd?: string;
};

export type TrackedListener = RawListener & {
  label: string;
  url: string;
  marker?: TripwireMarker;
  source: "env" | "pid-snapshot";
};

export type TripwireConfig = {
  refreshMs: number;
  scanTimeoutMs: number;
  maxFooterItems: number;
  statusKey: string;
};
