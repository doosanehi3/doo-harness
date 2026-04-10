# Runtime Architecture

The runtime is split into:

- ai
- agent-core
- harness-runtime
- cli
- tui
- extensions

## Two Core Layers

The harness has two different core concerns:

### 1. Runtime Core

The runtime core owns:

- phase state
- task and milestone state
- artifact persistence
- verification gates
- blocker and recovery semantics
- tool access policy
- handoff and reset behavior

This is the part that keeps long-running work coherent.

### 2. Orchestration Core

The orchestration core owns:

- planner / worker / validator / reviewer role separation
- bounded delegation
- parallel execution lanes
- result collection and synthesis
- retry and escalation behavior

This is the part that keeps throughput and role separation high on complex
tasks.

## Why The Split Matters

If orchestration exists without a strong runtime core, parallel work becomes
hard to recover and verify.

If runtime exists without orchestration, long-running work can stay coherent
but overall throughput and specialization remain limited.

A mature harness needs both:

- runtime for stateful correctness
- orchestration for multi-agent productivity

See also:

- `principles.md` for core design rules
- `pi-integration.md` for the long-term plan to keep workflow ownership local
  while reusing more of the `pi-coding-agent` substrate
