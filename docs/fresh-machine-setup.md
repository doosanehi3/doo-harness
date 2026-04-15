# Fresh Machine Setup

This document describes the minimum expected setup for a developer trying the
Harness runtime and pi extension surfaces on a fresh machine.

## Prerequisites

- Node.js 20+
- `pnpm`
- `pi` available on `PATH`, or access to the local package-backed pi CLI path

## Setup Steps

1. Clone the repository
2. Install dependencies:

```bash
pnpm install
```

3. Verify the repo itself:

```bash
pnpm run check
pnpm run test
```

4. Verify the real pi-backed command path with a one-off extension load:

```bash
pi -e /absolute/path/to/harness/packages/extensions/src/pi-extension.ts
```

5. Inside pi, run:

```text
/harness help --json
/harness status --json
```

6. If you want the package installed into the project-local pi config:

```bash
pi install -l /absolute/path/to/harness/packages/extensions
```

## Expected Outcomes

- `pnpm run check` passes
- `pnpm run test` passes
- pi starts with the Harness extension loaded
- `/harness help --json` returns the operator loop payload
- `/harness status --json` returns runtime state JSON

## Failure Modes

### `pi: command not found`

Meaning:

- `pi` is not installed or not on `PATH`

What to do:

- install `pi`
- or invoke the local package-backed CLI path directly for smoke/debugging

### `pnpm install` fails

Meaning:

- runtime/package dependencies are not available yet

What to do:

- fix package manager or network issues first
- do not treat the extension path as validated until install succeeds

### `/harness ...` command is missing inside pi

Meaning:

- extension path was not loaded or not installed

What to do:

- retry with explicit `-e` path
- confirm the local install path in `.pi/settings.json`

### print-mode smoke is inconsistent

Meaning:

- non-interactive command interception may differ from interactive slash-command
  behavior

What to do:

- prefer interactive pi smoke as the source of truth
- treat scriptable smoke as a release-quality target, not yet a hard invariant
