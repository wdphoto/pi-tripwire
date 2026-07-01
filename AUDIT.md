# Tripwire Code Review & Audit

## 2026-07-01 Current Review

Scope: current `extensions/tripwire/` implementation, package metadata, README/plan, and Pi extension/TUI docs from:

- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
- `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`

Verification:

- `npm run check` passed outside the sandbox: 20 tests, TypeScript, and `npm audit --omit=dev`.
- `npm pack --dry-run --cache /private/tmp/npm-cache-pi-tripwire` passed and packaged only runtime extension files plus README/LICENSE/package metadata.
- Plain `npm run check` inside the sandbox failed before tests because `tsx` could not create its IPC pipe.
- Plain `npm pack --dry-run` failed because `~/.npm` contains root-owned cache files; using a temp cache avoided that global npm issue.

### Current Shape

Tripwire is no longer a prototype-shaped one-file footer hack. It has the right broad boundaries:

- Pi-facing lifecycle code stays in `extensions/tripwire/index.ts`.
- Scanner/parser/classifier/formatter/env/session/shell helpers are split into small modules.
- The extension starts timers in `session_start`, clears them in `session_shutdown`, and uses `ctx.ui.setStatus("tripwire", ...)` instead of replacing Pi's footer.
- PID-snapshot attribution is disabled by default, which matches the product rule that MVP should show only listeners Tripwire can attribute to this Pi agent session.
- Linux `ss` fallback exists, and the package/test/release gates are lightweight.

### Findings

#### P1 - Bash override can be overwritten after Tripwire decides it owns `bash`

`session_start` checks whether `bash` is built-in and then registers a replacement bash tool with a `spawnHook` (`extensions/tripwire/index.ts:138-140`). If another extension registers its own `bash` later in its own `session_start`, Pi's registry will let the later tool win. Tripwire still leaves `bashInjectionMode` as `"spawn-hook"`, so `tool_call` will not apply the command-prelude fallback (`extensions/tripwire/index.ts:156-165`). The result is silent loss of env markers and an empty footer.

Fix direction: re-check the active `bash` tool after all `session_start` handlers have had a chance to run, or at `tool_call` time. If Tripwire's wrapper is no longer active, either fail closed or switch to a clearly documented fallback mode. A cleaner upstream answer would be a Pi-provided bash spawn hook that extensions can compose without replacing the whole tool.

#### P1 - Command-prelude fallback is useful, but it is not really hidden

When another extension already owns `bash`, Tripwire mutates the visible command by prepending `export PI_TRIPWIRE_*` lines (`extensions/tripwire/index.ts:156-165`). Pi docs explicitly allow `tool_call` mutation, but this fallback means marker details can appear in rendered commands and session/tool history, and it changes the shell text the agent asked to run. This is acceptable as a compatibility escape hatch, but it is weaker than the product principle of hidden attribution.

Fix direction: decide whether fallback should be opt-in, debug-only, or kept as default compatibility. My default rebuild choice would be fail-closed by default when bash is already overridden, with a config switch for command-prelude compatibility.

#### P1 - macOS env attribution is still best-effort

Linux has `/proc/<pid>/environ`; macOS falls back to `ps eww -p <pid> -o command=` (`extensions/tripwire/env.ts:27-43`). That can work for common dev servers, but it is process-dependent and not a robust environment API. The code correctly fails closed when markers cannot be read, but release confidence still depends on real Pi TUI manual QA.

Fix direction: keep failing closed, run the manual checklist in `plan.md`, and ask Pi upstream for a bash root PID or process-tree attribution hook. Root PID plus descendants would be stronger than global PID snapshots and more reliable than macOS env scraping.

#### P2 - Scanner fallback treats any `lsof` result as complete

`DefaultListenerScanner` returns `lsof` results whenever `lsof` returns one or more rows; `ss` is only used when `lsof` returns zero (`extensions/tripwire/scanner.ts:18-21`). On Linux, partial `lsof` output or permission differences could hide the target listener while still returning unrelated listeners.

Fix direction: make scanner adapters return `{ listeners, ok, unavailable }` style results instead of bare arrays, then merge/dedupe successful scanner outputs or fall back based on capability/error rather than row count.

#### P2 - Formatter is not ANSI-width safe yet

