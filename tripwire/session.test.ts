import assert from "node:assert/strict";
import test from "node:test";
import { deriveTripwireSessionId } from "./session.ts";

test("deriveTripwireSessionId is stable for a Pi session file", () => {
  assert.equal(
    deriveTripwireSessionId({ sessionFile: "/tmp/pi-session.jsonl", cwd: "/a" }),
    deriveTripwireSessionId({ sessionFile: "/tmp/pi-session.jsonl", cwd: "/b" }),
  );
});

test("deriveTripwireSessionId changes across Pi session files", () => {
  assert.notEqual(
    deriveTripwireSessionId({ sessionFile: "/tmp/pi-session-a.jsonl", cwd: "/a" }),
    deriveTripwireSessionId({ sessionFile: "/tmp/pi-session-b.jsonl", cwd: "/a" }),
  );
});

test("deriveTripwireSessionId has deterministic fallback for ephemeral sessions", () => {
  assert.equal(
    deriveTripwireSessionId({ cwd: "/repo", pid: 123 }),
    deriveTripwireSessionId({ cwd: "/repo", pid: 123 }),
  );
});
