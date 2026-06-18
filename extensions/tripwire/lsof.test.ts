import assert from "node:assert/strict";
import test from "node:test";
import { parseLsofListeners } from "./lsof.ts";

test("parseLsofListeners parses common lsof LISTEN rows", () => {
  const output = `COMMAND   PID USER   FD   TYPE DEVICE SIZE/OFF NODE NAME
hugo    12345 will   10u  IPv4 0xabc      0t0  TCP 127.0.0.1:1313 (LISTEN)
node    12346 will   20u  IPv6 0xdef      0t0  TCP *:5173 (LISTEN)
Python  12347 will    5u  IPv6 0xdef      0t0  TCP [::1]:8000 (LISTEN)
ruby    12348 will    6u  IPv4 0xaaa      0t0  TCP localhost:4567 (LISTEN)
`;

  assert.deepEqual(parseLsofListeners(output), [
    { pid: 12345, command: "hugo", host: "127.0.0.1", port: 1313, protocol: "tcp" },
    { pid: 12346, command: "node", host: "*", port: 5173, protocol: "tcp" },
    { pid: 12347, command: "Python", host: "[::1]", port: 8000, protocol: "tcp" },
    { pid: 12348, command: "ruby", host: "localhost", port: 4567, protocol: "tcp" },
  ]);
});

test("parseLsofListeners ignores non-listener junk", () => {
  const output = `COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME
node 22 will 1u IPv4 0xabc 0t0 TCP 127.0.0.1:5173->127.0.0.1:60000 (ESTABLISHED)
nope nope nope
`;

  assert.deepEqual(parseLsofListeners(output), []);
});
