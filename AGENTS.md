# Tripwire Agent Notes

> Pi loads this `AGENTS.md` file automatically. Keep it current as project decisions change.

## Project

Tripwire is a Pi extension that quietly shows relevant local server processes. The footer should answer: “what localhost ports are relevant, and what did Pi start for me?”

Example footer status:

```text
hugo:1313 node:5173 python:8000
```

## Product principles

- **Signal over surveillance.** Agent-spawned listeners (this Pi session) render in `accent`. Human-started listeners are shown too, dimmed: `project` origin (process cwd under `ctx.cwd`, any command) and `external` origin (other cwd, command in `DEV_COMMANDS`). Non-dev system listeners stay hidden.
- **Default footer stays sacred.** Prefer `ctx.ui.setStatus("tripwire", ...)`; do not replace Pi’s whole footer with `setFooter()` unless we have a strong reason.
- **Invisible when quiet.** If nothing relevant is listening, clear the status entirely.
- **Read-only observer.** Tripwire never kills processes, opens network connections, or changes project files as part of scanning.
- **Line first, command later.** Do not add commands/UI unless they earn their keep; the footer is the product surface.
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

Current approach:

1. On `session_start`, derive a stable session id and reset session-owned state.
2. Track Pi-launched shell activity from the `tool_call` / `tool_result` lifecycle.
3. Use a hidden env marker for attribution. `PI_TRIPWIRE_SESSION` should be derived from Pi's session file so `/reload` does not orphan already-running servers:
   - `PI_TRIPWIRE_SESSION`
   - `PI_TRIPWIRE_ACTOR=agent`
   - Do not include cwd in the marker.
   - If another extension owns `bash`, fail closed; do not mutate visible commands.
4. Scan listeners periodically and after bash tool calls/results using a small cross-platform adapter:
   - Use `lsof` where available.
   - Add `ss`/Linux fallback instead of making Tripwire feel macOS-specific.
5. `agent` origin requires current-session marker attribution or scoped ancestry from the current Pi process. This is the only tier that proves Pi spawned it.
6. `project` origin detects listeners whose process cwd is under current `ctx.cwd` (via `cwd.ts`: `/proc/<pid>/cwd` on Linux, batched `lsof -a -p <pids> -d cwd -Fn` elsewhere). `external` origin catches remaining localhost listeners whose label is in `DEV_COMMANDS`. Both render in `dim`; agent renders in `accent`. Agent attribution always wins over project/external for the same `label:port`.
7. Render compact labels as `<process>:<port>` in the footer, with no visible `Tripwire` prefix. Origin is conveyed by color only, never `@project`-style text.

## Code shape

Keep the implementation small and modular:

```text
extensions/
  tripwire/
    index.ts        # Pi package entrypoint and lifecycle wiring
    runtime.ts      # session resources, bash attribution, refresh coordination
    scanner.ts      # adapter orchestration, health, and deduplication
    lsof.ts         # macOS/POSIX listener execution + parser
    ss.ts           # Linux listener fallback + parser
    cwd.ts          # per-process cwd lookup (lsof -Fn / /proc) + parser
    env.ts          # per-process Tripwire marker lookup + parser
    ancestry.ts     # scoped process-parent parsing and lookup
    session.ts      # stable session-id derivation
    classify.ts     # origin (agent/project/external) rules and label heuristics
    format.ts       # footer/status formatting, colors, and links
    config.ts       # defaults and known dev commands
    types.ts        # shared types
    *.test.ts       # unit, runtime, and opt-in integration coverage
```

## Development expectations

- TypeScript, dependency-light. Use Node built-ins and Pi-provided packages unless a dependency earns its keep.
- Follow Pi package guidance for bundled core packages: keep `@earendil-works/pi-coding-agent` as a `"*"` peer/dev dependency, do not bundle it, and keep `package-lock.json` refreshed so local typechecks exercise the current Pi API.
- Before committing/releasing run `npm run check`.
- `npm run check` runs tests, TypeScript typecheck, and a production audit with lifecycle scripts disabled (`npm audit --omit=dev --ignore-scripts`).
- Maintain both distribution paths going forward: GitHub installs (`pi install git:github.com/wdphoto/pi-tripwire`) and npm installs (`pi install npm:pi-tripwire`) should stay valid.
- For releases, keep GitHub and npm in sync: update `version`, README install examples, package metadata/files, publish npm, tag/push the matching GitHub release/tag, and verify with `npm view pi-tripwire version` plus a GitHub install reference.
- Pi does not require a special lint/test command for packages; our repo owns its release gate.
- Parser/classifier/formatter should be pure functions and easy to test with fixture strings.
- Keep timers idempotent; never leak intervals across `/reload`, `/new`, `/resume`, `/fork`, or shutdown.
- Keep scans cheap. Default refresh is currently 10 seconds, plus immediate refresh after bash activity.
- The footer text is plain labels (`hugo:1313`). Agent listeners use `accent`; project/external heuristic listeners use `dim`; origin is conveyed by color, not noisy suffixes.
- The footer line must be ANSI-width safe if we color it. Use `truncateToWidth` / `visibleWidth` from `@earendil-works/pi-tui` when needed.

## Open questions

See `MAP.md` for the active roadmap and current technical decisions. Ask before adding scope beyond the footer line.
