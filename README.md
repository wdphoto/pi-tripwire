# Tripwire

Tripwire is a Pi extension that shows localhost server ports spawned by Pi agent shell commands in the footer.

It is the second pass on the old `localhost-ports.ts` prototype: same tiny footer idea, cleaner attribution and package shape.

## MVP behavior

If the agent starts a local server, Tripwire shows compact clickable labels in Pi's footer:

```text
hugo:1313 node:5173 python:8000
```

No prefix. No process manager. No external/human-started process inference yet.

## Development

Quick test:

```sh
pi -e ./src/index.ts
```

Reload-friendly local install:

```sh
mkdir -p .pi/extensions/tripwire
cp -R src package.json .pi/extensions/tripwire/
# then start pi from this project and use /reload while iterating
```

Package-shaped git install later:

```sh
pi install git:github.com/<user>/pi-tripwire
```

## Design

- Uses `ctx.ui.setStatus("tripwire", ...)`, not a custom footer replacement.
- Marks agent shell commands with hidden `PI_TRIPWIRE_*` env vars.
- Scans TCP `LISTEN` ports and only displays listeners attributed to the current Pi session.
- Uses OSC 8 links so labels can be opened as `http://localhost:<port>` in supported terminals.
