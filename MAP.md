# Tripwire MAP

MAP is the single source of truth for Tripwire's current behavior, technical guardrails, and ordered work.

## Product goal

Tripwire is a read-only Pi footer observer that answers:

> What relevant localhost servers are running, and did this Pi session start them?

Labels stay compact (`hugo:1313`). Provenance is communicated by color only:

- `agent`: this Pi session's agent-spawned listener, shown in `accent`.
- `project`: listener whose process cwd is under the current project, shown in `dim`.
- `external`: known dev-like listener outside the project/session, shown in `dim`.

`project` and `external` are relevance heuristics, not proof of human ownership.

## Session checkpoint

Version 0.0.7 is published to npm and GitHub from commit `48375c4`, with both Pi install paths verified. The extension API and package guidance were reviewed against Pi 0.84.1; current types compile, the real bash-tool/listener smoke passes, and macOS `lsof` no-match exits correctly clear stale footer status. GitHub Actions checks macOS and Linux, with the real integration smoke on macOS. Release validation was clean: 45 unit tests passed (1 opt-in integration test skipped in the unit run), 1 integration test passed, TypeScript, full and production audits, package dry run, and packaged-extension loads through Pi's CLI from both sources.

Next session: expand the macOS integration matrix with `/reload`, wrappers, process exits, Python/Hugo labels, permissions, and missing tools.

## Current baseline

Completed:

- [x] Pi extension lifecycle with periodic and post-bash refreshes.
- [x] Compact footer status with OSC 8 links, colors, truncation, and overflow.
- [x] macOS `lsof` listener scanning.
- [x] Linux `ss` fallback and `/proc/<pid>/cwd` lookup.
- [x] Session-scoped environment marker attribution.
- [x] Scoped process-ancestry attribution for listeners still descended from Pi.
- [x] Legacy global PID-snapshot and visible command-prelude fallbacks removed.
- [x] Project cwd and external dev-command classification.
- [x] Agent-first duplicate precedence.
- [x] Parser, classifier, formatter, cwd, scanner, session, env, and runtime tests.

Known baseline limitations:

- macOS marker reads depend on best-effort `ps eww` output.
- The built-in bash tool is replaced to install the marker spawn hook; attribution fails closed if another extension owns it.
- A Pi root-PID hook is not exposed by the current API, so ancestry cannot prove detached/background processes after reparenting.
- Windows has no process/listener adapter.
- `external` detection is heuristic and can produce false positives.
- GitHub `v0.0.6` and npm `0.0.5` remain historical mismatches; synchronized releases resumed with 0.0.7.
- `.pi/construct.json` is machine-local state and must not remain tracked.

## Execution order

### 0. Repository and documentation hygiene — do first

- [x] Remove `.pi/construct.json` from Git and add the appropriate ignore rule.
- [x] Reconcile README, AGENTS.md, and MAP.md around the current three-origin behavior.
- [x] Remove stale roadmap and audit documents.
- [x] Run `npm run check` and `npm pack --dry-run` after the cleanup.

**Exit criteria:** a clean package contains source/docs only, and the living project documents describe the same behavior. Achieved locally; the construct-file removal is ready for the next commit.

### 1. macOS attribution stability — top technical priority

- [x] Map the current Pi bash/tool API. It exposes `spawnHook`, but no command/root PID callback.
- [x] Implement scoped process ancestry attribution for listeners still descended from the current Pi process.
- [x] Keep environment markers for stable attribution across `/reload` and session-file continuity.
- [x] Fail closed when ancestry and marker metadata are both unavailable.
- [x] Finish cancellation and timeout propagation for process metadata lookups; scanner, ancestry, cwd, and marker reads accept the session signal.
- [ ] Test macOS cases: Python, Hugo, wrappers (`npm`/`npx`), tmux, daemonization, `/reload`, process exit, permissions, and missing tools; the repeatable Node smoke is covered by `npm run integration`.

**Exit criteria:** ordinary macOS agent-started servers remain visible across refresh and `/reload`; attribution failures do not hang or leak resources; no unrelated listener is promoted to `agent`.

### 2. Runtime hardening and integration coverage

