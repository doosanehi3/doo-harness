# @doo/harness-extensions

Harness runtime extension surfaces for `pi-coding-agent`.

## What It Provides

- a hosted bridge that can boot `HarnessRuntime`
- a real `ExtensionAPI`-backed `/harness` command entrypoint
- access to the Harness operator loop from inside `pi`

## Current Package Contract

The current package contract is **source-based**.

`pi` loads:

- `src/pi-extension.ts`

through the `pi.extensions` manifest in
[package.json](/Users/baekdoosan/Documents/DOO/harness/packages/extensions/package.json).

This is intentional for now. It keeps the package simple while the product is
still converging. A later published contract may switch to `dist` artifacts.

## Distribution Policy

Current policy:

- do **not** publish this package to npm yet
- treat local-path install and future git-based install as the supported
  distribution paths
- revisit npm publishing only after scriptable smoke and interactive release
  validation are stable

## Local Smoke

One-off load:

```bash
pi -e /absolute/path/to/harness/packages/extensions/src/pi-extension.ts
```

Project-local install:

```bash
pi install -l /absolute/path/to/harness/packages/extensions
```

Then verify:

```bash
/harness help --json
/harness status --json
```

## Notes

- `@mariozechner/pi-coding-agent` is declared as a peer dependency and a local
  dev dependency
- runtime ownership remains in Harness; this package only hosts the command
  surface inside `pi`
