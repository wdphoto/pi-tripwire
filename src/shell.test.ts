import assert from "node:assert/strict";
import test from "node:test";
import { buildExportPrelude, shellQuote } from "./shell.js";

test("shellQuote handles apostrophes", () => {
  assert.equal(shellQuote("it's ok"), `'it'"'"'s ok'`);
});

test("buildExportPrelude emits export lines", () => {
  assert.equal(buildExportPrelude({ A: "1", B: "two words" }), "export A='1'\nexport B='two words'\n");
});
