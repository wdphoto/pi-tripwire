import type { TripwireConfig } from "./types.ts";

export const DEFAULT_CONFIG: TripwireConfig = {
  refreshMs: 10_000,
  scanTimeoutMs: 3_000,
  maxFooterItems: 5,
  statusKey: "tripwire",
};

export const TRIPWIRE_ENV = {
  session: "PI_TRIPWIRE_SESSION",
  actor: "PI_TRIPWIRE_ACTOR",
  cwd: "PI_TRIPWIRE_CWD",
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
