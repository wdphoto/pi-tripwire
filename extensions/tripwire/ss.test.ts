import assert from "node:assert/strict";
import test from "node:test";
import { parseSsListeners } from "./ss.ts";

test("parseSsListeners parses Linux ss LISTEN rows", () => {
  const output = `LISTEN 0      511        127.0.0.1:5173       0.0.0.0:*    users:(("node",pid=12345,fd=23))
LISTEN 0      128            [::1]:8000          [::]:*    users:(("python3",pid=12346,fd=3))
LISTEN 0      4096               *:1313             *:*    users:(("hugo",pid=12347,fd=7))
`;

  assert.deepEqual(parseSsListeners(output), [
    { pid: 12345, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" },
    { pid: 12346, command: "python3", host: "::1", port: 8000, protocol: "tcp" },
    { pid: 12347, command: "hugo", host: "*", port: 1313, protocol: "tcp" },
  ]);
});

test("parseSsListeners ignores rows without process info", () => {
  const output = `LISTEN 0 128 127.0.0.1:8000 0.0.0.0:*
ESTAB  0 0   127.0.0.1:8000 127.0.0.1:60000 users:(("node",pid=1,fd=1))
`;

  assert.deepEqual(parseSsListeners(output), []);
});
