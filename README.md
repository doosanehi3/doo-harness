# Harness

Long-running coding harness for real development work.

It is built around workflow discipline, artifact-driven state, handoff/reset, and independent verification rather than single-shot code generation.

## What It Is

The current implementation supports:

- flow routing for `trivial`, `standard`, `risky`, and `long_running` work
- artifact-driven `spec`, `plan`, `milestones`, `review`, `verification`, and `handoff`
- task and milestone ledgers with dependency-aware progression
- `continue` and `loop` orchestration for long-running work
- role-aware task execution (`planner`, `worker`, `validator`)
- phase-aware and task-aware tool policy
- machine-readable status and artifact surfaces
- role-based model selection via `.harness/config.json`
- OpenAI-compatible provider path with chat-completions and responses-style payload support
- request option forwarding for provider-backed models (`temperature`, `maxTokens`)

This project is more than a collection of workflow commands. It is intended to
own runtime semantics for long-running work:

- artifact-led state
- verification and recovery
- task and milestone control
- tool access policy

## Relation To pi

This project is not a thin extension on top of `pi-coding-agent`.

It started as an independent runtime because the main goal was to make long-running workflow primitives first-class:

- artifact-driven state
- explicit task and milestone ledgers
- handoff and reset
- verification gates
- dependency-aware continuation

Over time it selectively reused pieces of the `pi` stack where that made the system more practical:

- `pi-auth` credential storage (`~/.pi/agent/auth.json`)
- `pi-ai` transport for `openai-codex`
- ChatGPT subscription auth through the same Codex OAuth credentials used by `pi-coding-agent`

The current shape is therefore:

- independent workflow/runtime core
- selective reuse of `pi` auth and provider transport layers

Long term, the likely product direction is to keep the long-running runtime
local while moving more substrate concerns onto `pi-coding-agent`.
See [docs/architecture/pi-integration.md](docs/architecture/pi-integration.md).

## Install

Requirements:

- Node.js 20+
- `pnpm`

Install dependencies from the repo root:

```bash
pnpm install
```

Run the CLI directly from the repo:

```bash
pnpm run start -- /help
```

Core verification commands:

```bash
pnpm run check
pnpm run test
```

## Use With Another Repo

The harness repository is the control plane. A target repo is passed through `HARNESS_CWD_OVERRIDE`.

Example:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /status
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /longrun "Describe the task here"
```

## Quick Start

Initialize a project-local harness config in the target working directory:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /config-init
```

For ChatGPT subscription auth through Codex:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /config-init-openai-codex
```

Verify provider readiness and send a tiny live smoke request:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-check
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-smoke
```

Start a long-running task:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /longrun "Describe the task here"
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /continue
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /status
```

If you want machine-readable automation surfaces instead of text output:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /status-json
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-doctor-json
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /loop-json 10
```

## ChatGPT Subscription Setup

The harness supports ChatGPT subscription auth through `provider: "openai-codex"` with `authSource: "pi-auth"`.
That path reads `~/.pi/agent/auth.json` by default and reuses the same OAuth credential store as `pi-coding-agent`.

