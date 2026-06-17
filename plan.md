# Tripwire Plan

Tripwire is the second pass on our old `localhost-ports.ts` footer extension.

MVP: **show only localhost server ports spawned by Pi agent tool calls**, as a compact footer status with no prefix:

```text
hugo:1313 node:5173 python:8000
```

Human-started processes, external terminals, current-project inference, and other-project colors are postponed. Important: a Hugo server started in another terminal will **not** show in MVP unless it was spawned by a Pi agent tool call.

## Baseline: `localhost-ports.ts`

Found in local backup prior art:

```text
agent/extensions/localhost-ports.ts
```

What it did well:

- Used `ctx.ui.setStatus(...)`, not a full custom footer. Correct shape.
- Scanned listeners with `lsof -iTCP -sTCP:LISTEN -n -P`.
- Kept footer labels simple: `command:port`.
- Used theme colors for owner/provenance.
- Used OSC 8 links so `hugo:1313` could be Cmd-clickable as `http://localhost:1313`.
- Cleaned up interval state on `session_shutdown`.

What we should change this pass:

- Old approach inferred ownership by `ps` snapshots before/after tool calls. That is simple, but can misattribute unrelated processes created at the same time.
- Old extension included `agent`, `user`, and `external` owners. Good idea, too much for MVP.
- Old parser was inline in one file. Fine for a prototype; split parsing/classification/formatting for maintainability.
- Old scan was effectively macOS/`lsof`-first. Keep `lsof`, but hide platform details behind a scanner adapter.

## Current product decisions

- File is `AGENTS.md` because Pi auto-loads that context file.
- Footer labels stay terse: `hugo:1313`, `node:5173`, `python:8000`.
- No `Tripwire` prefix in the footer.
- No `@project` suffix in MVP.
- No `/tripwire` command in MVP unless debugging becomes painful.
- No kill/open/browser/process-manager actions.
- Tripwire observes; it does not manage processes.
- Use one clear Pi/agent color for MVP. More provenance colors can come later.

## MVP definition

- [x] Package-shaped repo scaffold: `package.json`, `tsconfig.json`, `extensions/tripwire/`, tests.
- [x] Pi extension entrypoint exports `default function (pi: ExtensionAPI)`.
- [x] `session_start`: initialize state, start one scan interval, render initial status.
- [x] `session_shutdown`: clear interval and clear `ctx.ui.setStatus("tripwire", undefined)`.
- [x] Track Pi agent `bash` tool calls only.
- [x] Identify listeners spawned by those tool calls.
- [x] Scan TCP `LISTEN` ports.
- [x] Format compact clickable footer labels.
- [x] Clear footer status when no Pi-spawned listeners exist.
- [x] Tests for parser, attribution, and formatting.

## Attribution strategy

We want to know: “did this listener come from a Pi agent shell command?”

### Preferred mechanism: hidden env marker

On `tool_call` for the built-in `bash` tool, prepend small env exports to the command:

```sh
export PI_TRIPWIRE_SESSION='...'
export PI_TRIPWIRE_ACTOR='agent'
export PI_TRIPWIRE_CWD='...'
```

Any child server process should inherit this metadata. During scans, Tripwire checks only these keys and never dumps full env.

Pros:

- More accurate than PID snapshots.
- Survives command wrappers like `npm`, `npx`, `hugo`, `python`, etc.
- Lets us avoid external/user detection for MVP.

Risks:

- Mutating shell commands must be done carefully.
- Reading process env differs by OS and can fail. Fail closed: if we cannot prove Pi spawned it, do not show it in MVP.

### Fallback/reference mechanism: PID snapshot

The old extension used:

1. snapshot all PIDs before a bash tool call
2. snapshot all PIDs after the tool result
3. mark new PIDs as agent-owned

Keep this in mind as fallback, but do not make it our first choice because unrelated processes can appear in the same time window.

## Scanning strategy

Use an adapter interface:

```ts
interface ListenerScanner {
  scan(signal?: AbortSignal): Promise<RawListener[]>;
}
```

MVP adapters:

- `lsof` adapter first: available on macOS and many Linux systems.
- `ss` Linux fallback if needed.

Raw listener fields:

```ts
type RawListener = {
  pid: number;
  command: string;
  port: number;
  host?: string;
  protocol: "tcp";
};
```

Enriched listener fields:

```ts
type TrackedListener = RawListener & {
  label: string;              // hugo, node, python, vite, etc.
  url: string;                // http://localhost:<port>
  tripwireSession?: string;
  tripwireActor?: "agent";
};
```

