# Tripwire

Tripwire is a Pi extension that shows localhost server ports spawned by Pi agent shell commands in the footer.

It is the second pass on the old `localhost-ports.ts` prototype: same tiny footer idea, cleaner attribution and package shape.

## MVP behavior

If the agent starts a local server, Tripwire shows compact clickable labels in Pi's footer:

```text
hugo:1313 node:5173 python:8000
```

No prefix. No process manager. No external/human-started process inference yet.

## Install for yourself

From this checkout:

```sh
pi install /Users/illwill/Code/pi-tripwire
```

That installs this repo as a user Pi package, so Tripwire loads in future Pi sessions. Use `/reload` in an existing Pi session or restart Pi.

Check installed packages:

```sh
pi list
```

Remove it:

```sh
pi remove /Users/illwill/Code/pi-tripwire
```

## Development

Quick one-off test without installing:

```sh
pi -e ./extensions/tripwire/index.ts
```

Normal local development loop:

```sh
npm test
npm run typecheck
# edit files, then use /reload in Pi
```

Package-shaped git install later:

```sh
pi install git:github.com/<user>/pi-tripwire@v0.1.0
```

## Design

- Package entrypoint lives at `extensions/tripwire/index.ts` so Pi displays the extension as `tripwire`, not `src`.
- Uses `ctx.ui.setStatus("tripwire", ...)`, not a custom footer replacement.
- Marks agent shell commands with hidden `PI_TRIPWIRE_*` env vars.
- Scans TCP `LISTEN` ports and only displays listeners attributed to the current Pi session.
- Uses OSC 8 links so labels can be opened as `http://localhost:<port>` in supported terminals.
