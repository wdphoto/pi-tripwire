import assert from "node:assert/strict";
import test from "node:test";
import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  SourceInfo,
  ToolDefinition,
  ToolResultEvent,
} from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG, TRIPWIRE_ENV } from "./config.ts";
import { TripwireRuntime } from "./runtime.ts";
import type { ListenerScanner, ScanResult } from "./scanner.ts";
import { deriveTripwireSessionId } from "./session.ts";

const builtinSource: SourceInfo = {
  path: "<builtin:bash>",
  source: "builtin",
  scope: "project",
  origin: "top-level",
};

const tripwireSource: SourceInfo = {
  path: "/repo/extensions/tripwire/index.ts",
  source: "local",
  scope: "project",
  origin: "top-level",
};

const otherSource: SourceInfo = {
  path: "/repo/other/index.ts",
  source: "local",
  scope: "project",
  origin: "top-level",
};

const scanner: ListenerScanner = {
  async scan() {
    return [];
  },
};

function makeContext(statuses: Array<string | undefined> = []): ExtensionContext {
  return {
    cwd: "/repo",
    hasUI: true,
    sessionManager: {
      getSessionFile() {
        return "/tmp/session.jsonl";
      },
    },
    ui: {
      theme: {
        fg(_color: string, text: string) {
          return text;
        },
      },
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
    },
  } as unknown as ExtensionContext;
}

function makePi(initialBashSource: SourceInfo = builtinSource) {
  let bashSource = initialBashSource;
  const registered: ToolDefinition[] = [];

  const pi = {
    registerTool(tool: ToolDefinition) {
      registered.push(tool);
      bashSource = tripwireSource;
    },
    getAllTools() {
      return [{ name: "bash", description: "bash", parameters: {}, sourceInfo: bashSource }];
    },
  } as unknown as ExtensionAPI;

  return {
    pi,
    registered,
    stealBash() {
      bashSource = otherSource;
    },
  };
}

function bashResultEvent(): ToolResultEvent {
  return {
    toolName: "bash",
    toolCallId: "call-1",
  } as unknown as ToolResultEvent;
}

async function waitFor(predicate: () => boolean, timeoutMs = 500): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for condition");
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}

function bashEvent(command: string): BashToolCallEvent {
  return {
    toolName: "bash",
    toolCallId: "call-1",
    input: { command },
  } as unknown as BashToolCallEvent;
}

test("TripwireRuntime falls back to command prelude if its bash wrapper is overwritten", async () => {
  const fake = makePi();
  const runtime = new TripwireRuntime({
    pi: fake.pi,
    scanner,
    readMarker: async () => ({}),
    config: { ...DEFAULT_CONFIG, enableCommandPreludeFallback: true },
  });
  const ctx = makeContext();

  runtime.start(ctx);
  fake.stealBash();

  const event = bashEvent("npm run dev");
  await runtime.onToolCall(event, ctx);
  runtime.stop(ctx);

  assert.match(event.input.command, new RegExp(`^export ${TRIPWIRE_ENV.session}=`));
  assert.match(event.input.command, /npm run dev$/);
});

test("TripwireRuntime fails closed when another extension owns bash", async () => {
  const fake = makePi(otherSource);
  const runtime = new TripwireRuntime({ pi: fake.pi, scanner, readMarker: async () => ({}) });
  const ctx = makeContext();

  runtime.start(ctx);

  const event = bashEvent("npm run dev");
  await runtime.onToolCall(event, ctx);
  runtime.stop(ctx);

  assert.equal(event.input.command, "npm run dev");
  assert.equal(fake.registered.length, 0);
});

test("TripwireRuntime leaves commands alone when its bash wrapper remains active", async () => {
  const fake = makePi();
  const runtime = new TripwireRuntime({ pi: fake.pi, scanner, readMarker: async () => ({}) });
  const ctx = makeContext();

  runtime.start(ctx);

  const event = bashEvent("npm run dev");
  await runtime.onToolCall(event, ctx);
  runtime.stop(ctx);

  assert.equal(event.input.command, "npm run dev");
});