- [ ] Add runtime coverage for cwd lookup and project/external rendering; metadata failures, stale scans, shutdown during refresh, and duplicate precedence are covered.
- [x] Add an integration smoke test through the Tripwire lifecycle using the real Pi bash tool factory and listener scanner (`npm run integration`).
- [x] Serialize refreshes, coalesce queued work, abort session lookups on shutdown/reload, bound adapter subprocesses, and ignore stale results.
- [x] Preserve the last successful footer after a failed scan, but clear it after a successful empty scan (including `lsof`'s exit-1 no-match behavior).
- [ ] Expand scanner health so partial adapter results are not confused with a complete inventory; basic success/failure/unavailable states exist.

**Exit criteria:** lifecycle tests cover reload/shutdown races and the actual Pi integration has one repeatable smoke test.

### 3. Broader platform adapters — after core stability

- [ ] Establish the support matrix for currently targeted macOS and Linux environments plus required permissions/tools.
- [ ] Add adapter capability states for unavailable tools, permission errors, partial output, and successful empty scans.
- [ ] Prefer stable/field output over human-readable `lsof` output.
- [ ] Harden IPv4, IPv6, wildcard, loopback, IPv4-mapped IPv6, and platform-specific address parsing.
- [ ] Normalize cwd paths across macOS aliases, symlinks, case-insensitive filesystems, containers, and exited processes.
- [ ] Reduce duplicate macOS subprocess work where listener and cwd queries can be combined.

**Exit criteria:** each supported OS has a tested adapter, graceful capability degradation, and no POSIX assumptions in shared classification/runtime code.

### 4. Product semantics and diagnostics

- [ ] Document `external` as “known dev-like,” not “user-started.”
- [ ] Add configurable ignore ports/processes and independent controls for project/external tiers.
- [ ] Add a `/tripwire` diagnostic view only if normal footer behavior remains difficult to explain.
- [ ] Make OSC 8/color output fallback-safe and width-safe for terminals and Unicode labels.
- [ ] Decide how users can distinguish an empty inventory from scanner or attribution unavailability.

**Exit criteria:** false positives are controllable, terminal behavior is safe, and diagnostics do not expose sensitive process environments or full commands to LLM context.

### 5. CI, release, and compatibility

- [x] Configure macOS and Linux CI for `npm run check` and `npm pack --dry-run`, plus the real integration smoke on macOS.
- [ ] Check in real output fixtures for listener, cwd, process-tree, permission, and disappearing-process cases.
- [x] Keep Pi core peer/dev dependency ranges at `"*"` as required by Pi package guidance, and lock the development install to the current API for reproducible typechecks.
- [x] Support and test the current Pi API; add an older-version compatibility floor only if user demand or a regression requires it.
- [x] Make `npm run check` and `npm pack --dry-run` CI release gates.
- [x] Publish/tag 0.0.7 from one commit and verify npm and GitHub package loads through Pi's temporary install path.

**Exit criteria:** releases are reproducible, package contents are intentional, and supported Pi/API versions are documented.

### 6. Advanced attribution — someday/maybe

- [ ] Compose with existing custom bash configuration if Pi exposes a supported builtin-tool wrapping/configuration API.
- [ ] Add a Windows listener/process/cwd adapter if there is user demand and a maintainable native strategy.
- [ ] Handle tmux and daemonized/double-forked processes only where attribution can be proven.
- [ ] Improve wrapper labels (`npm`, `npx`, `node`) without exposing full commands.
- [ ] Revisit continuity across Pi restart, fork, resume, and detached process managers.

**Exit criteria:** advanced cases have explicit confidence boundaries and never require Tripwire to manage unrelated processes.

## Working method

For each milestone:

1. Review the relevant code and tests before editing.
2. Implement one narrowly scoped item.
3. Add or update focused tests.
4. Run `npm run check` and any platform-specific smoke test.
5. Update MAP.md status.
6. Make one focused commit.

Do not start the next item until the current item's exit criteria are met or the blocker is documented here.

## Non-goals

- Tripwire never kills, restarts, opens, or manages processes.
- Tripwire does not inject full command lines, environments, or process inventories into LLM context.
- The footer does not become a replacement for Pi's whole footer.
- Global PID snapshots are intentionally not used; they cannot prove that a listener belongs to this Pi session.