The formatter truncates with `label.length` and `slice()` (`extensions/tripwire/format.ts:16-19`) while emitting ANSI/OSC8 colored output. That is fine for simple ASCII process names, but the project notes explicitly call for ANSI-width-safe footer text if colored.

Fix direction: use `truncateToWidth` / `visibleWidth` from `@earendil-works/pi-tui` for label/footer budgeting, and add tests with ANSI-colored and wide-character labels. If importing `pi-tui` directly, make the dependency story intentional for npm/git package installs.

#### P3 - The riskiest behavior is under-tested

Current pure parser/classifier/formatter tests are good, but the lifecycle behavior is where Tripwire can regress:

- one interval per session and no timers after shutdown/reload;
- queued refresh behavior while a scan is in flight;
- bash override losing a race with another extension;
- command-prelude fallback duplicate detection;
- snapshot fallback false positives if someone enables it;
- actual Pi manual checks for Python, Hugo, Vite/Node, `/reload`, unrelated listener hidden, and server exit clearing the footer.

### How I Would Rebuild From Here

I would not throw this away. I would rebuild the internals around a smaller state machine and keep the public package shape stable.

1. Keep `extensions/tripwire/index.ts` as the thin Pi adapter.
   It should only derive config/session id, create a `TripwireSession`, wire Pi events, and call `ctx.ui.setStatus`. No scanning/classification details should live there.

2. Add a `TripwireSession` runtime class.
   It owns `start(ctx)`, `stop(ctx)`, `requestRefresh(reason)`, generation tokens, abort controllers, timer handles, and the in-flight/queued refresh rules. This gives lifecycle behavior something concrete to unit test.

3. Split attribution into an explicit strategy.
   Define an `Attributor` with `install(ctx)`, `beforeToolCall(event, ctx)`, `afterToolResult(event, ctx)`, and `readMarker(pid)`. The default strategy is env marker via Pi bash spawnHook. Command-prelude and PID snapshots become named degraded strategies, not incidental branches in `index.ts`.

4. Prefer composable Pi hooks over overriding `bash`.
   If Pi has or can add a composable spawn hook, use that. If not, keep the current `createBashTool` wrapper, but detect overwrite at runtime and document the behavior. Avoid global PID diffing unless explicitly enabled.

5. Make scanners capability-aware.
   `lsof` and `ss` should report parseable listeners plus scanner status. The default scanner can merge and dedupe by `pid/protocol/host/port`, remember unavailable adapters, and avoid silently treating partial output as complete.

6. Keep classification pure and conservative.
   MVP classification should remain: localhost/wildcard listener, marker session equals current Tripwire session, actor equals `agent`. Human/current-project detection should be a separate second-pass source with different color, not mixed into MVP attribution.

7. Move formatting to a width-aware renderer.
   Keep labels as `<process>:<port>` with OSC8 links, but use Pi TUI width helpers and explicit budgets. This is where future origin colors belong; not in noisy label suffixes.

8. Add a tiny debug surface only after attribution is solid.
   A `/tripwire` command could show pid, port, label, source, and "why hidden" without injecting that detail into LLM context. It should be user-invoked, not automatic.

### Open Questions

- Should Tripwire fail closed when another extension owns `bash`, or keep the command-prelude fallback enabled by default for compatibility?
- Is RPC mode a supported display target for Tripwire status, or should this be TUI-only despite `ctx.hasUI` being true in RPC?
- Should the next release stay MVP-pure, or do we want current-project human-started listeners before release?
- Are we willing to ask Pi upstream for a composable bash spawn hook/root PID event? That would simplify the extension more than any local refactor.

### Recommended Next Work

1. Run real Pi manual QA from `plan.md`.
2. Fix/detect the bash override overwrite case.
3. Decide command-prelude fallback policy.
4. Add lifecycle tests around `TripwireSession`.
5. Make scanner results capability-aware and merge/dedupe adapters.
6. Add width-safe footer formatting.

---

Date: 2026-06-21  
Scope: Pi extension code under `extensions/tripwire/`, package metadata, README/plan, and Pi extension/TUI/package docs.

## Audit commands run

