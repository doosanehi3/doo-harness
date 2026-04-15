# Interactive pi Smoke

This is the current manual smoke procedure for the interactive pi-hosted
Harness path.

## Purpose

Verify that the real pi session can load the Harness extension and expose the
`/harness` command surface in an interactive environment.

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

Manual smoke is the source of truth for interactive behavior.

The scriptable smoke path is still being stabilized and should not yet be the
only release gate for slash-command behavior.
