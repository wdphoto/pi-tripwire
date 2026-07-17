import assert from "node:assert/strict";
import test from "node:test";
import { parseLsofCwdOutput } from "./cwd.ts";

test("parseLsofCwdOutput parses batched lsof field output", () => {
  const output = [
    "p41405",
    "fcwd",
    "n/",
    "p50185",
    "fcwd",
    "n/Users/illwill/Code/hugo-willduncan",
    "p60000",
    "fcwd",
    "n/path with spaces/project",
    "",
  ].join("\n");

  assert.deepEqual(
    parseLsofCwdOutput(output),
    new Map([
      [41405, "/"],
      [50185, "/Users/illwill/Code/hugo-willduncan"],
      [60000, "/path with spaces/project"],
    ]),
  );
});

test("parseLsofCwdOutput ignores non-cwd file records and malformed pids", () => {
  const output = ["p50185", "fcwd", "n/repo", "f0", "nnot-a-cwd", "pnan", "fcwd", "n/ignored", "f1", "n/also-ignored"].join(
    "\n",
  );

  assert.deepEqual(parseLsofCwdOutput(output), new Map([[50185, "/repo"]]));
});

test("parseLsofCwdOutput handles empty output", () => {
  assert.deepEqual(parseLsofCwdOutput(""), new Map());
});