- `npm run check` — pass: tests, TypeScript, `npm audit --omit=dev`.
- `npm pack --dry-run` — package contents look scoped to runtime extension files plus README/LICENSE/package metadata.
- `npm view pi-tripwire version --silent` — `0.0.4`.
- Local dev dependency check — `@earendil-works/pi-coding-agent@0.79.4`; global Pi docs/runtime observed at `0.79.6` in `plan.md`.
- Local platform probe — Darwin 24.6.0 has `lsof` and `ps`, no `ss`.

## What is already strong

- Pi lifecycle shape is correct: the factory only registers handlers; interval starts in `session_start` and is cleared in `session_shutdown` (`extensions/tripwire/index.ts`).
- Footer integration is idiomatic: uses `ctx.ui.setStatus("tripwire", ...)`, not a custom footer replacement.
- Read-only posture is intact: scanner uses `execFile`/filesystem reads and does not kill, open browsers, or connect to listener ports.
- Code is split into small parser/classifier/formatter modules with tests.
- Runtime dependency footprint is minimal; package manifest uses Pi peer dependency and excludes tests from publish.
- Current release gate passes.

## Implementation follow-up

A first hardening pass was applied after this audit:

- Disabled PID snapshot fallback by default so env marker attribution is the normal proof path.
- Removed global `ps` snapshots from the default bash hot path.
- Switched marker injection to prefer Pi's native `createBashTool(..., { spawnHook })` path when `bash` is still built-in; keep command-prelude injection only as a compatibility fallback when another extension already owns `bash`.
- Added debounced/trailing refresh scheduling and cleanup of scheduled refresh timers.
- Added Linux `ss` scanner fallback.
- Added local-host filtering, footer label sanitization/truncation, and env/ss parser tests.
- Remaining native/API question: confirm the bash override preserves enough built-in bash settings/rendering, especially custom shell path or command prefix settings.

## Findings

### P0 — macOS env attribution is process-dependent and needs manual Pi QA

**Evidence**

- `readTripwireMarker()` tries `/proc/<pid>/environ` on Linux, then falls back to `ps eww -p <pid> -o command=` everywhere else (`extensions/tripwire/env.ts:27-43`).
- On current macOS, a controlled `sleep` process did not expose env markers via `ps eww`, while `python3`/`node` did expose them. A scanner sanity check with env-marked `python3 -m http.server 8765` classified `python:8765` via env marker.

**Why it matters**

The MVP design says env marker is the preferred attribution mechanism and PID snapshots are only a weak fallback. macOS `ps` is good enough for common dev servers in local sanity checks, but not a guaranteed env API.

**Recommendation**

- Keep failing closed when env markers cannot be read.
- Run real Pi-agent manual QA for Python, Hugo, and Node/Vite before release confidence.
- Investigate a Pi-native/upstream-friendly hook that exposes the spawned bash root PID, then classify descendants instead of diffing all system PIDs.
- If no root PID hook exists, either request one upstream or wrap bash execution very carefully, preserving built-in bash result/rendering semantics.

### P0 — PID snapshot fallback is always on and can misattribute unrelated processes [addressed by default]

**Evidence**

- Every bash `tool_call` snapshots all PIDs before execution (`extensions/tripwire/index.ts:76`).
- Every bash `tool_result` snapshots all PIDs after execution and marks every new PID as agent-owned (`extensions/tripwire/index.ts:98-99`).
- Classifier accepts snapshot-owned PIDs if their label is in broad `DEV_COMMANDS` (`extensions/tripwire/classify.ts:28`; `extensions/tripwire/config.ts:16-38`).

**Why it matters**

A human-started `node`, `python`, `hugo`, etc. process born during the same window can appear as agent-spawned. This violates the core product rule: show only what Pi spawned unless we can prove a broader origin.

**Recommendation**

- Make snapshot fallback disabled by default, or explicitly platform-gated and labelled as weak.
- Prefer descendant-of-known-shell-root over global before/after PID diffs.
- If fallback remains, shrink the race window, add tests for concurrent unrelated process creation, and consider not showing fallback entries in MVP unless env reads are known impossible and the user opts in.

### P1 — Bash command mutation is less idiomatic than Pi’s native bash spawn hook [addressed]

**Evidence**

- Original implementation prepended `export PI_TRIPWIRE_*` lines by mutating `event.input.command`.
- Pi docs document `createBashTool(..., { spawnHook })` for adjusting command/cwd/env before execution.
- Follow-up implementation now uses `spawnHook` through a bash override when the active bash tool is still built-in, and avoids clobbering an existing bash override.

