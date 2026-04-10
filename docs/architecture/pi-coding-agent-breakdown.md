# pi-coding-agent Breakdown

This document analyzes `pi-coding-agent` as a product substrate from a harness-engineering perspective.

## High-Level Philosophy

`pi-coding-agent` is designed as an extensible coding-agent substrate rather than a fixed workflow product.

Its core philosophy is:

- keep the base agent product strong
- keep workflow assumptions comparatively light
- let users adapt the system through prompts, skills, extensions, and packages

This means `pi-coding-agent` is not primarily trying to be a long-running
artifact-led runtime by itself. It is trying to be a strong host for many
different workflows.

## Layered Structure

At a high level, the system breaks down into:

1. CLI and mode entrypoints
2. Session and runtime control
3. Auth, model, and provider substrate
4. Tool substrate
5. Resource and extension loading
6. Interactive product shell

## 1. CLI and Mode Entry

Key files:

- `packages/coding-agent/src/main.ts`
- `packages/coding-agent/src/cli/*`
- `packages/coding-agent/src/modes/*`

Responsibilities:

- parse CLI arguments
- decide interactive / print / json / rpc mode
- process stdin and file inputs
- restore or select sessions
- bootstrap the selected mode

This is already more than a simple CLI wrapper. The system is built from the
start to support multiple execution surfaces, including embedding and process
integration.

## 2. SDK / Composition Root

Key file:

- `packages/coding-agent/src/core/sdk.ts`

Responsibilities:

- compose `AuthStorage`
- compose `ModelRegistry`
- compose `SettingsManager`
- compose `SessionManager`
- compose `ResourceLoader`
- choose tools
- construct the underlying `Agent`
- wrap everything into `AgentSession`

This is the true composition root of the product. It turns many lower-level
pieces into a coherent session.

## 3. AgentSession

Key file:

- `packages/coding-agent/src/core/agent-session.ts`

Responsibilities:

- own the live `Agent`
- subscribe to agent events
- persist session messages
- manage model and thinking level changes
- queue steering and follow-up messages
- run compaction and branch summarization
- execute bash and record results
- mediate extension hooks
- handle auto-retry for retryable failures

`AgentSession` is the central control object of `pi-coding-agent`.
It is shared across run modes, which makes it the closest thing the system has
to a runtime core.

However, it is still fundamentally session-centered rather than
artifact-and-ledger-centered.

## 4. AgentSessionRuntime

Key file:

- `packages/coding-agent/src/core/agent-session-runtime.ts`

Responsibilities:

- own the current `AgentSession` and its cwd-bound services
- switch sessions
- create new sessions
- fork sessions
- import sessions
- tear down and replace runtime state safely

This layer makes session replacement and session lifecycle a first-class
operation.

It is strong infrastructure for productized agent use, especially around
session switching and resumability.

## 5. SessionManager

Key file:

- `packages/coding-agent/src/core/session-manager.ts`

Responsibilities:

- append-only session persistence
- tree-based branching
- leaf management
- message/model/thinking/session-info entries
- branch summaries
- build the resolved session context sent to the model

Important design point:

- stored session structure and LLM-facing context are not identical

That separation is powerful and shows a mature session model.

## 6. AuthStorage

Key file:

- `packages/coding-agent/src/core/auth-storage.ts`

Responsibilities:

- store API keys and OAuth credentials in `auth.json`
- support runtime API key overrides
- support env fallback
- refresh OAuth credentials with locking
- expose provider readiness to the rest of the product

This is one of the strongest parts of the system.
It treats auth as product infrastructure, not as a loose environment-variable
convention.

## 7. ModelRegistry and Model Resolution

Key files:

- `packages/coding-agent/src/core/model-registry.ts`
- `packages/coding-agent/src/core/model-resolver.ts`

Responsibilities:

- combine built-in and custom models
- apply provider-specific auth availability
- restore prior model selection
- surface only usable models
- support model cycling and scoped models

This turns models into product-level objects instead of loose identifiers.

## 8. Tool Substrate

Key files:

- `packages/coding-agent/src/core/tools/*`
- `packages/coding-agent/src/core/bash-executor.ts`

Responsibilities:

- provide built-in coding tools
- support custom cwd-aware tool factories
- normalize tool definitions for extension wrapping
- queue file mutation safely
- capture and persist bash execution results

This is the operational substrate that the model actually acts through.

## 9. Resource Loader and Extension System

Key files:

- `packages/coding-agent/src/core/resource-loader.ts`
- `packages/coding-agent/src/core/extensions/runner.ts`
- `packages/coding-agent/src/core/prompt-templates.ts`
- `packages/coding-agent/src/core/skills.ts`

Responsibilities:

- load AGENTS, prompts, skills, themes, and context files
- discover and bind extensions
- mediate lifecycle hooks
- mediate tool call and tool result interception
- mediate provider request interception
- expose custom command and UI surfaces

This is where `pi-coding-agent` becomes a platform instead of a closed product.

## 10. Interactive Product Shell

Key file:

- `packages/coding-agent/src/modes/interactive/interactive-mode.ts`

Responsibilities:

- render the TUI
- manage input and queue behavior
- expose model, theme, OAuth, and queue selectors
- integrate tree navigation and session controls
- host extension UI

This layer is product-quality operator UX.

## What pi-coding-agent Does Especially Well

From a harness-engineering point of view, `pi-coding-agent` is especially
strong at the substrate layer:

- session substrate
- auth and provider substrate
- model registry
- interactive product shell
- tool substrate
- extension and prompt host

This is why it is such a strong candidate as a long-term substrate.

## What It Does Not Fully Solve On Its Own

What it does not make fully first-class by default is the long-running runtime
layer:

- artifact-first state as the main source of truth
- explicit task and milestone ledgers
- verification as a hard runtime gate
- handoff and reset as normal operating primitives
- dependency-aware continuation
- recovery semantics centered on task state rather than session state

Those are the areas where a thicker overlay or a dedicated runtime layer is
still needed.

## The Most Important Architectural Reading

`pi-coding-agent` is best understood as:

- a strong coding-agent substrate
- not a complete long-running harness runtime by itself

This is why two statements can both be true:

- it already implements a large part of harness engineering very well
- a separate long-running runtime layer is still justified on top of it
