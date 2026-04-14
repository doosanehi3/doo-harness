# roach-pi Gap Analysis

Date: 2026-04-14

## Scope

This note compares the current `roach-pi` codebase at `v1.8.0` against the
runtime goals of this harness.

The comparison is not "which project is better overall."

It is specifically:

- what `roach-pi` now does well
- where it is still workflow-first rather than runtime-first
- which parts of the harness remain strategically distinct

## Current roach-pi Snapshot

After fetching upstream, local `main` fast-forwarded from `aefc81a` to
`0f4c67b` (`v1.8.0`).

Recent additions materially increased the surface area:

- `agentic-harness` review pipeline: `/review`, `/ultrareview`
- `fff-search` extension with FFF-backed `find` / `grep`
- `autonomous-dev` extension for issue polling and worker dispatch
- nested subagent visibility and process-accounting work
- substantial design, review, and milestone documentation under
  `docs/engineering-discipline/`

Relevant entry points:

- `roach-pi/package.json`
- `roach-pi/extensions/agentic-harness/index.ts`
- `roach-pi/extensions/autonomous-dev/index.ts`
- `roach-pi/extensions/fff-search/index.ts`

## What roach-pi Is Strong At

### 1. Productized pi overlay

`roach-pi` is now a fairly broad extension suite on top of `pi-coding-agent`.
Its root package registers five extension entry points:

- `extensions/agentic-harness/index.ts`
- `extensions/hud-dashboard/src/index.ts`
- `extensions/session-loop/index.ts`
- `extensions/autonomous-dev/index.ts`
- `extensions/fff-search/index.ts`

This means the project is no longer just a prompt-and-skill bundle. It is an
integrated operator-facing shell around pi.

### 2. Review and orchestration throughput

The strongest recent growth is around review throughput.

`/review` provides a direct single-pass review path.
`/ultrareview` provides a staged multi-agent review pipeline:

1. resolve diff
2. dispatch 10 reviewer subagents
3. run verifier
4. run synthesis and save report

This is a real pipeline, not just a naming convention in docs.

### 3. Search substrate improvements

`fff-search` upgrades file/content search and optionally replaces `@`
autocomplete. That improves repository legibility and should reduce one of the
main friction points in long sessions: file retrieval quality.

### 4. Tighter pi-native autonomy

`autonomous-dev` is meaningful because it moves beyond ad hoc manual prompting
and turns issue polling plus worker launch into a persistent extension concern.
It now calls `runAgent(...)` rather than only documenting that behavior.

## Where roach-pi Still Stops Short Of Harness Runtime Ownership

### 1. State is extension-phase state, not task-runtime state

The clearest line is state ownership.

`roach-pi` persists a small extension state object in
`~/.pi/extension-state.json`. The persisted shape is:

- `phase`
- `activeGoalDocument`

That is useful workflow memory, but it is not a long-running runtime model.

It does not natively own:

- task ledger
- milestone ledger
- dependency graph
- active verification target
- recovery hints
- blocker semantics as first-class runtime records
- handoff/reset invariants tied to repo-local state

By contrast, this harness persists both:

- `.harness/state/run-state.json`
- `.harness/artifacts/task-state.json`

and `TaskState` explicitly owns milestone/task status, dependencies, owners,
verification commands, outputs, blockers, recovery hints, and last
verification/review/handoff paths.

This remains the biggest architectural difference.

### 2. Verification is still mostly workflow behavior, not a hard runtime gate

`roach-pi` has strong review workflows, but that is not the same thing as
runtime verification ownership.

Its review commands create prompts that instruct the agent to perform review
work. That is valuable, but the invariant mostly lives in the workflow prompt.

This harness instead treats verification as a runtime concern:

- explicit verification phases
- verification status written into task state
- verification artifacts
- completion gating through `canComplete(...)`
- automatic re-queue and recovery guidance when verification fails

That distinction matters because prompt-level verification is easier to bypass,
while runtime-gated verification becomes part of the system contract.

### 3. Handoff and reset remain distinct harness capabilities

The harness treats handoff and reset as first-class runtime operations.

That shows up in:

- persisted handoff path in state
- explicit handoff artifact generation
- reset behavior that refuses unsafe resets without preserving handoff

