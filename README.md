# Tripwire

Tripwire is an extension for [Pi](https://pi.dev) that quietly shows relevant local listening processes in Pi's default footer and highlights servers attributed to the current Pi session.

Example:

```text
hugo:1313 node:5173 python:8000
```

It is meant to answer: “what localhost ports are relevant, and what did Pi start for me?”

Servers started by the agent in this Pi session are highlighted (accent color). Servers you started yourself — either in this project (detected via process cwd) or recognizable dev servers anywhere (`node`, `hugo`, `python`, …) — are shown dimmed instead of hidden, so the footer also answers “what dev servers are already running?”

## Install

Install from npm:

```sh
pi install npm:pi-tripwire
```

Or install from GitHub:

```sh
pi install git:github.com/wdphoto/pi-tripwire
```

Then restart Pi or run:

```text
/reload
```

## Project-only install

If you only want Tripwire in one project:

```sh
cd /path/to/project
pi install -l npm:pi-tripwire
# or
pi install -l git:github.com/wdphoto/pi-tripwire
```

Then run `/reload` in Pi.

## Local checkout install

If you cloned this repo and want Pi to load your local copy:

```sh
pi install /path/to/pi-tripwire
```

Or project-only:

```sh
cd /path/to/project
pi install -l /path/to/pi-tripwire
```

After editing the local checkout, run `/reload` in Pi.

## Compatibility

This revision is checked against Pi 0.84.1 and Node.js 22.19 or newer. macOS uses `lsof`; Linux combines `lsof` and `ss` results when available. Windows listener discovery is not yet supported. Process visibility and attribution remain subject to operating-system permissions.

## Notes

Tripwire shows servers spawned by Pi agent shell commands in `accent`. Relevant servers you started yourself are shown dimmed when they are in the current project or match a known dev-server command such as `node`, `hugo`, or `python`.

The dimmed project/external tiers are relevance heuristics, not proof of user ownership. Tripwire tags Pi-spawned bash child processes with small `PI_TRIPWIRE_*` environment markers for attribution, and uses scoped process ancestry as a best-effort fallback.

If another extension already replaces Pi's `bash` tool, Tripwire leaves it untouched and disables command attribution rather than modifying visible command text.

Tripwire only observes. It does not stop processes, restart them, or open browsers.