**Why it matters**

Mutating the visible command can add noise to TUI/session/tool rendering and may leak internal marker details into places that should only contain the user/assistant command. It also risks subtle shell behavior changes and brittle duplicate-detection.

**Recommendation**

- Prototype a native bash wrapper using `createBashTool` + `spawnHook` to inject `env` without rewriting the command string.
- Only ship that route if it preserves built-in bash prompt metadata, truncation, rendering, settings (`shellPath`, command prefix), cancellation, and result shape.
- Note: this cleans up Linux/env-marker attribution but does not solve macOS env-reading by itself.

### P1 — Bash tool hooks block on expensive `ps` snapshots [addressed by default]

**Evidence**

- `tool_call` awaits `snapshotPids()` before the bash tool can execute (`extensions/tripwire/index.ts:76`).
- `tool_result` awaits another `snapshotPids()` before finishing the event handler (`extensions/tripwire/index.ts:98`).
- `snapshotPids()` shells out to `ps -A -o pid=` with a 2s timeout (`extensions/tripwire/process.ts:6-8`).

**Why it matters**

A weak fallback should not be on the critical path for every bash command. Slow or stuck `ps` can make Pi feel sluggish even when Tripwire has nothing useful to show.

**Recommendation**

- Remove snapshot fallback from the default hot path.
- If retained, make its timeout much smaller and/or do non-blocking background bookkeeping.
- Prefer env/spawn-hook attribution for the critical path.

### P1 — Refresh scheduling can drop important updates and leaks untracked timeouts [addressed]

**Evidence**

- `refresh()` returns immediately when `refreshInFlight` is true (`extensions/tripwire/index.ts:25-27`). There is no trailing “dirty” refresh.
- `scheduleRefresh()` creates untracked timeouts (`extensions/tripwire/index.ts:47-49`), while shutdown only clears the interval (`extensions/tripwire/index.ts:103-111`).

**Why it matters**

A post-tool refresh can be skipped if the periodic scan is already running; the footer may stay stale until the next 10s interval. Untracked timers are small, but they violate the “no timer leaks across reload/shutdown” goal.

**Recommendation**

- Replace ad hoc `setTimeout` calls with one debounced timeout handle.
- Clear that timeout on `session_shutdown`.
- Add a `refreshQueued`/generation-token pattern: if a refresh request arrives while in flight, run exactly one trailing refresh after the current scan finishes.
- Consider an `AbortController` per session to cancel in-flight scans on shutdown.

### P1 — Scanner is `lsof`-only; Linux fallback is still missing [addressed]

**Evidence**

- `LsofScanner.scan()` always calls `lsof` and returns `[]` on any error (`extensions/tripwire/lsof.ts:41-54`).
- `plan.md` still has “Add Linux fallback” unchecked (`plan.md:177-181`).

**Why it matters**

Many Linux environments do not install `lsof` by default, while `ss` is commonly available through iproute2. Returning empty silently makes Tripwire look broken.

**Recommendation**

- Add a scanner adapter chain: `lsof` first, `ss` fallback on Linux.
- Keep parsers pure and fixture-tested.
- Optionally memoize “lsof missing” after first `ENOENT` so every scan does not pay that failure cost.

### P2 — Periodic refresh runs unnecessary global `ps` work [addressed by default]

**Evidence**

- Every refresh runs both `scanner.scan()` and `snapshotPids()` (`extensions/tripwire/index.ts:30`).
- `snapshotPids()` is only needed to prune snapshot fallback state (`extensions/tripwire/index.ts:31`).

**Why it matters**

When `agentPids` is empty — or if snapshot fallback is removed — this is pure overhead every 10 seconds.

**Recommendation**

- Skip liveness pruning when `agentPids.size === 0`.
- Prefer native `process.kill(pid, 0)` checks for the small tracked set instead of shelling out to global `ps`.

### P2 — Footer formatting is not width/sanitization safe yet [partially addressed]

**Evidence**

- `formatFooterStatus()` returns an ANSI/OSC8 string with no width budget or truncation (`extensions/tripwire/format.ts:11-29`).
- `plan.md` calls out ANSI-width-safe truncation as a rendering rule (`plan.md:136-150`).

**Why it matters**