Bootstrap the Codex profile:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /config-init-openai-codex
```

Check readiness and send live smoke requests:

```bash
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-check
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-smoke
HARNESS_CWD_OVERRIDE=/path/to/project pnpm run dev -- /provider-doctor
```

`/provider-check` reports credential readiness.  
`/provider-smoke` sends one tiny live request.  
`/provider-doctor` runs readiness + role-by-role smoke in one command.

## Commands

Primary commands:

- `/status`
- `/help`
- `/help-json`
- `/status-json`
- `/plan <goal>`
- `/plan-json <goal>`
- `/longrun <goal>`
- `/longrun-json <goal>`
- `/continue`
- `/continue-json`
- `/loop [maxSteps]`
- `/loop-json [maxSteps]`
- `/execute`
- `/execute-json`
- `/verify`
- `/verify-json`
- `/review-json`
- `/review`
- `/advance`
- `/advance-json`
- `/handoff`
- `/handoff-json`
- `/reset`
- `/reset-json`
- `/resume`
- `/resume-json`
- `/block <reason>`
- `/block-json <reason>`
- `/unblock`
- `/unblock-json`
- `/artifacts`
- `/artifacts-json`
- `/provider-check`
- `/provider-check-json`
- `/provider-doctor`
- `/provider-doctor-json`
- `/provider-smoke`
- `/provider-smoke-json`
- `/config-show`
- `/config-init`
- `/config-init --force`
- `/config-init-openai-codex`

## Typical Workflow

1. Initialize config in the target repo.
2. Run `/provider-check` or `/provider-doctor`.
3. Start work with `/plan` or `/longrun`.
4. Drive execution with `/continue`, `/status`, `/review`, `/handoff`, and `/reset` as needed.
5. Use `/provider-smoke` if you need to confirm the active model/provider path before bigger work.

## Current Limitations

- Blank-repo bootstrap is present, but full end-to-end implementation from an empty repository is not yet as reliable as work inside an existing codebase.
- `openai-codex` currently uses a subprocess bridge into local `pi-ai` code, so it depends on a local `pi-mono` checkout with installed dependencies.
- Provider smoke and doctor commands validate readiness and a tiny live prompt, but they are not substitutes for full task-level verification.

## Runtime State

The runtime persists state under `.harness/`:

- `.harness/state/run-state.json`
- `.harness/artifacts/task-state.json`
- `.harness/artifacts/spec.md`
- `.harness/artifacts/plan.md`
- `.harness/artifacts/milestones.md`
- `.harness/artifacts/reviews/`
- `.harness/artifacts/verifications/`
- `.harness/artifacts/handoffs/`
- `.harness/artifacts/notes/`

The operator panel currently exposes:

- current phase and flow
- goal, spec path, and plan path
- active and next milestone plus milestone text/status
- milestone/task progress and per-status counts
- active task text, status, kind, owner, expected output, output path
- selected model id and execution mode
- auth source and credential readiness via `/provider-check`
- verification status and verification path
- verification command(s)
- blocker
- ready tasks and pending dependencies
- allowed tools
- next recommended action

## Model Config

Role-based model selection is configured in `.harness/config.json`.

The config may use either shorthand strings:

```json
{
  "models": {
    "default": "stub",
    "planner": "stub-planner",
    "worker": "stub-worker",
    "validator": "stub-validator"
  }
}
```

or full objects:

```json
{
  "models": {
    "default": {
      "id": "custom-default",
      "provider": "openai",
      "name": "Custom Default",
      "reasoning": true
    }
  }
}
```

OpenAI-compatible endpoints can be configured with transport details in the model object:

```json
{
  "models": {
    "default": {
      "id": "gpt-4.1-mini",
      "provider": "openai-compatible",
      "name": "gpt-4.1-mini",
      "temperature": 0.2,
      "maxTokens": 2000,
      "baseUrl": "https://api.openai.com",
      "apiPath": "/v1/chat/completions",
      "apiKeyEnvVar": "OPENAI_API_KEY"
    }
  }
}
```

Supported OpenAI-compatible response styles:

- chat-completions text responses
- chat-completions `tool_calls`
- responses-style `output_text`
- responses-style `function_call`

When `apiKeyEnvVar` is omitted, the harness infers a default env var for common providers:

- `openai` / `openai-compatible` -> `OPENAI_API_KEY`
- `openrouter` -> `OPENROUTER_API_KEY`
- `groq` -> `GROQ_API_KEY`
- `xai` -> `XAI_API_KEY`
- `cerebras` -> `CEREBRAS_API_KEY`
- `mistral` -> `MISTRAL_API_KEY`

You can bootstrap the `openai-codex` profile directly with:

```bash
pnpm run dev -- /config-init-openai-codex
```

or via the generic config initializer:

```bash
pnpm run dev -- /config-init --profile openai-codex --force
```

This writes a role-aware config roughly like:

```json
{
  "models": {
    "default": { "id": "gpt-5.3-codex", "provider": "openai-codex", "authSource": "pi-auth" },
    "planner": { "id": "gpt-5.3-codex", "provider": "openai-codex", "authSource": "pi-auth" },
    "worker": { "id": "gpt-5.3-codex", "provider": "openai-codex", "authSource": "pi-auth" },
    "validator": { "id": "gpt-5.3-codex-spark", "provider": "openai-codex", "authSource": "pi-auth" }
  }
}
```

The readiness surface reports:

- role
- provider and model id
- auth source (`env` or `pi-auth`)
- credential location (`OPENAI_API_KEY` or `~/.pi/agent/auth.json`)
- whether a usable credential is present
- readiness status and suggested next step
- auth header details
- base URL and API path
- execution mode

Smoke and doctor surfaces include provider/model, stop reason, response text, and request duration in milliseconds.

Resolved config shown by `/config-show` normalizes model entries into full objects, so the output is richer than the shorthand input form.

Use `/config-init` to create a default config file and `/config-show` to inspect the resolved config.

Execution mode can also be configured:

```json
{
  "execution": {
    "workerMode": "agent"
  }
}
```

Supported values:

- `"agent"`: implementation tasks use the in-process agent/tool loop
- `"fresh"`: implementation tasks can use the fresh-context worker executor
- `"subprocess"`: implementation tasks can use the subprocess worker executor skeleton

`plannerMode` and `validatorMode` can also be set to:

- `"agent"`
- `"fresh"`
- `"subprocess"`

This lets you choose execution isolation independently per role:

- planner
- worker
- validator

## Workspace Layout

- `packages/ai` - model and streaming abstractions
- `packages/agent-core` - agent loop and tool execution primitives
- `packages/harness-runtime` - flow routing, phase machine, artifacts, handoff, verification
- `packages/cli` - command surface and REPL entrypoint
- `packages/tui` - operational runtime panel
- `packages/extensions` - workflow overlays

## Automation Notes

The CLI now exposes machine-readable surfaces intended for automation:

- `/status-json`
- `/plan-json <goal>`
- `/longrun-json <goal>`
- `/artifacts-json`
- `/verify-json`
- `/loop-json [maxSteps]`
- `/execute-json`
- `/continue-json`
- `/advance-json`
- `/block-json <reason>`
- `/unblock-json`
- `/resume-json`
- `/reset-json`
- `/review-json`
- `/handoff-json`
- `/config-show`

When embedding the CLI from another process, you can set `HARNESS_CWD_OVERRIDE` to point the runtime at a different workspace while still executing the CLI from the harness repo root.
