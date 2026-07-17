import assert from "node:assert/strict";
import test from "node:test";
import { classifyListeners, isLocalHost, isUnderPath, labelForCommand } from "./classify.ts";
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

test("isUnderPath matches the root and its descendants", () => {
  assert.equal(isUnderPath("/repo", "/repo"), true);
  assert.equal(isUnderPath("/repo/site", "/repo"), true);
  assert.equal(isUnderPath("/repo-other", "/repo"), false);
  assert.equal(isUnderPath("/other", "/repo"), false);
  assert.equal(isUnderPath("/repo", "/repo/"), true);
  assert.equal(isUnderPath("/repo", ""), false);
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
    tracked.map((entry) => ({ label: entry.label, port: entry.port, origin: entry.origin, source: entry.source })),
    [
      { label: "hugo", port: 1313, origin: "agent", source: "env" },
      { label: "python", port: 8000, origin: "agent", source: "pid-snapshot" },
    ],
  );
});

test("classifyListeners marks project listeners by process cwd", () => {
  const listeners: RawListener[] = [
    { pid: 1, command: "hugo", port: 1313, protocol: "tcp" },
    { pid: 2, command: "hugo", port: 1314, protocol: "tcp" },
    { pid: 3, command: "unknownthing", port: 9999, protocol: "tcp" },
  ];

  const tracked = classifyListeners({
    listeners,
    markers: new Map(),
    agentPids: new Set(),
    sessionId: "current",
    projectRoot: "/repo",
    cwds: new Map([
      [1, "/repo/site"],
      [2, "/elsewhere"],
      [3, "/repo"],
    ]),
    includeProjectListeners: true,
    includeExternalListeners: false,
  });

  assert.deepEqual(
    tracked.map((entry) => ({ label: entry.label, port: entry.port, origin: entry.origin, source: entry.source })),
    [
      { label: "hugo", port: 1313, origin: "project", source: "cwd" },
      { label: "unknownthing", port: 9999, origin: "project", source: "cwd" },
    ],
  );
});

test("classifyListeners marks external dev servers by command name", () => {
  const listeners: RawListener[] = [
    { pid: 1, command: "hugo", port: 1313, protocol: "tcp" },
    { pid: 2, command: "Discord", port: 6463, protocol: "tcp" },
  ];

  const tracked = classifyListeners({
    listeners,
    markers: new Map(),
    agentPids: new Set(),
    sessionId: "current",
    includeProjectListeners: false,
    includeExternalListeners: true,
  });

  assert.deepEqual(
    tracked.map((entry) => ({ label: entry.label, port: entry.port, origin: entry.origin, source: entry.source })),
    [{ label: "hugo", port: 1313, origin: "external", source: "dev-command" }],
  );
});

test("agent attribution wins over project/external and sorts first", () => {
  const listeners: RawListener[] = [
    { pid: 1, command: "hugo", port: 1313, protocol: "tcp" },
    { pid: 2, command: "hugo", port: 1313, protocol: "tcp" },
    { pid: 3, command: "node", port: 5173, protocol: "tcp" },
  ];

  const tracked = classifyListeners({
    listeners,
    markers: new Map([[2, { session: "current", actor: "agent" }]]),
    agentPids: new Set(),
    sessionId: "current",
    projectRoot: "/repo",
    cwds: new Map([
      [1, "/repo"],
      [2, "/repo"],
    ]),
    includeProjectListeners: true,
    includeExternalListeners: true,
  });

  assert.deepEqual(
    tracked.map((entry) => ({ pid: entry.pid, label: entry.label, port: entry.port, origin: entry.origin })),
    [
      { pid: 2, label: "hugo", port: 1313, origin: "agent" },
      { pid: 3, label: "node", port: 5173, origin: "external" },
    ],
  );
});
