import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import type { ExtensionAPI, ExtensionContext, SourceInfo, ToolDefinition } from "@earendil-works/pi-coding-agent";
import { DEFAULT_CONFIG } from "./config.ts";
import { TripwireRuntime } from "./runtime.ts";

const shouldRun = process.env.TRIPWIRE_INTEGRATION === "1";
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

async function unusedPort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  assert(address && typeof address !== "string");
  const port = address.port;
  await new Promise<void>((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
  return port;
}

async function waitFor(predicate: () => boolean, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error("Timed out waiting for integration status");
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}

test("TripwireRuntime attributes a real Pi bash child", { skip: !shouldRun }, async () => {
  const port = await unusedPort();
  const statuses: Array<string | undefined> = [];
  const colors: Array<[string, string]> = [];
  let bashSource = builtinSource;
  let bashTool: ToolDefinition | undefined;
  const pi = {
    registerTool(tool: ToolDefinition) {
      bashTool = tool;
      bashSource = tripwireSource;
    },
    getAllTools() {
      return [{ name: "bash", description: "bash", parameters: {}, sourceInfo: bashSource }];
    },
  } as unknown as ExtensionAPI;
  const cwd = process.cwd();
  const ctx = {
    cwd,
    hasUI: true,
    sessionManager: { getSessionFile: () => "/tmp/pi-tripwire-integration.jsonl" },
    ui: {
      theme: {
        fg(color: string, text: string) {
          colors.push([color, text]);
          return text;
        },
      },
      setStatus(_key: string, value: string | undefined) {
        statuses.push(value);
      },
    },
  } as unknown as ExtensionContext;
  const runtime = new TripwireRuntime({
    pi,
    config: { ...DEFAULT_CONFIG, refreshMs: 60_000, scanTimeoutMs: 2_000 },
  });
  let childPid = 0;

  try {
    runtime.start(ctx);
    await waitFor(() => bashTool !== undefined, 2_000);

    const command = `node -e ${JSON.stringify(`require("net").createServer(() => {}).listen(${port}, "127.0.0.1")`)} >/dev/null 2>&1 & echo $!`;
    const result = await bashTool!.execute("tripwire-integration", { command }, new AbortController().signal, undefined, ctx);
    const output = result.content.find((part) => part.type === "text");
    childPid = Number(output?.type === "text" ? output.text.trim() : "");
    assert(Number.isInteger(childPid) && childPid > 0, "bash did not return the child PID");

    await runtime.onToolResult({ toolName: "bash" } as never, ctx);
    await waitFor(() => statuses.some((status) => status?.includes(`:${port}`)));
    assert(colors.some(([color, text]) => color === "accent" && text.endsWith(`:${port}`)));
  } finally {
    runtime.stop(ctx);
    if (childPid > 0) {
      try {
        process.kill(childPid, "SIGTERM");
      } catch {
        // The listener may have exited during the test.
      }
    }
  }
});
