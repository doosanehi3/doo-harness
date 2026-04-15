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

## Launch

```bash
pi --no-extensions -e /absolute/path/to/harness/packages/extensions/src/pi-extension.ts
```

## Manual Checks

1. Startup shows the extension in the loaded extensions list
2. Enter `/harness help --json`
3. Enter `/harness status --json`
4. Confirm the command is accepted as a slash command rather than treated as a
   plain natural-language prompt
5. Confirm output appears through the expected extension path:
   - notification
   - widget
   - or non-UI fallback when applicable

## Expected Result

- the Harness extension loads without crashing the session
- `/harness` is recognized
- help/status payloads are reachable from an actual interactive pi session

## Current Note

Manual smoke remains the source of truth for the real interactive pi session.

The scriptable UI capture closes the widget/notification evidence gap and is
now part of the release gate, but it does not replace the real interactive
slash-command smoke.
