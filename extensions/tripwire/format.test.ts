import assert from "node:assert/strict";
import test from "node:test";
import { formatFooterStatus, osc8, sanitizeFooterLabel, truncateLabel } from "./format.ts";
import type { TrackedListener } from "./types.ts";

const theme = {
  fg(color: string, text: string) {
    return `<${color}>${text}</${color}>`;
  },
};

test("osc8 wraps a label in a hyperlink", () => {
  assert.equal(osc8("http://localhost:1313", "hugo:1313"), "\x1b]8;;http://localhost:1313\x1b\\hugo:1313\x1b]8;;\x1b\\");
});

test("sanitizeFooterLabel removes control characters", () => {
  assert.equal(sanitizeFooterLabel("\u001bnode\u0007"), "node");
  assert.equal(sanitizeFooterLabel("\u0000"), "process");
});

test("truncateLabel caps long labels", () => {
  assert.equal(truncateLabel("development-server", 8), "devel...");
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
      origin: "agent" as const,
      source: "env",
    },
  ];

  assert.equal(
    formatFooterStatus(entries, theme, { maxFooterItems: 5, maxLabelWidth: 24 }),
    "\x1b]8;;http://localhost:1313\x1b\\<accent>hugo:1313</accent>\x1b]8;;\x1b\\",
  );
});

test("formatFooterStatus dims non-agent listeners", () => {
  const entries: TrackedListener[] = [
    {
      pid: 1,
      command: "hugo",
      label: "hugo",
      port: 1313,
      protocol: "tcp",
      url: "http://localhost:1313",
      origin: "project",
      source: "cwd",
    },
  ];

  assert.equal(
    formatFooterStatus(entries, theme, { maxFooterItems: 5, maxLabelWidth: 24 }),
    "\x1b]8;;http://localhost:1313\x1b\\<dim>hugo:1313</dim>\x1b]8;;\x1b\\",
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
    origin: "agent" as const,
    source: "env" as const,
  }));

  const formatted = formatFooterStatus(entries, theme, { maxFooterItems: 2, maxLabelWidth: 24 });
  assert.match(formatted ?? "", /<muted>\+1<\/muted>$/);
});
