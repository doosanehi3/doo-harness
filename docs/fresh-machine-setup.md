# Fresh Machine Setup

This checklist defines the minimum fresh-machine contract for running the
Harness CLI and the pi-hosted extension path.

## Required Tools

- Node.js 22.x or newer
- `pnpm`
- `ripgrep` (`rg`) on `PATH`
- `expect`
- `python3`
- `pi` CLI when validating the extension surface

`ripgrep` is required for:

- `harness find`
- `harness grep`
- `/harness find`
- `/harness grep`

If `rg` is missing, the search commands fail with an explicit runtime error.

`expect` and `python3` are required for:

- `pnpm run smoke:pi:interactive`

## Workspace Bring-Up

From a fresh checkout:

```bash
pnpm install
pnpm run dev -- help
pnpm run check
pnpm run test
```

Then run:

```bash
harness doctor
harness bootstrap
```

## pi Extension Validation

For extension validation on a fresh machine, run:

```bash
pnpm run smoke:pi:print
pnpm run smoke:pi:install
pnpm run smoke:pi:ui
pnpm run smoke:pi:interactive
```

Then run the manual interactive smoke from
[interactive-pi-smoke.md](/Users/baekdoosan/Documents/DOO/harness/docs/interactive-pi-smoke.md).

## Expected Outcome

A machine is considered ready when:

- the workspace checks pass
- `harness doctor` shows no missing required tools
- the automated pi smoke commands pass
- manual interactive `/harness` commands render and respond inside pi
