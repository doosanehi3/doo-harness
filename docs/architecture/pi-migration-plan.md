# pi-coding-agent Migration Plan

## Goal

Move toward a product shape where:

- `pi-coding-agent` provides more of the substrate
- the harness continues to own long-running runtime semantics

This is not a plan to discard the harness runtime. It is a plan to reduce
duplicated substrate work while preserving runtime ownership.

## Non-Negotiable Semantics To Preserve

Any migration must preserve:

- phase state
- task and milestone ledgers
- artifact-first state
- verification as a runtime gate
- handoff and reset
- dependency-aware continuation
- recovery hints and blocker semantics
- operator provider readiness and smoke surfaces

If a migration step weakens one of those, it is a regression.

## Candidate Substrate To Reuse More Aggressively

The following are the best candidates to move under `pi-coding-agent`
ownership:

- session substrate
- auth storage
- model registry
- provider transport
- interactive UX
- settings and selectors

The following should remain local runtime concerns:

- phase machine
- artifact ledger
- verification ownership
- recovery ownership
- task and milestone ownership
- handoff and reset semantics

## Proposed Migration Stages

### Stage 1. Keep current hybrid, reduce duplicate seams

Current state already includes:

- `pi-auth` reuse
- `pi-ai` transport for `openai-codex`
- provider readiness, smoke, and doctor surfaces

Near-term goal:

- stabilize the current hybrid
- reduce local substrate duplication where that does not change runtime ownership

### Stage 2. Rehost more transport and model selection onto pi

Move toward:

- more provider paths routed through pi substrate
- less local model/auth/transport special casing
- stronger reuse of `pi-coding-agent` model and auth layers

### Stage 3. Rehost the agent substrate

Move from local `agent-core` responsibilities toward pi-owned agent/session
machinery where practical.

Requirement:

- the harness runtime must still be able to impose phase-aware tool policy,
  verification semantics, and recovery semantics

### Stage 4. Tight integration with pi interactive shell

If desired, move from a separate CLI/TUI shell toward a tighter product surface
inside a pi-based shell.

Requirement:

- operator surfaces such as provider-doctor, artifact-led state, and
  verification-led continuation must remain visible and explicit

## Decision Rule

For any specific feature, ask:

1. Is this a substrate concern or a long-running runtime concern?
2. If moved onto pi, do we lose ownership of state, verification, or recovery?
3. Does moving it reduce duplicated maintenance without weakening the runtime?

Only migrate features that pass all three tests.

## Immediate Practical Recommendation

Do not rewrite the harness wholesale.

Instead:

1. keep the runtime local
2. keep proving semantics with dogfood and tests
3. migrate substrate concerns incrementally
4. re-evaluate after each step

This keeps the current value while lowering long-term maintenance cost.
