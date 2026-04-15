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
- [ ] decide npm publishing scope/versioning strategy
- [ ] decide whether source-based or dist-based extension loading is the final
  published contract

### 2. User-facing install UX

- [x] document local `pi -e` smoke path
- [x] document local `pi install -l` package path
- [ ] document expected behavior in a fresh machine setup
- [ ] document failure modes when `pi` is absent from PATH

### 3. Release workflow

- [ ] add extension-package build/publish script policy
- [ ] decide whether releases are repo-wide or package-scoped
- [ ] define version bump policy for runtime vs extension changes
- [ ] add release notes template

### 4. Smoke and verification

- [x] `pnpm run check`
- [x] `pnpm run test`
- [x] real pi CLI smoke in print mode
- [ ] interactive pi session smoke with widget rendering
- [ ] install-from-path smoke via `pi install -l`

## Recommended Next Release Gate

Before calling the package shippable:

1. run `pnpm run check`
2. run `pnpm run test`
3. run real pi print-mode smoke:
   - `/harness help --json`
   - `/harness status --json`
4. run installed-package smoke:
   - `pi install -l /absolute/path/to/harness/packages/extensions`
   - verify `/harness status --json`
5. record release note summary

## Notes

- The main product architecture is no longer the blocker.
- Remaining work is packaging, documentation, and release discipline.