Long process labels or future smarter labels can crowd Pi’s footer. Labels originate from process names; they should be treated as display data and sanitized before embedding in ANSI/OSC8 sequences.

**Recommendation**

- Sanitize labels to printable, non-control text before formatting.
- Add a width-aware formatter or conservative max label length.
- If importing `truncateToWidth`/`visibleWidth` from `@earendil-works/pi-tui`, add the proper Pi peer/dev dependency metadata.

### P2 — Host handling is parsed but ignored [addressed]

**Evidence**

- `parseLsofListeners()` captures `host` (`extensions/tripwire/lsof.ts:25-34`).
- `listenerUrl()` always emits `http://localhost:<port>` (`extensions/tripwire/classify.ts:11-13`).

**Why it matters**

For wildcard or loopback binds, localhost is right. For a listener bound only to a specific LAN address, the footer link may be wrong. Conversely, Tripwire says “localhost ports”, so non-localhost-only binds should be classified intentionally.

**Recommendation**

- Add a small host classifier: loopback/wildcard => localhost URL; non-loopback => either hide for MVP or render a host-aware URL later.
- Test IPv4 loopback, IPv6 loopback, wildcard, and specific LAN IP cases.

### P2 — `lsof` human-output parser is workable but not the most robust interface

**Evidence**

- Parser relies on the human table and a regex over the `TCP ... (LISTEN)` suffix (`extensions/tripwire/lsof.ts:10-38`).

**Why it matters**

Human output varies more than field output. `lsof -F` can produce machine-readable records that are usually easier to parse and less sensitive to spacing/columns.

**Recommendation**

- Consider switching scanner output to `lsof -nP -iTCP -sTCP:LISTEN -F pcPn` or similar.
- Keep the existing parser tests as compatibility fixtures or add a new field-output parser alongside them.

### P2 — Non-UI modes still mutate bash commands and do process bookkeeping [addressed]

**Evidence**

- `session_start` skips interval setup when `!ctx.hasUI` (`extensions/tripwire/index.ts:65-66`).
- `tool_call` and `tool_result` do not check `ctx.hasUI` before snapshots/mutation (`extensions/tripwire/index.ts:73-100`).

**Why it matters**

Tripwire’s product is a footer status. In print/json modes there is no footer, so bash overrides and process scanning are side effects without user-visible value.

**Recommendation**

- Track an `enabledForSession = ctx.hasUI` boolean at `session_start`.
- No-op `tool_call`, `tool_result`, scans, and timers when disabled.
- Keep RPC behavior a deliberate decision because `ctx.hasUI` is true there but TUI-specific assumptions do not apply.

### P3 — Test gaps reflect the riskiest areas

Current tests cover lsof parsing, ss parsing, basic attribution, env parsing, host classification, formatting, and session id. Missing high-value tests:

- macOS env fallback behavior documented as unsupported/weak, or a mocked test that proves `ps` command-line parsing cannot be treated as env.
- Timer/debounce lifecycle behavior: one interval, one queued refresh, cleanup on shutdown.
- Snapshot false-positive scenarios if fallback is ever enabled.
- Native bash override behavior around custom shell settings.

### P3 — Manual QA checklist remains open

`plan.md` still lists core manual checks as incomplete (`plan.md:303-309`): python/Hugo/Node startup, unrelated listener hidden, `/reload` keeps marked servers, server exit clears footer.

Run these after resolving the macOS attribution decision, otherwise the manual test may pass for the wrong reason through PID snapshots.

## Remaining implementation order

1. **Manual Pi QA:** verify Python, Hugo, Node/Vite, `/reload`, and server-exit behavior in the real Pi TUI.
2. **Bash override compatibility:** confirm custom Pi shell settings still behave acceptably with the `createBashTool` override.
3. **Timer tests:** add lifecycle tests around queued refresh and shutdown cleanup if the extension grows a test harness for lifecycle wiring.
4. **Release hygiene:** bump/version/tag only after manual QA passes.

## Open upstream/Pi API question

Tripwire would be safer and faster if Pi exposed one of these natively:

- a bash `spawnHook`/lifecycle callback that includes the spawned root PID, or
- a tool execution event detail containing the local process root PID for built-in bash.

With a root PID, Tripwire could avoid global PID snapshots and classify descendants cheaply and accurately on macOS without reading full environments.
