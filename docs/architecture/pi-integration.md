# pi Integration Strategy

## Current Position

This harness started as an independent runtime because the initial goal was to
make long-running workflow primitives first-class:

- artifact-driven state
- explicit task and milestone ledgers
- handoff and reset
- verification gates
- dependency-aware continuation

Those concerns were treated as the core product, not as an add-on to an
existing coding agent shell.

## Why It Did Not Start Directly On pi-coding-agent

At the beginning, the main concern was control over runtime ownership:

- who owns session state
- who owns the tool loop
- who owns workflow phase transitions
- who owns verification and recovery semantics

Using `pi-coding-agent` directly as the base would have made those concerns
start life as overlays. Building an independent runtime kept those primitives
under direct local control while they were still being invented.

This distinction is important in light of the external harness-engineering
references:

- Anthropic's long-running harness writeup emphasizes coherence loss, reset,
  and structured handoff over simply extending a single conversation
- OpenAI's harness-engineering writeup emphasizes that the execution loop,
  validation loop, and repository/environment legibility become the real system

Those lessons point toward runtime ownership, not just stronger workflow modes.

## What Changed

As the harness matured, some layers turned out not to be differentiators:

- auth storage
- provider breadth
- model transport
- interactive product UX

Those are areas where `pi-coding-agent` and `pi-ai` already provide strong
infrastructure. Rebuilding all of them locally would create duplicated product
investment with little strategic gain.

This is why the current implementation already selectively reuses pi pieces:

- `pi-auth` credential storage at `~/.pi/agent/auth.json`
- `pi-ai` transport for `openai-codex`
- ChatGPT subscription authentication via the same Codex OAuth credentials used
  by `pi-coding-agent`

## Long-Term Direction

Long term, the likely shape is:

- keep the harness runtime as the owner of workflow, artifact, and verification
  semantics
- reuse more of `pi-coding-agent` for the substrate layer

That substrate includes:

- session machinery
- model registry
- auth storage
- provider transport
- interactive UX and selectors

The runtime layer that should stay local includes:

- phase machine
- artifact ledger
- handoff and reset
- dependency-aware continuation
- verification gating
- operator-oriented provider readiness and smoke surfaces

## Practical Reading

This means the end state is not:

- "replace the harness with pi"

It is:

- "rehost the harness runtime on a stronger pi-based substrate"

## Migration Principle

When deciding whether a capability belongs in the harness or in pi:

- if it is primarily about workflow control, recovery, verification, or
  artifact-driven progress, keep it in the harness
- if it is primarily about auth, provider transport, model/session product UX,
  or generic coding-agent substrate, prefer pi reuse

## Runtime vs Workflow

This distinction matters:

- a workflow mode such as `ralph` is a persistence and execution policy
- the runtime is the stateful engine that knows the current phase, task,
  milestone, blocker, handoff point, verification state, and tool policy

In other words:

- workflow answers: "how aggressively should the system keep going?"
- runtime answers: "what state is the work in, what is allowed next, and how do
  we recover if the current step fails?"

This is why simply placing a stronger workflow mode on top of a session shell is
not enough. Long-running development work still needs a runtime that owns:

- task and milestone state
- artifact persistence
- verification gates
- reset and resume semantics
- tool access policy

The long-term integration goal is therefore:

- let `pi-coding-agent` provide more of the substrate
- keep long-running runtime ownership local to the harness
