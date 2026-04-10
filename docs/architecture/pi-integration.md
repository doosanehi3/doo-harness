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

This is the specific reason the phrase `long-running runtime` appears so often
in these docs: both external harness-engineering references point toward a
system that can survive long tasks through explicit state, verification, and
recovery mechanisms, not merely through better prompts or stronger workflow
commands.

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

## What pi-coding-agent Already Does Well

`pi-coding-agent` is already strong at the substrate layer:

- session machinery
- model registry
- auth storage
- provider transport
- interactive UX
- tool substrate
- extension and prompt surfaces

Those are real harness-engineering concerns, but they belong more to the
product substrate than to the long-running runtime layer.

## What Still Needs A Separate Runtime Layer

What `pi-coding-agent` does not fully make first-class on its own is the
long-running runtime layer:

- artifact-first state as the main source of truth
- explicit task and milestone ledgers
- handoff and reset as normal operating primitives
- verification as a runtime gate rather than a convention
- dependency-aware continuation and recovery semantics

That is the gap a thicker overlay or dedicated runtime layer must fill.

The current direction of this harness is explicitly aimed at that ownership:

- state ownership
- verification ownership
- recovery ownership

In other words, the goal is not to add more workflow commands on top of pi, but
to ensure that the overlay layer actually controls long-running semantics.

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

This also means a `roach-pi`-style approach can work, but only if the overlay is
thick enough to own real runtime semantics instead of acting as prompt-only
workflow decoration.

In that sense, `roach-pi` should not be read as having ignored long-running
concerns. A better reading is that it addresses those concerns primarily from a
workflow-first angle, whereas this harness tries to pull them further down into
runtime primitives.

So the important distinction is not:

- independent runtime versus pi substrate

It is:

- no runtime ownership versus real runtime ownership

An independent runtime was one way to get that ownership early. A sufficiently
thick overlay on top of `pi-coding-agent` can also implement it.

## Why Workflow-First Is Still Attractive

Handling long-running concerns at the workflow layer has real advantages:

- lower implementation complexity
- faster product polish through reuse of `pi-coding-agent`
- less duplicated work in auth, session, provider, and UX layers
- easier upstream alignment as `pi-coding-agent` evolves

The trade-off is that workflow-first solutions can leave long-running semantics
too implicit unless the overlay also owns real state, verification, and
recovery behavior.

At this point, the main benefits of the original independent-runtime path have
already been harvested:

- we clarified what runtime ownership actually means
- we proved the value of artifact-first long-running primitives
- we identified the specific semantics that must not be lost in a migration

Because of that, the balance shifts over time: continuing to rebuild substrate
concerns locally becomes less attractive, while deeper reuse of
`pi-coding-agent` becomes more attractive.

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

See also:

- `pi-migration-plan.md` for a staged migration outline
