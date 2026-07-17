# Tripwire Agent Notes

> Pi loads this `AGENTS.md` file automatically. Keep it current as project decisions change.

## Project

Tripwire is a Pi extension that quietly shows local server processes spawned by Pi agent work. The footer should answer: “what localhost ports did Pi start for me?”

Example footer status:

```text
hugo:1313 node:5173 python:8000
```

## Product principles

- **Signal over surveillance.** Agent-spawned listeners (this Pi session) render in `accent`. Human-started listeners are shown too, dimmed: `project` origin (process cwd under `ctx.cwd`, any command) and `external` origin (other cwd, command in `DEV_COMMANDS`). Non-dev system listeners stay hidden.
- **Default footer stays sacred.** Prefer `ctx.ui.setStatus("tripwire", ...)`; do not replace Pi’s whole footer with `setFooter()` unless we have a strong reason.
- **Invisible when quiet.** If nothing relevant is listening, clear the status entirely.
- **Read-only observer.** Tripwire never kills processes, opens network connections, or changes project files as part of scanning.
- **Line first, command later.** Do not add commands/UI unless they earn their keep. A debug command can come later, but MVP is the footer status.
- **Maintainable > spooky.** Small pure parser/classifier modules with tests. No giant shell-regex mudball.

## Pi extension rules to remember

- Read Pi extension docs before changing API usage:
  - `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/extensions.md`
  - `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/tui.md`
- Extension factories must not start timers/watchers/processes. Start session resources in `session_start`; clean them in `session_shutdown`.
- Guard UI calls with `ctx.hasUI`; guard TUI-specific custom components with `ctx.mode === "tui"`.
- Tripwire workflow: keep one source checkout; activate per project with `pi install -l /path/to/pi-tripwire`; use `/reload` in the target project after edits.
- Do not copy Tripwire into `.pi/extensions/` or `~/.pi/agent/extensions/` during normal development. That creates duplicate active copies.
- Do not install Tripwire globally unless the user explicitly wants it in every Pi project.
- Use `pi -e ./extensions/tripwire/index.ts` only for quick one-off tests.
- Keep the Pi-facing entrypoint `extensions/tripwire/index.ts` stable when possible. Tripwire's implementation is colocated under `extensions/tripwire/`.
- Keep sensitive process data out of LLM context. Footer/status UI is fine; do not inject full command lines or env into messages unless the user asks.

## Detection model

Preferred MVP approach:

1. On `session_start`, derive a stable session id and start with empty snapshot-owned PID state.
2. Track Pi-launched shell commands from the `tool_call` / `tool_result` lifecycle.
3. Prefer a hidden env marker for robust attribution when possible. `PI_TRIPWIRE_SESSION` should be derived from Pi's session file so `/reload` does not orphan already-running servers:
   - `PI_TRIPWIRE_SESSION`
   - `PI_TRIPWIRE_ACTOR=agent`
   - Do not include cwd in the MVP marker; it is not needed for session attribution and should stay out of visible command fallbacks.
   - If another extension owns `bash`, fail closed by default. Visible command-prelude injection is an opt-in compatibility mode only.
4. Keep the previous snapshot-PID approach only as a weak fallback for environments where env reads fail; avoid broadening it in ways that misclassify unrelated processes.
5. Scan listeners periodically and after bash tool calls/results using a small cross-platform adapter:
   - Use `lsof` where available.
   - Add `ss`/Linux fallback instead of making Tripwire feel macOS-specific.
6. `agent` origin requires marker/session attribution (env marker, or PID snapshot when explicitly enabled). This is the only tier that proves Pi spawned it.
7. `project` origin detects listeners whose process cwd is under current `ctx.cwd` (via `cwd.ts`: `/proc/<pid>/cwd` on Linux, batched `lsof -a -p <pids> -d cwd -Fn` elsewhere). `external` origin catches remaining localhost listeners whose label is in `DEV_COMMANDS`. Both render in `dim`; agent renders in `accent`. Agent attribution always wins over project/external for the same `label:port`.
8. Render compact labels as `<process>:<port>` in the footer, with no visible `Tripwire` prefix. Origin is conveyed by color only, never `@project`-style text.

## Code shape we want

When implementation starts, prefer this structure:

```text
extensions/
  tripwire/
    index.ts        # Pi package entrypoint and lifecycle wiring
    lsof.ts         # lsof execution + parser
    cwd.ts          # per-process cwd lookup (lsof -Fn / /proc) + parser
    classify.ts     # origin (agent/project/external) rules and label heuristics
    format.ts       # footer/status formatting and future origin colors
    config.ts       # defaults and config parsing
    types.ts        # shared types
    *.test.ts       # parser/classifier/formatter tests
```

## Development expectations

- TypeScript, dependency-light. Use Node built-ins and Pi-provided packages unless a dependency earns its keep.
- Before committing/releasing run `npm run check`.
- `npm run check` runs tests, TypeScript typecheck, and production audit (`npm audit --omit=dev`).
- Maintain both distribution paths going forward: GitHub installs (`pi install git:github.com/wdphoto/pi-tripwire`) and npm installs (`pi install npm:pi-tripwire`) should stay valid.
- For releases, keep GitHub and npm in sync: update `version`, README install examples, package metadata/files, publish npm, tag/push the matching GitHub release/tag, and verify with `npm view pi-tripwire version` plus a GitHub install reference.
- Pi does not require a special lint/test command for packages; our repo owns its release gate.
- Parser/classifier/formatter should be pure functions and easy to test with fixture strings.
- Keep timers idempotent; never leak intervals across `/reload`, `/new`, `/resume`, `/fork`, or shutdown.
- Keep scans cheap. Default refresh is currently 10 seconds, plus immediate refresh after bash activity.
- The footer text is plain labels (`hugo:1313`). MVP may use one Pi-spawned color only; later origin is conveyed by color, not noisy suffixes.
- The footer line must be ANSI-width safe if we color it. Use `truncateToWidth` / `visibleWidth` from `@earendil-works/pi-tui` when needed.

## Prior art

The first attempt was a local backup prototype at `agent/extensions/localhost-ports.ts`.

Useful ideas from it:
- `ctx.ui.setStatus("localhost-ports", ...)` rather than custom footer replacement.
- `lsof -iTCP -sTCP:LISTEN -n -P` for listener discovery.
- OSC 8 hyperlinks for clickable `http://localhost:<port>` labels.
- compact labels like `hugo:1313`.

Things to improve:
- It tracked new PIDs by before/after `ps` snapshots, which is simple but can misattribute unrelated processes born during the same window.
- It included user/external categories; MVP should postpone those.

## Open questions

See `plan.md` for the working checklist and remaining product questions. Ask before adding scope beyond the footer line.
