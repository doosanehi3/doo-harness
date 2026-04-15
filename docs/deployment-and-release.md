# Deployment And Release

This document tracks the remaining product-completeness work for shipping the
Harness runtime and pi extension surfaces cleanly.

## Current State

Done:

- CLI-first Harness runtime product
- pi-ready substrate adapter seam
- real hosted bridge in `packages/extensions/src/pi-hosted.ts`
- real package-backed pi extension entrypoint in
  `packages/extensions/src/pi-extension.ts`
- local pi CLI smoke for `/harness help --json` and `/harness status --json`

Still product work, not architecture work:

- publish/install docs
- package release flow
- real user installation polish
- release checklist discipline

## Completion Tasks

### 1. Package metadata and installability

- [x] add `pi` manifest to `packages/extensions/package.json`
- [x] add `pi-package` keyword
- [x] declare `@mariozechner/pi-coding-agent` as a peer/dev dependency
- [x] choose source-based extension loading as the current install contract
- [x] decide not to publish to npm yet; use local-path or git-based install until
  the package contract stabilizes
- [ ] decide whether a later published contract should switch to dist-based artifacts

### 2. User-facing install UX

- [x] document local `pi -e` smoke path
- [x] document local `pi install -l` package path
- [x] validate print-mode smoke manually
- [x] validate install-from-path flow manually
- [ ] stabilize scriptable print/install smoke for release automation
- [x] document expected behavior in a fresh machine setup
- [x] document failure modes when `pi` is absent from PATH

### 3. Release workflow

- [x] record that the current package contract is source-based and does not require a separate extension build step
- [x] decide that releases remain repo-wide until the extension package is extracted or independently published
- [x] define version bump policy for runtime vs extension changes
- [x] add release notes template

### 4. Smoke and verification

- [x] `pnpm run check`
- [x] `pnpm run test`
- [x] real pi CLI smoke in print mode
- [x] install-from-path smoke script
- [ ] interactive pi session smoke with widget rendering
- [ ] run install-from-path smoke as a release gate in CI or release process

## Recommended Next Release Gate

Before calling the package shippable:

1. run `pnpm run check`
2. run `pnpm run test`
3. run real pi print-mode smoke manually
4. run install-from-path smoke manually
5. run interactive pi session smoke
6. verify widget rendering and `/harness` command visibility
7. record release note summary

## Notes

- The main product architecture is no longer the blocker.
- Remaining work is packaging, documentation, and release discipline.

## Fresh Machine Expectations

A fresh machine is considered ready when:

1. Node.js 20+ is installed
2. `pnpm` is installed
3. `pi` is installed and reachable on `PATH`, or the local `pi` CLI entrypoint is
   available through the installed package path
4. repository dependencies install successfully with `pnpm install`
5. `pnpm run check` and `pnpm run test` pass
6. the pi extension smoke succeeds:
   - `pi -e /absolute/path/to/harness/packages/extensions/src/pi-extension.ts`
   - or `pi install -l /absolute/path/to/harness/packages/extensions`

## PATH Failure Modes

If `pi` is not available on `PATH`:

- use the locally resolved CLI path from the installed package for smoke and
  debugging
- or install `pi` globally before attempting package-install smoke

Symptoms:

- `pi: command not found`
- extension install smoke cannot start
- release validation cannot confirm the real hosted path

## Release Scope And Versioning Policy

Current policy:

- releases are **repo-wide**
- `@doo/harness-extensions` is versioned inside the main repository lifecycle
- runtime and extension changes are documented together until package extraction
  becomes necessary
- `@doo/harness-extensions` is **not published to npm yet**
- supported install paths today are:
  - local path install
  - git/package source install once the repository distribution path is chosen

Versioning guidance:

- runtime behavior changes: bump the repo version
- pi extension surface changes: bump the repo version
- docs-only changes: version bump only when they materially affect install,
  release, or operator behavior

This keeps release coordination simple while the product is still converging.
