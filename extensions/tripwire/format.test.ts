import assert from "node:assert/strict";
import test from "node:test";
import { formatFooterStatus, osc8 } from "./format.ts";
import type { TrackedListener } from "./types.ts";

const theme = {
  fg(color: string, text: string) {
    return `<${color}>${text}</${color}>`;
  },
};

test("osc8 wraps a label in a hyperlink", () => {
  assert.equal(osc8("http://localhost:1313", "hugo:1313"), "\x1b]8;;http://localhost:1313\x1b\\hugo:1313\x1b]8;;\x1b\\");
});

test("formatFooterStatus renders labels without prefix", () => {
  const entries: TrackedListener[] = [
    {
      pid: 1,
      command: "hugo",
      label: "hugo",
      port: 1313,
      protocol: "tcp",
      url: "http://localhost:1313",
      source: "env",
    },
  ];

  assert.equal(
    formatFooterStatus(entries, theme, { maxFooterItems: 5 }),
    "\x1b]8;;http://localhost:1313\x1b\\<accent>hugo:1313</accent>\x1b]8;;\x1b\\",
  );
});

test("formatFooterStatus adds overflow", () => {
  const entries: TrackedListener[] = [1313, 5173, 8000].map((port) => ({
    pid: port,
    command: "node",
    label: "node",
    port,
    protocol: "tcp" as const,
    url: `http://localhost:${port}`,
    source: "env" as const,
  }));

  const formatted = formatFooterStatus(entries, theme, { maxFooterItems: 2 });
  assert.match(formatted ?? "", /<dim>\+1<\/dim>$/);
});
