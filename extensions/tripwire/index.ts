import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { TripwireRuntime } from "./runtime.ts";

export default function tripwire(pi: ExtensionAPI) {
  const runtime = new TripwireRuntime({ pi });

  pi.on("session_start", (_event, ctx) => runtime.start(ctx));
  pi.on("tool_call", (event, ctx) => runtime.onToolCall(event, ctx));
  pi.on("tool_result", (event, ctx) => runtime.onToolResult(event, ctx));
  pi.on("session_shutdown", (_event, ctx) => runtime.stop(ctx));
}
