import assert from "node:assert/strict";
import test from "node:test";
import { classifyListeners, isLocalHost, labelForCommand } from "./classify.ts";
import type { RawListener, TripwireMarker } from "./types.ts";

test("labelForCommand normalizes common command names", () => {
  assert.equal(labelForCommand("/usr/bin/python3"), "python");
  assert.equal(labelForCommand("Hugo"), "hugo");
});

test("isLocalHost accepts loopback and wildcard binds", () => {
  assert.equal(isLocalHost(undefined), true);
  assert.equal(isLocalHost("127.0.0.1"), true);
  assert.equal(isLocalHost("127.1.2.3"), true);
  assert.equal(isLocalHost("::1"), true);
  assert.equal(isLocalHost("[::1]"), true);
  assert.equal(isLocalHost("0.0.0.0"), true);
  assert.equal(isLocalHost("*"), true);
  assert.equal(isLocalHost("192.168.1.20"), false);
});

test("classifyListeners keeps only current-session agent listeners", () => {
  const listeners: RawListener[] = [
    { pid: 1, command: "hugo", port: 1313, protocol: "tcp" },
    { pid: 2, command: "node", port: 5173, protocol: "tcp" },
    { pid: 3, command: "python3", port: 8000, protocol: "tcp" },
    { pid: 4, command: "ruby", port: 4567, protocol: "tcp" },
    { pid: 5, command: "node", host: "192.168.1.20", port: 3000, protocol: "tcp" },
  ];
  const markers = new Map<number, TripwireMarker>([
    [1, { session: "current", actor: "agent" }],
    [2, { session: "other", actor: "agent" }],
    [5, { session: "current", actor: "agent" }],
  ]);

  const tracked = classifyListeners({
    listeners,
    markers,
    agentPids: new Set([3]),
    sessionId: "current",
  });

  assert.deepEqual(
    tracked.map((entry) => ({ label: entry.label, port: entry.port, source: entry.source })),
    [
      { label: "hugo", port: 1313, source: "env" },
      { label: "python", port: 8000, source: "pid-snapshot" },
    ],
  );
});
