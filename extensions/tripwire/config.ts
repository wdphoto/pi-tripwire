import type { TripwireConfig } from "./types.ts";

export const DEFAULT_CONFIG: TripwireConfig = {
  refreshMs: 10_000,
  refreshDebounceMs: 250,
  scanTimeoutMs: 3_000,
  pidSnapshotTimeoutMs: 500,
  maxFooterItems: 5,
  maxLabelWidth: 24,
  statusKey: "tripwire",
  enablePidSnapshotFallback: false,
  enableCommandPreludeFallback: false,
  includeProjectListeners: true,
  includeExternalListeners: true,
};

export const TRIPWIRE_ENV = {
  session: "PI_TRIPWIRE_SESSION",
  actor: "PI_TRIPWIRE_ACTOR",
} as const;

export const DEV_COMMANDS = new Set([
  "astro",
  "bun",
  "caddy",
  "cargo",
  "deno",
  "go",
  "hugo",
  "java",
  "next",
  "ngrok",
  "node",
  "npm",
  "npx",
  "php",
  "pnpm",
  "python",
  "python3",
  "ruby",
  "serve",
  "vite",
  "yarn",
]);
