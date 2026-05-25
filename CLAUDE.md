# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Stack

- **Runtime**: Node `~24` + pnpm `@10.33.2` (Corepack-managed)
- **Frontend**: Next.js 16 App Router + React 18 (apps/web)
- **Backend**: Express + SQLite + SSE (apps/daemon)
- **Desktop**: Electron shell (apps/desktop)
- **Workspace**: pnpm monorepo — `apps/*`, `packages/*`, `tools/*`, `e2e`

## Primary development entry point

All local dev lifecycle goes through `pnpm tools-dev` — never `pnpm dev`, `pnpm start`, or direct app-level starts.

```bash
pnpm tools-dev run web                    # daemon + web in foreground
pnpm tools-dev start web                  # daemon + web in background
pnpm tools-dev                             # daemon + web + desktop in background
pnpm tools-dev status --json
pnpm tools-dev logs --json
pnpm tools-dev stop
pnpm tools-dev inspect desktop status
```

## Common commands

```bash
# Repo-level checks
pnpm guard          # style policy + JS allowlist enforcement
pnpm typecheck      # workspace-wide tsc --noEmit

# Per-package
pnpm --filter @open-design/web typecheck
pnpm --filter @open-design/web test
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon build

# Packaging
pnpm tools-pack mac build --to all
pnpm tools-pack win build --to nsis

# PR tooling (maintainers)
pnpm tools-pr list
pnpm tools-pr view <num>

# E2E
cd e2e && pnpm test specs
cd e2e && pnpm test tests/tools-dev/inspect.test.ts
```

## Architecture at a glance

```
browser (Next.js 16) ←→ daemon (Express + SQLite) ←→ coding-agent CLI on PATH
                               ↕ SSE                  (claude/codex/gemini/…)
                          .od/app.sqlite          agent's cwd = .od/projects/<id>/
```

**apps/daemon** — the only privileged process. Owns `/api/*` routes, agent spawning, skills, design systems, SQLite persistence at `.od/app.sqlite`, and static serving of `/artifacts` and `/frames`.

**apps/web** — Next.js 16 frontend. During `tools-dev` web runs, `/api/*`, `/artifacts/*`, and `/frames/*` are rewritten to the daemon port. Web must not import `apps/daemon/src/*` directly; integration uses `packages/contracts` DTOs and HTTP.

**apps/desktop** — Electron shell. Discovers the web URL via sidecar IPC, not port guessing.

**packages/contracts** — pure TypeScript DTOs shared between web and daemon. No Node APIs, no Next.js, no daemon internals.

**packages/sidecar-proto** — sidecar protocol: stamp fields (`app·mode·namespace·ipc·source`), IPC message schema, constants.

**packages/sidecar** — generic sidecar runtime: bootstrap, IPC transport, path resolution. No Open Design app keys.

**packages/platform** — generic OS process primitives consumed by sidecar-proto. Shared toolchain bin discovery used by daemon agent resolver and packaged sidecar PATH builder.

## Data layout

Daemon writes everything under `.od/` (gitignored, auto-created):

```
.od/
├── app.sqlite       # projects · conversations · messages · tabs · templates
├── artifacts/       # one-off "Save to disk" renders
└── projects/<id>/   # per-project working dir (agent's cwd)
```

`OD_DATA_DIR=<dir>` relocates all of the above. `OD_MEDIA_CONFIG_DIR=<dir>` narrows to just `media-config.json`.

## Key constraints

- App packages must not import another app's private `src/`.
- `packages/contracts` must stay pure TypeScript, free of Node, Express, Next.js, SQLite, or sidecar dependencies.
- Tests live in each package's `tests/` directory, sibling to `src/`; `src/` is source-only.
- `apps/nextjs` and `packages/shared` are removed; do not recreate.
- All local lifecycle must use `pnpm tools-dev`; do not add root `pnpm dev`/`pnpm start` aliases.

## 优化增强
- 所有优化、增强、问题都需要维护到doc目录下的优化增强清单.md

## 提问
- 源文件生成好后，要提醒完成
- 