## Rendering strategy

Use `ctx.ui.setStatus("tripwire", formatted)`.

Rules:

- Only show listeners attributed to the current Tripwire/Pi session.
- No visible prefix; render only port labels.
- Label format: `<label>:<port>`.
- Sort by port, then label.
- Make labels OSC 8 clickable to `http://localhost:<port>`.
- Use `ctx.ui.theme.fg("accent", ...)` or similar for Pi-spawned labels.
- Max items in footer, then `+N` overflow.
- Use ANSI-width-safe truncation from `@earendil-works/pi-tui` if needed.

## Suggested source layout

Keep this small extension colocated under its Pi entrypoint:

```text
extensions/
  tripwire/
    index.ts        # Pi package entrypoint and lifecycle wiring
    lsof.ts         # lsof adapter and parser
    env.ts          # read only PI_TRIPWIRE_* metadata for pid
    classify.ts     # current-session attribution and labels
    format.ts       # footer text, colors, OSC 8 links
    config.ts       # hardcoded defaults for now
    types.ts        # shared types
    *.test.ts
```

## Implementation phases

### Phase 0 — scaffold

- [x] Add package metadata with `pi` manifest.
- [x] Add TypeScript config.
- [x] Add test runner.
- [x] Add README with dev/install/share notes.

### Phase 1 — port scanning

- [x] Implement pure `parseLsofListeners(output)` with fixtures.
- [x] Implement `LsofScanner` with timeout.
- [ ] Add Linux fallback only if needed after first manual test.

### Phase 2 — Pi-spawn attribution

- [x] Generate stable per-Pi-session id on `session_start` from Pi session file, so `/reload` does not orphan existing servers.
- [x] Mutate agent `bash` tool calls to export `PI_TRIPWIRE_*` markers.
- [x] Read marker metadata for listener PIDs.
- [x] Filter to current session + actor `agent`.
- [x] Add fallback notes/tests for unavailable env reads.

### Phase 3 — footer status

- [x] Format clickable `label:port` parts.
- [x] Color all MVP entries as Pi/agent-spawned.
- [x] Clear status when empty.
- [x] Ensure interval cleanup across `/reload`, `/new`, `/resume`, `/fork`, and quit.

### Phase 4 — tests/manual QA

- [ ] Parser fixtures for lsof IPv4, IPv6, wildcard host, localhost.
- [ ] Attribution tests: current session shown, other session hidden, unmarked hidden.
- [ ] Formatter tests: clickable labels, overflow, truncation.
- [ ] Manual: agent starts `python3 -m http.server 8000 &` => `python:8000` appears.
- [ ] Manual: agent starts `hugo server -D --port 1313 &` => `hugo:1313` appears.
- [ ] Manual: unrelated pre-existing listener stays hidden.
- [ ] Manual: `/reload` keeps showing already-spawned marked servers from the same Pi session.
- [ ] Manual: server exits => footer clears on next scan.

## Second-pass ideas

Postpone until MVP feels solid:

### Human/external project listeners

We do want this, but not in the first implementation.

Scenario: the user starts `hugo server` in another terminal. Tripwire should be able to show it **when it is related to the current Pi project**, even though Pi did not spawn it.

Proposed rules:

- If listener cwd is under current `ctx.cwd`, show it as current-project/human/external with a different color from agent-spawned.
- If listener cwd is under a known code root but not current `ctx.cwd`, optionally show as other-project in a dim color or hide by default.
- If cwd cannot be read, keep it hidden unless it has a Pi marker.
- Baseline listeners are okay to show if they are current-project listeners; baseline should mainly suppress unrelated system noise.

Implementation notes:

- Add per-pid cwd lookup (`lsof -a -p <pid> -d cwd -Fn` or platform equivalent).
- Add `source: "agent-session" | "current-project" | "other-project"` classification.
- Keep footer labels unchanged (`hugo:1313`); only color changes.

Other second-pass items:

- Human-run shell commands inside Pi, colored differently.
- tmux attribution support:
  - Direct agent-spawned tmux sessions may work if `PI_TRIPWIRE_*` env markers are inherited.
  - Existing tmux servers/windows may not inherit the current agent shell env, so listeners started there may be hidden or only caught by the weak PID-snapshot fallback.
  - Future approach: detect tmux commands and explicitly propagate markers with `tmux set-environment`, `tmux new-session -e`, or a small helper/wrapper.
  - Goal remains attribution, not process management: show tmux-started listeners only when we can prove this Pi agent/session caused them.
