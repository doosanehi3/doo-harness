# ADR: Initial pi Substrate Adapter Host

Date: 2026-04-14
Status: Accepted

## Decision

The initial host module for the first rehosting seam is:

- `packages/ai/src/pi-substrate-adapter.ts`

The first seam is the **session/tool substrate adapter**.

## Context

Harness is moving toward:

- `pi-coding-agent` as substrate
- Harness runtime core as owner of long-running semantics
- Harness extension shell for operator-facing surfaces

The main risk is collapsing substrate concerns into the runtime package while
trying to rehost onto pi.

## Why This Module

- `packages/ai` already owns the pi-facing auth and transport bridge
- it sits below CLI and above runtime
- it can expose a host contract without forcing `@doo/harness-runtime` to own
  more substrate logic directly

## Interface Direction

The adapter must remain a host contract boundary rather than a second runtime.

Minimum responsibilities:

- session host context
- allowed tool host view

Non-responsibilities:

- task and milestone state
- artifact ledger
- verification gating
- handoff/reset semantics
- recovery ownership

## Rejected Alternatives

### `packages/harness-runtime/src/runtime/harness-runtime.ts`

Rejected because it places substrate hosting inside the runtime package and
weakens the seam.

### `packages/cli/src/main.ts`

Rejected because it is CLI-shell specific and would not be reusable for later
pi-hosted entry points.

### `packages/extensions/*`

Rejected because extensions sit above the runtime and are the wrong layer to
host substrate concerns.
