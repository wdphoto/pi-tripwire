import assert from "node:assert/strict";
import test from "node:test";
import { parseTripwireEnvText } from "./env.ts";

test("parseTripwireEnvText reads NUL-separated process env", () => {
  const text = "A=1\0PI_TRIPWIRE_SESSION=current\0PI_TRIPWIRE_ACTOR=agent\0PI_TRIPWIRE_CWD=/repo\0";

  assert.deepEqual(parseTripwireEnvText(text), {
    session: "current",
    actor: "agent",
    cwd: "/repo",
  });
});

test("parseTripwireEnvText reads ps-style whitespace env", () => {
  const text = "node server.js PI_TRIPWIRE_SESSION=current PI_TRIPWIRE_ACTOR=agent PI_TRIPWIRE_CWD=/repo";

  assert.deepEqual(parseTripwireEnvText(text), {
    session: "current",
    actor: "agent",
    cwd: "/repo",
  });
});

test("parseTripwireEnvText ignores non-agent actors", () => {
  const text = "PI_TRIPWIRE_SESSION=current PI_TRIPWIRE_ACTOR=user PI_TRIPWIRE_CWD=/repo";

  assert.deepEqual(parseTripwireEnvText(text), {
    session: "current",
    cwd: "/repo",
  });
});
