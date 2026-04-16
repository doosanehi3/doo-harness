# Interactive pi Smoke

This is the current interactive and scriptable smoke procedure for the
pi-hosted Harness path.

## Purpose

Verify that the real pi session can load the Harness extension and expose the
`/harness` command surface in an interactive environment.

## Scriptable UI Capture

Run:

```bash
pnpm run smoke:pi:ui
```

This captures:

- the widget lines rendered by the extension
- the notification text emitted by the extension
- a reproducible JSON artifact that can be attached to release notes

The script currently exercises:

- `help --json`
- `status --json`
- `find --json catalog-plan-target`

## Scriptable Interactive Renderer Smoke

Run:

```bash
pnpm run smoke:pi:interactive
```

This drives a real interactive pi session through `expect` and checks:

- extension load visibility
- interactive slash-command palette entry
- real terminal acceptance of the first `/` command-mode step

The current scripted renderer pass intentionally validates the most stable real
interactive invariants first. Richer `/harness ...` renderer surfaces are still
best covered by the existing `smoke:pi:ui` path plus targeted manual inspection
when needed.

Prerequisites for this scripted path:

- `expect`
- `python3`

## Launch

```bash
pi --no-extensions -e /absolute/path/to/harness/packages/extensions/src/pi-extension.ts
```

## Manual Checks

1. Startup shows the extension in the loaded extensions list
2. Enter `/`
3. Confirm the slash-command palette opens in the real session
4. Enter `/harness help --json`
5. Enter `/harness status --json`
6. Confirm the command is accepted as a slash command rather than treated as a
   plain natural-language prompt
7. Confirm output appears through the expected extension path:
   - notification
   - widget
   - or non-UI fallback when applicable

## Expected Result

- the Harness extension loads without crashing the session
- interactive slash-command entry works in the real pi session
- richer `/harness` payload validation is covered by `smoke:pi:ui` plus manual
  inspection when needed

## Current Note

The interactive renderer smoke is now the first automation layer for real pi
session verification.

Manual smoke remains the fallback when the renderer script is inconclusive on a
specific terminal environment.