test("TripwireRuntime preserves status when a follow-up scan fails", async () => {
  const listener = { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const };
  let result: ScanResult = { listeners: [listener], ok: true };
  let scanCount = 0;
  const mutableScanner: ListenerScanner = {
    async scan() {
      return result.listeners;
    },
    async scanResult() {
      scanCount++;
      return result;
    },
  };
  const statuses: Array<string | undefined> = [];
  const ctx = makeContext(statuses);
  const sessionId = deriveTripwireSessionId({ sessionFile: "/tmp/session.jsonl", cwd: "/repo" });
  const runtime = new TripwireRuntime({
    pi: makePi().pi,
    scanner: mutableScanner,
    readMarker: async () => ({ session: sessionId, actor: "agent" }),
    config: { ...DEFAULT_CONFIG, refreshMs: 60_000 },
  });

  runtime.start(ctx);
  await waitFor(() => statuses.length === 1);
  const currentStatus = statuses[0];

  result = { listeners: [], ok: false };
  await runtime.onToolResult(bashResultEvent(), ctx);
  await waitFor(() => scanCount === 2);

  assert.deepEqual(statuses, [currentStatus]);
  runtime.stop(ctx);
});

test("TripwireRuntime clears status after a successful empty scan", async () => {
  const listener = { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const };
  let result: ScanResult = { listeners: [listener], ok: true };
  const mutableScanner: ListenerScanner = {
    async scan() {
      return result.listeners;
    },
    async scanResult() {
      return result;
    },
  };
  const statuses: Array<string | undefined> = [];
  const ctx = makeContext(statuses);
  const sessionId = deriveTripwireSessionId({ sessionFile: "/tmp/session.jsonl", cwd: "/repo" });
  const runtime = new TripwireRuntime({
    pi: makePi().pi,
    scanner: mutableScanner,
    readMarker: async () => ({ session: sessionId, actor: "agent" }),
    config: { ...DEFAULT_CONFIG, refreshMs: 60_000 },
  });

  runtime.start(ctx);
  await waitFor(() => statuses.length === 1);

  result = { listeners: [], ok: true };
  await runtime.onToolResult(bashResultEvent(), ctx);
  await waitFor(() => statuses.length === 2);

  assert.equal(statuses[1], undefined);
  runtime.stop(ctx);
});

test("TripwireRuntime reads markers only for local listener candidates", async () => {
  const candidates = [
    { pid: 1, command: "node", host: "127.0.0.1", port: 5173, protocol: "tcp" as const },
    { pid: 2, command: "node", host: "192.168.1.20", port: 3000, protocol: "tcp" as const },
  ];
  const candidateScanner: ListenerScanner = {
    async scan() {
      return candidates;
    },
  };
  const markerPids: number[] = [];
  const statuses: Array<string | undefined> = [];
  const ctx = makeContext(statuses);
  const sessionId = deriveTripwireSessionId({ sessionFile: "/tmp/session.jsonl", cwd: "/repo" });
  const runtime = new TripwireRuntime({
    pi: makePi().pi,
    scanner: candidateScanner,
    readMarker: async (pid) => {
      markerPids.push(pid);
      return { session: sessionId, actor: "agent" };
    },
    config: { ...DEFAULT_CONFIG, refreshMs: 60_000 },
  });

  runtime.start(ctx);
  await waitFor(() => statuses.length === 1);

  assert.deepEqual(markerPids, [1]);
  runtime.stop(ctx);
});

test("TripwireRuntime ignores a scan that finishes after shutdown", async () => {
  let resolveScan: ((listeners: []) => void) | undefined;
  const deferredScanner: ListenerScanner = {
    scan() {
      return new Promise<[]>((resolve) => {
        resolveScan = resolve;
      });
    },
  };
  const statuses: Array<string | undefined> = [];
  const ctx = makeContext(statuses);
  const runtime = new TripwireRuntime({
    pi: makePi().pi,
    scanner: deferredScanner,
    readMarker: async () => ({}),
    config: { ...DEFAULT_CONFIG, refreshMs: 60_000 },
  });

  runtime.start(ctx);
  await waitFor(() => resolveScan !== undefined);
  runtime.stop(ctx);
  resolveScan?.([]);
  await new Promise((resolve) => setTimeout(resolve, 0));

  assert.deepEqual(statuses, [undefined]);
});