`roach-pi` has strong session/product UX, but it does not currently expose the
same artifact-backed handoff/reset semantics as core runtime primitives.

### 4. Tool policy is less tightly coupled to runtime state

The harness couples phase and task state to tool policy. Runtime decisions can
block or narrow tool use based on the current phase and task condition.

`roach-pi` does have workflow guidance and review/agent restrictions, but the
control logic is still largely attached to command handlers, system prompt
injection, and subagent conventions. That is closer to orchestrated workflow
policy than to a runtime that owns "what is allowed next" as an invariant.

### 5. Repo-local artifact system is still thinner

`roach-pi` stores many human-authored planning and review docs under
`docs/engineering-discipline/`, which is useful. But those docs are not yet the
same thing as a runtime-managed artifact ledger that the engine continuously
reads and mutates as the source of truth.

The harness more explicitly centers:

- spec
- plan
- milestones
- review
- verification
- handoff
- task-state

as runtime artifacts under `.harness/artifacts/`.

That gives the harness a stronger repository-native recovery story after
interruptions and resets.

## Places Where roach-pi Has Narrower Gaps Than Before

The gap is smaller than it was a few days ago.

### Autonomous-dev is no longer only aspirational

A stale completion note still says worker integration uses a stub, but the
current extension actually wires worker execution through `runAgent(...)`.

So the project has moved from:

- "documented autonomous engine"

to:

- "real extension with worker launch, lifecycle logging, and HUD state"

That is a substantial maturity increase even if the runtime model remains
lighter than the harness.

### Review pipeline is operational, not rhetorical

The review commands are implemented and guarded with target validation. This
reduces one common weakness of workflow-first systems: lots of conceptual modes
with shallow execution. In this area, `roach-pi` is concrete.

### Search quality is now a strategic advantage

FFF integration gives `roach-pi` a stronger retrieval surface than this harness
currently has. That matters because long-running task coherence depends not only
on state ownership, but also on how efficiently the agent can relocate context.

## Concrete Gaps And Rough Severity

### High: runtime state ownership

`roach-pi` still lacks a task/milestone/verification/handoff runtime state
model comparable to the harness.

Impact:

- weaker recovery semantics
- less explicit continuation logic
- fewer hard invariants around progress and completion

### High: verification as system contract

`roach-pi` is strong at review, but review is not yet the same as runtime
verification gating tied to task progression.

Impact:

- easier to claim progress without durable verification state
- weaker automatic recovery after failed verification

### Medium: handoff/reset semantics

`roach-pi` has session and extension UX, but not the same repo-local handoff
artifact contract.

Impact:

- weaker interruption/resume path for very long tasks

### Medium: documentation/runtime drift

There is visible drift between docs and code:

- autonomous-dev completion note still describes stub wiring
- README says `npm test`, but root package has no `test` script
- root package still references `extensions/hud-dashboard/src/index.ts`, which
  is missing from the tree

Impact:

- lowers operator trust
- makes "claimed completeness" harder to verify

## Why Harness Still Has Strategic Value

The harness continues to justify itself if the product goal is:

- repository-owned long-running task state
- explicit milestone and dependency progression
- verification as a hard runtime gate
- handoff/reset as normal and durable operating primitives
- operator surfaces that read directly from runtime truth

In other words, `roach-pi` is increasingly a strong substrate-plus-orchestration
overlay, but this harness still better captures the idea that long-running
development needs a real runtime, not just stronger commands.

## Updated Conclusion

The earlier architectural conclusion still holds.

Best long-term direction:

- use `pi` / `roach-pi`-style systems for substrate, UX, extension surfaces,
  search, and orchestration ergonomics
- keep a harness-owned runtime core for state, artifacts, verification, and
  recovery semantics

The key point is no longer that `roach-pi` is missing long-running thinking.
It clearly has that ambition now.

The key point is that its center of gravity is still workflow-first and
extension-first, while the harness center of gravity is runtime-first.

That difference remains strategically real.

## Suggested Next Comparison Work

If we continue the comparison, the highest-value next step is:

1. isolate which harness runtime primitives could be rehosted cleanly on top of
   pi substrate APIs
2. avoid re-implementing pi-native UX/search/session machinery locally
3. preserve repo-local artifact/state/verification ownership as the non-negotiable
   runtime layer
