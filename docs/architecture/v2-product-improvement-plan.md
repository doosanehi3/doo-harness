# Harness v2 Product Improvement Plan

Date: 2026-04-15
Status: Draft

## Purpose

This plan covers the product work that comes **after** the v1
`pi-ready runtime-core product` milestone.

v1 proved that the harness can:

- own long-running runtime semantics
- expose a coherent operator loop
- sit on top of `pi-coding-agent` as a real extension shell

v2 should make the product feel stronger in day-to-day use, not just stronger
in architecture.

The main question is no longer:

- can the harness own runtime semantics?

It is now:

- can the harness become the better operator product without giving up runtime
  ownership?

## Planning Inputs

This plan incorporates the known product-surface gaps called out during the
`roach-pi` comparison:

- deeper review pipeline
- richer search/retrieval
- stronger HUD/dashboard surface
- autonomous workflow entrypoints

It also adds additional v2 needs inferred from the current harness shape:

- artifact browsing and inspection
- session/recovery visibility
- operator setup/doctor polish
- multi-agent execution observability
- stronger repo onboarding/bootstrap paths

## v2 Product Goal

Deliver a product that is not only runtime-correct, but also feels
operator-complete:

- easier to inspect
- easier to drive
- easier to recover
- easier to delegate
- easier to trust in long sessions

## Non-Negotiable Boundary

v2 must not blur the existing boundary:

- `pi-coding-agent` remains the preferred substrate
- Harness remains the owner of runtime state, verification, recovery, handoff,
  reset, and phase-aware policy

Any v2 feature that weakens that boundary is a regression, even if it improves
UX.

## v2 Workstreams

### 1. Review Pipeline

#### Problem

The harness now has review surfaces, but they are still thinner than the
productized review pipeline in `roach-pi`.

#### Desired v2 outcome

Review becomes a first-class operator workflow, not just a post-verification
artifact path.

#### Planned improvements

- `review quick` for fast operator inspection
- `review diff` for current changes or target range review
- `review deep` for staged review with verifier/synthesis
- review target selection by:
  - active task
  - current diff
  - file list
  - artifact path
- review history browsing from runtime artifacts
- explicit review summary artifacts with machine-readable metadata

#### Acceptance shape

- operators can choose review depth intentionally
- review output is structured and comparable across runs
- review remains connected to verification/runtime state rather than becoming a
  detached prompt shell

### 2. Search And Retrieval

#### Problem

The current `find` / `grep` surfaces are useful, but they are still thin
operator wrappers around `rg`.

#### Desired v2 outcome

Search becomes a context-recovery system, not just a shell shortcut.

#### Planned improvements

- unified search entrypoint for:
  - files
  - content
  - artifacts
  - task/milestone references
  - recent runtime outputs
- artifact-aware retrieval:
  - spec
  - plan
  - milestones
  - verification
  - review
  - handoff
- symbol/code-aware search where practical
- recent-context recall:
  - "what changed recently?"
  - "what did the last verification fail on?"
  - "what artifacts belong to the active task?"
- ranking and grouping instead of flat shell output

#### Acceptance shape

- long-running context can be relocated from the product shell without dropping
  into raw shell usage for common recovery tasks
- artifact and runtime state can be searched as first-class product objects

### 3. HUD And Dashboard

#### Problem

The harness status surface is informative, but still thinner than the richer
operator overlay surface seen in `roach-pi`.

#### Desired v2 outcome

The operator can understand the current runtime state at a glance.

#### Planned improvements

- compact runtime HUD:
  - phase
  - active milestone/task
  - verification state
  - blocker state
  - next safe action
- dashboard views for:
  - active work
  - recent artifacts
  - blocked tasks
  - verification history
  - handoff readiness
- stronger widget formatting in pi
- better distinction between:
  - status
  - warning
  - blocked
  - completed

#### Acceptance shape

- operators do not need to read a long status dump to know the next action
- the UI makes unsafe states obvious

### 4. Autonomous Workflow Entry Points

#### Problem

The harness runtime is strong, but it still relies on the operator to manually
drive many repeated flows.

#### Desired v2 outcome

