import assert from "node:assert/strict";
import test from "node:test";
import type {
  BashToolCallEvent,
  ExtensionAPI,
  ExtensionContext,
  SourceInfo,
  ToolDefinition,
} from "@earendil-works/pi-coding-agent";
import { TRIPWIRE_ENV } from "./config.ts";
import { TripwireRuntime } from "./runtime.ts";
import type { ListenerScanner } from "./scanner.ts";

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

function makeContext(): ExtensionContext {
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
      setStatus() {},
    },
  } as unknown as ExtensionContext;
}

function makePi() {
  let bashSource = builtinSource;
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

function bashEvent(command: string): BashToolCallEvent {
  return {
    toolName: "bash",
    toolCallId: "call-1",
    input: { command },
  } as unknown as BashToolCallEvent;
}

test("TripwireRuntime falls back to command prelude if its bash wrapper is overwritten", async () => {
  const fake = makePi();
  const runtime = new TripwireRuntime({ pi: fake.pi, scanner, readMarker: async () => ({}) });
  const ctx = makeContext();

  runtime.start(ctx);
  fake.stealBash();

  const event = bashEvent("npm run dev");
  await runtime.onToolCall(event, ctx);
  runtime.stop(ctx);

  assert.match(event.input.command, new RegExp(`^export ${TRIPWIRE_ENV.session}=`));
  assert.match(event.input.command, /npm run dev$/);
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
