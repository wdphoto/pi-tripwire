# Tripwire

Tripwire is a Pi extension that shows localhost server ports spawned by Pi agent shell commands in the footer.

It is the second pass on the old `localhost-ports.ts` prototype: same tiny footer idea, cleaner attribution and package shape.

## Behavior

If the agent starts a local server, Tripwire shows compact clickable labels in Pi's footer:

```text
hugo:1313 node:5173 python:8000
```

No prefix. No process manager. No external/human-started process inference yet.

## Personal project-local workflow

Our preferred workflow is **one source repo, project-local activation**.

Source of truth:

```text
/Users/illwill/Code/pi-tripwire
```

Enable Tripwire only in projects that need it:

```sh
cd /path/to/project-that-needs-tripwire
pi install -l /Users/illwill/Code/pi-tripwire
```

That writes a project-local package entry to `.pi/settings.json`. Pi loads Tripwire only for that project.

Disable it for that project:

```sh
cd /path/to/project-that-has-tripwire
pi remove -l /Users/illwill/Code/pi-tripwire
```

Avoid copying files into `.pi/extensions/` or `~/.pi/agent/extensions/`; that creates duplicate active copies. Edit only `/Users/illwill/Code/pi-tripwire`.

## Development loop

Terminal A — edit/test the extension repo:

```sh
cd /Users/illwill/Code/pi-tripwire
npm run check
```

Terminal B — run Pi from a project where Tripwire is installed project-locally:

```sh
cd /path/to/project-that-needs-tripwire
pi
# after edits, run /reload inside Pi
```

Quick one-off test without installing:

```sh
pi -e ./extensions/tripwire/index.ts
```

## Sharing from GitHub

This repo is package-shaped. `package.json` exposes the extension with:

```json
"pi": {
  "extensions": ["./extensions/tripwire/index.ts"]
}
```

Once the repo is on GitHub, others can install latest `main`:

```sh
pi install git:github.com/<user>/pi-tripwire
```

Or a pinned stable tag:

```sh
pi install git:github.com/<user>/pi-tripwire@v0.1.0
```

For project/team sharing, install the GitHub package project-locally:

```sh
cd /path/to/project
pi install -l git:github.com/<user>/pi-tripwire@v0.1.0
```

## Release checklist

Pi does not require a special lint/test command to release an extension package. It loads the `pi.extensions` manifest and executes the TypeScript entrypoint.

Our release gate is:

```sh
npm run check
```

Then smoke-test in a Pi project:

1. Install project-locally with `pi install -l /Users/illwill/Code/pi-tripwire`.
2. Start/reload Pi.
3. Ask the agent to start a local server.
4. Confirm the footer shows only the compact port label, e.g. `python:8765`.
5. Confirm `/reload` still recognizes the already-running server.

If sharing a stable release:

```sh
git tag v0.1.0
git push origin main --tags
```

## Design

- Package entrypoint lives at `extensions/tripwire/index.ts` so Pi displays the extension as `tripwire`, not `src`.
- Uses `ctx.ui.setStatus("tripwire", ...)`, not a custom footer replacement.
- Marks agent shell commands with hidden `PI_TRIPWIRE_*` env vars.
- Scans TCP `LISTEN` ports and only displays listeners attributed to the current Pi session.
- Uses OSC 8 links so labels can be opened as `http://localhost:<port>` in supported terminals.
- Pi core packages are peer dependencies and dev dependencies; they are optional peers so production installs do not bundle Pi itself.