Common operational loops can be started intentionally with one command and run
through runtime-safe behavior.

#### Planned improvements

- backlog pick-up entrypoint
- recurring verification / review queue entrypoint
- blocked-task inspection entrypoint
- handoff inspection / cleanup entrypoint
- batch triage of pending work
- lightweight issue/task intake to runtime plan conversion

#### Acceptance shape

- operators can start common long-running loops without rebuilding the workflow
  manually each time
- entrypoints remain runtime-safe and state-aware

## Additional v2 Features Needed Beyond The roach-pi Comparison

### 5. Artifact Browser

The artifact system is a strategic advantage, but it is still more powerful
than it is usable.

Needed:

- browse artifacts by type and recency
- inspect artifact metadata without opening files manually
- navigate from active task to related artifacts

Why it matters:

- the harness should win on runtime artifacts in product experience, not only
  in architecture

### 6. Session Timeline And Recovery Visibility

Long-running work is only trustworthy if interruption and recovery are legible.

Needed:

- recent transition timeline
- why the runtime paused
- what changed between the last success and the current blocker
- explicit recovery suggestions surfaced in the operator shell

Why it matters:

- this is one of the harness's real differentiators and should be visible

### 7. Multi-Agent Observability

If the product leans into orchestration, operators need to see what the lanes
are doing without reading raw logs.

Needed:

- current subagent/task lane status
- pending vs running vs completed work
- latest verifier/reviewer outputs
- compact view of delegation results

Why it matters:

- orchestration without visibility feels opaque and lower-trust

### 8. Setup, Doctor, And Install UX

The harness is installable, but the setup story still leans on documentation
more than product guidance.

Needed:

- stronger config doctor
- clearer missing-dependency diagnosis
- repo bootstrap / first-run guidance
- better distinction between local-only smoke, real interactive smoke, and
  release-gate smoke

Why it matters:

- v2 product quality includes how fast a new operator can get to first success

### 9. Template And Bootstrap Paths

The runtime is strong once work exists, but new projects still require more
manual shaping than ideal.

Needed:

- starter goal templates
- repo-shape-aware planning presets
- stronger blank-repo bootstrap affordances

Why it matters:

- v2 should reduce setup tax for greenfield and brownfield work

## Prioritization

### P0: v2 Core Product Surface

Build these first:

1. review pipeline depth
2. richer search/retrieval
3. HUD/dashboard strengthening
4. autonomous workflow entrypoints

These are the most visible product gaps relative to `roach-pi`.

### P1: Harness-Specific Product Advantages

Build these next:

5. artifact browser
6. session timeline and recovery visibility
7. multi-agent observability

These are the places where the harness can become not just competitive, but
distinctly better.

### P2: Adoption And Onboarding Quality

Then strengthen:

8. setup/doctor/install UX
9. template/bootstrap paths

These matter for adoption and repeatability, but they are less urgent than the
core product surfaces.

## What v2 Should Avoid

Avoid these traps:

- chasing raw command count without improving operator legibility
- rebuilding substrate features that `pi-coding-agent` already handles well
- hiding runtime truth behind polished but vague dashboard surfaces
- adding autonomy that bypasses verification/recovery invariants
- turning artifact ownership into optional documentation rather than system
  behavior

## Success Criteria

v2 is successful when:

- operators prefer the harness shell for common long-running tasks instead of
  dropping to ad hoc shell or prompt workflows
- recovery and review are faster than in v1
- search and inspection are materially better than raw `rg` usage
- multi-agent execution is more visible and more trustworthy
- runtime ownership remains explicit and unweakened

## Immediate Next Planning Step

Break the v2 plan into implementation epics:

1. `EPIC-1 review-pipeline`
2. `EPIC-2 retrieval-and-search`
3. `EPIC-3 operator-hud`
4. `EPIC-4 autonomous-entrypoints`
5. `EPIC-5 artifact-browser-and-timeline`
6. `EPIC-6 operator-onboarding`

Execution backlog:

- [v2-epic-backlog.md](/Users/baekdoosan/Documents/DOO/harness/docs/architecture/v2-epic-backlog.md)
