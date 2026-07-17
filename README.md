# Tripwire

Tripwire is an extension for [Pi](https://pi.dev) that is triggered by the processes your agent spins up in the background. It helps troubleshoot when the agent isn't even on the same server or session as you.

Example:

```text
hugo:1313 node:5173 python:8000
```

It is meant to answer: “what local servers did the agent start for me?”

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

Pinned versions work for either source:

```sh
pi install npm:pi-tripwire@0.0.6
pi install git:github.com/wdphoto/pi-tripwire@v0.0.6
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

## Notes

Tripwire currently shows servers spawned by Pi agent shell commands. Servers you started yourself in another terminal are not shown yet.

Tripwire tags Pi-spawned bash child processes with small `PI_TRIPWIRE_*` environment markers for attribution, then reads only those markers from listener processes.

If another extension already replaces Pi's `bash` tool, Tripwire leaves it untouched and disables command attribution rather than modifying visible command text.

Tripwire only observes. It does not stop processes, restart them, or open browsers.
