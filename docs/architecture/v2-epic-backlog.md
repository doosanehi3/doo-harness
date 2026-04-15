# Harness v2 Epic Backlog

Date: 2026-04-15
Status: Draft

## Purpose

This document turns the v2 product improvement plan into a concrete execution
backlog.

Source plan:

- [v2-product-improvement-plan.md](/Users/baekdoosan/Documents/DOO/harness/docs/architecture/v2-product-improvement-plan.md)

The goal is to define work that can be scheduled, implemented, and verified
without losing the runtime/substrate boundary established in v1.

## Prioritization Summary

### P0

- `EPIC-1` review pipeline
- `EPIC-2` retrieval and search
- `EPIC-3` operator HUD
- `EPIC-4` autonomous entrypoints

### P1

- `EPIC-5` artifact browser and timeline

### P2

- `EPIC-6` operator onboarding

## Common v2 Guardrails

All epics must preserve:

- runtime ownership in Harness
- substrate reuse through `pi-coding-agent`
- verification as a runtime gate
- handoff/reset/recovery semantics
- artifact-first repository state

No epic should hide runtime truth behind UI polish.

## EPIC-1: Review Pipeline

### Goal

Turn review into a real operator workflow with selectable depth and explicit
targets.

### Why now

This is the clearest product-surface gap against `roach-pi`.

### Scope

Build:

- `harness review quick`
- `harness review diff`
- `harness review deep`
- target selection by:
  - active task
  - git diff
  - file list
  - artifact path
- structured review JSON payloads with summary sections
- review history index over runtime artifacts

Do not build yet:

- generalized external PR review integration
- review features that bypass runtime verification state

### Acceptance criteria

- operators can choose review depth intentionally
- review results are structured and comparable
- review surfaces stay connected to active task/runtime context
- tests cover CLI JSON payload shape and hosted pi extension entrypoints

### Dependencies

- none

### Suggested first slice

1. add subcommand parsing for `review quick|diff|deep`
2. implement `diff` target selection and machine-readable payload
3. add history listing over review artifacts

## EPIC-2: Retrieval And Search

### Goal

Upgrade search from thin `rg` wrappers into runtime-aware context recovery.

### Scope

Build:

- unified search entrypoint:
  - files
  - content
  - artifacts
  - task references
  - recent runtime outputs
- grouped results instead of flat-only output
- artifact-aware search filters
- "recent failures" and "active task artifacts" recall helpers
- extension widget formatting for grouped search results

Do not build yet:

- heavyweight indexing service
- external code search infrastructure

### Acceptance criteria

- common recovery/search tasks can be done from the product shell
- artifact and runtime state are searchable first-class objects
- search results are meaningfully grouped and ranked

### Dependencies

- can start independently
- benefits from `EPIC-5` artifact browser metadata

### Suggested first slice

1. add artifact search mode
2. add task-aware search grouping
3. add recent verification/review recall helpers

## EPIC-3: Operator HUD

### Goal

Make the next safe action and current runtime truth readable at a glance.

### Scope

Build:

- compact HUD line / widget format
- dashboard sections for:
  - current state
  - blockers
  - verification readiness
  - recent artifacts
  - handoff readiness
- clearer severity formatting for warning/blocked/completed
- better distinction between summary and full status

Do not build yet:

- highly custom graphical UI outside current shell surfaces

### Acceptance criteria

- operator can identify next action without reading full status output
- blocked and unsafe states are obvious in UI surfaces
- hosted pi widget output remains machine-testable

### Dependencies

- depends lightly on current status payload
- benefits from `EPIC-5` artifact/timeline summaries

### Suggested first slice

1. add compact status summary mode
2. add blocker/verification/handoff summary widget
3. add recent artifact summary section

## EPIC-4: Autonomous Entry Points

### Goal

Let operators start common long-running loops with one intentional command.

### Scope

Build:

- backlog pick-up entrypoint
- verification queue entrypoint
- review queue entrypoint
- blocked-task inspection entrypoint
- handoff cleanup / inspection entrypoint
- lightweight task intake to runtime-plan conversion

Do not build yet:

- background daemons with unbounded autonomous execution
- autonomy that is detached from runtime state

### Acceptance criteria

- common repeat workflows become one-command entrypoints
- entrypoints are state-aware and runtime-safe
- autonomy does not bypass verification/recovery invariants

### Dependencies

- benefits from `EPIC-1` and `EPIC-2`

### Suggested first slice

1. blocked-task inspection command
2. review queue command
3. backlog pick-up command

## EPIC-5: Artifact Browser And Timeline

### Goal

Turn artifact ownership into an obvious product advantage.

### Scope

Build:

- artifact browser by type and recency
- artifact metadata index
- session/runtime transition timeline
- links from active task to related artifacts
- recovery timeline view:
  - last pass
  - last failure
  - blocker reason
  - recovery hint

Do not build yet:

- remote artifact service
- non-repo external persistence

### Acceptance criteria

- operators can inspect runtime artifacts without dropping to raw filesystem
- interruption and recovery state are legible from product surfaces

### Dependencies

- can proceed after the P0 work starts
- improves `EPIC-2` and `EPIC-3`

### Suggested first slice

1. artifact list with type/recency filters
2. recent timeline view
3. active-task related-artifact view

## EPIC-6: Operator Onboarding

### Goal

Reduce setup friction and make first success faster.

### Scope

Build:

- stronger doctor/config guidance
- missing dependency diagnosis
- clearer first-run flow
- bootstrap templates for common repo shapes
- more explicit distinction between:
  - local smoke
  - interactive smoke
  - release smoke

Do not build yet:

- full interactive setup wizard outside current shell surfaces

### Acceptance criteria

- new operator can reach first success with less manual doc hunting
- doctor surfaces identify missing prerequisites clearly
- bootstrap paths reduce greenfield setup tax

### Dependencies

- none

### Suggested first slice

1. enhance doctor and missing dependency output
2. add template/bootstrap presets
3. tighten first-run help and install docs

## Recommended Execution Order

### Sequence A: Highest Product Impact

1. `EPIC-1` review pipeline
2. `EPIC-2` retrieval and search
3. `EPIC-3` operator HUD
4. `EPIC-4` autonomous entrypoints

### Sequence B: Harness-Specific Differentiation

5. `EPIC-5` artifact browser and timeline
6. `EPIC-6` operator onboarding

## Suggested First Implementation Wave

If v2 starts immediately, the best first wave is:

1. `EPIC-1` first slice
2. `EPIC-2` first slice
3. `EPIC-3` compact summary mode

That combination improves the product most quickly while staying inside the
current architecture.
