import assert from "node:assert/strict";
import test from "node:test";
import { DefaultListenerScanner, dedupeListeners, type ListenerScanner, type ScanResult } from "./scanner.ts";

function scanner(result: ScanResult): ListenerScanner {
  return {
    async scan() {
      return result.listeners;
    },
    async scanResult() {
      return result;
    },
  };
}

test("dedupeListeners keeps one pid/protocol/host/port tuple", () => {
  const listeners = [
    { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const },
    { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const },
    { pid: 1, command: "node", host: "::1", port: 5173, protocol: "tcp" as const },
  ];

  assert.deepEqual(dedupeListeners(listeners), [listeners[0], listeners[2]]);
});

test("DefaultListenerScanner merges lsof and ss results", async () => {
  const lsofListener = { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const };
  const ssListener = { pid: 2, command: "python3", host: "127.0.0.1", port: 8000, protocol: "tcp" as const };
  const defaultScanner = new DefaultListenerScanner(
    { scanTimeoutMs: 100 },
    {
      lsof: scanner({ listeners: [lsofListener], ok: true }),
      ss: scanner({ listeners: [ssListener], ok: true }),
    },
  );

  assert.deepEqual(await defaultScanner.scan(), [lsofListener, ssListener]);
});

test("DefaultListenerScanner returns ss results when lsof is unavailable", async () => {
  const ssListener = { pid: 2, command: "python3", host: "127.0.0.1", port: 8000, protocol: "tcp" as const };
  const defaultScanner = new DefaultListenerScanner(
    { scanTimeoutMs: 100 },
    {
      lsof: scanner({ listeners: [], ok: false, unavailable: true }),
      ss: scanner({ listeners: [ssListener], ok: true }),
    },
  );

  assert.deepEqual(await defaultScanner.scan(), [ssListener]);
});

test("DefaultListenerScanner treats adapter exceptions as failed scans", async () => {
  const ssListener = { pid: 2, command: "python3", host: "127.0.0.1", port: 8000, protocol: "tcp" as const };
  const defaultScanner = new DefaultListenerScanner(
    { scanTimeoutMs: 100 },
    {
      lsof: {
        async scan() {
          throw new Error("lsof failed");
        },
        async scanResult() {
          throw new Error("lsof failed");
        },
      },
      ss: scanner({ listeners: [ssListener], ok: true }),
    },
  );

  assert.deepEqual(await defaultScanner.scan(), [ssListener]);
});
