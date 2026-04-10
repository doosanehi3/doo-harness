# Reference Sources

This project was shaped by a mix of external official documentation and local
comparison codebases.

## Official External References

### Anthropic

- `Harness design for long-running application development`
  - Core lessons about coherence collapse, context resets, handoffs, and
    generator/evaluator separation in long-running coding work

## OpenAI

- `Harness engineering: leveraging Codex in an agent-first world`
  - Core lessons about repository legibility, observability, encoded
    verification/recovery loops, and the shift from "prompting harder" to
    engineering better agent environments

## Local Comparison Codebases

- `roach-pi`
  - Important as the nearest comparison for a workflow-heavy layer built on
    top of `pi-coding-agent`
- `pi-coding-agent`
  - Important as the substrate reference for auth, provider transport, model
    registry, sessions, and interactive product UX
- `pi-ai`
  - Important as the substrate reference for provider breadth and OAuth-aware
    model transport

## What We Took From These References

- Long-running work needs more than a single growing transcript
- Coherence under long tasks requires resets plus structured handoff
- Verification should be a hard gate, not a polite suggestion
- Generator/evaluator separation matters for code quality
- Repository knowledge and artifacts should become the system of record
- Provider/auth/model UX is real product surface, not an afterthought
- Workflow modes are valuable, but they do not replace a runtime that owns
  task, milestone, and recovery semantics

## What We Explicitly Did Not Copy

- We did not keep the whole product centered on a single session shell
- We did not treat workflow as sufficient by itself without artifact-led state
- We did not fully fork or clone `pi-coding-agent`; instead we started with an
  independent runtime and later reused the parts of `pi` that were clearly
  substrate concerns
