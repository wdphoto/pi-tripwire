import { createHash } from "node:crypto";

export function deriveTripwireSessionId(input: { sessionFile?: string; cwd: string; pid?: number }): string {
  const raw = input.sessionFile
    ? `session:${input.sessionFile}`
    : `process:${input.pid ?? process.pid}:cwd:${input.cwd}`;
  return createHash("sha256").update(raw).digest("hex").slice(0, 24);
}
