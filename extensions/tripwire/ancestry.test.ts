import assert from "node:assert/strict";
import test from "node:test";
import { descendantsAmong, isDescendant, parseProcessParents } from "./ancestry.ts";

test("parseProcessParents parses ps pid/ppid fields", () => {
  assert.deepEqual(
    parseProcessParents("  10     1\n20 10\nnot-a-process\n"),
    new Map([
      [10, 1],
      [20, 10],
    ]),
  );
});

test("isDescendant follows parents without looping", () => {
  const parents = new Map([
    [20, 10],
    [10, 1],
    [30, 30],
  ]);

  assert.equal(isDescendant(20, 1, parents), true);
  assert.equal(isDescendant(20, 2, parents), false);
  assert.equal(isDescendant(30, 1, parents), false);
});

test("descendantsAmong limits attribution to listener candidates", () => {
  const parents = new Map([
    [20, 10],
    [10, 1],
    [30, 2],
  ]);

  assert.deepEqual(descendantsAmong([20, 30, 40], 1, parents), new Set([20]));
});