- `/tripwire` debug command with pid/cwd/why details.
- Config file for ignore ports/processes and display choices.
- Smarter labels for `node` wrappers (`vite`, `next`, `astro`, etc.).
- Open/copy/kill actions only if we explicitly choose to become more than a footer indicator.

## Packaging compatibility note

Keep the Pi-facing entrypoint stable when possible:

```text
extensions/tripwire/index.ts
```

The extension implementation is intentionally colocated at `extensions/tripwire/`. If we ever split internals out again, keep `extensions/tripwire/index.ts` and `package.json` updated together.

Package installs follow the `pi.extensions` manifest, so local/git/npm package users should update cleanly after `/reload` or `pi update`. Direct file installs to old paths are the only compatibility risk. We do not recommend direct file installs except one-off `pi -e` testing.

Review this before any major path/name cleanup.

## Sharing and local workflow

Build it package-shaped from the start, but keep one source repo.

1. **Source of truth**: this Git checkout.
2. **Personal project-local activation**:
   ```sh
   cd /path/to/project-that-needs-tripwire
   pi install -l /path/to/pi-tripwire
   ```
3. **Development**: edit the checkout, run `npm run check`, then `/reload` in the target Pi project.
4. **Avoid duplicates**: do not copy Tripwire into `.pi/extensions/` or `~/.pi/agent/extensions/` during normal development.
5. **Quick one-off test**: run `pi -e ./extensions/tripwire/index.ts`.
6. **Share with others**: push the repo to GitHub and install from git:
   ```sh
   pi install git:github.com/wdphoto/pi-tripwire
   ```
7. **Team/project pin**:
   ```sh
   pi install -l git:github.com/wdphoto/pi-tripwire@v0.1.0
   ```
8. **npm later** only if it becomes generally useful and we want versioned public maintenance.

## Open questions

1. Is command mutation with env exports acceptable, or should we wrap the bash tool with `createBashTool(...spawnHook...)` for cleaner env injection?

## Next review notes

Captured before reboot:

- Review current Tripwire code for idiomatic Pi extension usage and cleanup opportunities.
- Consider config options, especially display controls, ignore lists, refresh interval, and whether human/current-project listeners are enabled by default.
- Consider a `/tripwire toggle` command that temporarily hides/disables the Tripwire footer status without uninstalling the extension.
- Consider a more verbose `/tripwire` command/debug view that lists listener processes across sessions/terminals with attribution details.
- Revisit second-pass attribution for human-started processes outside Pi: classify and show `agent` vs `human/current-project` while keeping compact footer labels.

## Return-to-this checklist

Captured after running `pi update` to Pi `0.79.6`:

1. Manual QA Tripwire against updated Pi:
   - Agent starts `python3 -m http.server 8000 &` => footer shows `python:8000`.
   - Agent starts `hugo server -D --port 1313 &` => footer shows `hugo:1313`.
   - Agent starts a Node/Vite dev server => footer shows compact `node:<port>` or better label.
   - Unrelated pre-existing listeners stay hidden.
   - `/reload` keeps showing already-spawned marked servers from the same Pi session.
   - Server exit clears footer on the next scan.
2. Update local dev dependency/lock to match the globally updated Pi version when useful. Global Pi is `0.79.6`; current local lock was observed at `@earendil-works/pi-coding-agent@0.79.4`.
3. Re-evaluate env injection approach:
   - Current MVP mutates built-in `bash` tool calls by prepending `export PI_TRIPWIRE_*` lines.
   - Pi docs now document `createBashTool(..., { spawnHook })`, which may be cleaner but requires wrapping/overriding the built-in bash tool.
   - Keep current mutation for MVP unless manual QA shows brittleness.
4. Finish test checklist:
   - More `lsof` parser fixtures for IPv4, IPv6, wildcard host, localhost.
   - Attribution tests for current session shown, other session hidden, unmarked hidden.
   - Formatter edge tests for clickable labels, overflow, and truncation if/when width limits are added.
5. Release hygiene:
   - If manual QA passes, commit current packaging/docs changes as maintenance work.
   - Bump/publish only if we want a new public release beyond `0.0.3`.
6. Post-MVP: human/current-project listeners:
   - Detect listener cwd under current `ctx.cwd`.
   - Keep labels as `<process>:<port>` and use color for provenance.
   - Keep unrelated listeners hidden by default.
