# Tripwire

Tripwire is a tiny Pi extension that shows localhost servers started by the Pi agent in the footer.

Example:

```text
hugo:1313 node:5173 python:8000
```

It is meant to answer: “what local server did the agent start for me?”

## Install

Install the latest release from GitHub:

```sh
pi install git:github.com/wdphoto/pi-tripwire@v0.0.1
```

Or install the latest `main`:

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
pi install -l git:github.com/wdphoto/pi-tripwire@v0.0.1
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

Tripwire only observes. It does not stop processes, restart them, or open browsers.
