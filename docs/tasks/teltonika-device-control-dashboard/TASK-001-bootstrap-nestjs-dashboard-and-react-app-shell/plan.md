# TASK-001 Plan

Status: `READY`

## Current Repository Findings

- The repository currently uses a single-package `npm` layout with one `package.json`, one `tsconfig.json`, a root `vitest.config.ts`, and an existing `package-lock.json`.
- Only the repository-root `AGENTS.md` applies. There are no nested `AGENTS.md` files under `docs/`, `src/`, `tests/`, or `scripts/`.
- `src/index.ts` is currently both the public barrel and the effective CLI entry target through `npm run cli`, so the dashboard bootstrap must preserve simulator CLI access instead of replacing it.
- The existing dashboard code is `src/dashboard-backend.ts`, a custom Node HTTP/TCP backend used for the raw/decoded dashboard work. It is not a NestJS app and should remain intact unless a thin compatibility export is needed.
- There is no frontend bundler or browser asset pipeline yet. The repo has no Vite config or frontend asset directory, and current tests are TypeScript/Vitest-only.
- Current verification commands already use `npm run build`, `npm run typecheck`, and `npm test`, so TASK-001 should extend those commands rather than introducing a separate workspace toolchain.
- TASK-006 expects React UI work to live under `src/dashboard/frontend/`, so TASK-001 should establish that path now to avoid churn later.

## Files To Create Or Modify

- `package.json`
- `package-lock.json`
- `tsconfig.json`
- `vitest.config.ts`
- `src/index.ts`
- `src/cli.ts`
- `src/dashboard/main.ts`
- `src/dashboard/app.module.ts`
- `src/dashboard/app.controller.ts`
- `src/dashboard/app.service.ts`
- `src/dashboard/frontend/`
- `tests/dashboard-app-shell.test.ts`
- `tests/smoke.test.ts` or another existing bootstrap-level test if reuse is cleaner

## Ordered Implementation Steps

1. Split the current entry responsibilities so the simulator CLI remains explicit.
   - Move the current runtime-starting CLI behavior out of `src/index.ts` into `src/cli.ts`.
   - Keep `src/index.ts` as a stable public export surface for simulator helpers and any dashboard bootstrap exports needed by tests.

2. Add the minimum NestJS dashboard shell under `src/dashboard/`.
   - Create a Nest bootstrap file, root module, and a placeholder controller/service.
   - Expose at least a root route and a simple health-style route so the app has deterministic startup coverage without pulling device/runtime behavior into this task.

3. Establish the React app shell at `src/dashboard/frontend/`.
   - Add a minimal React entrypoint and placeholder app component aligned with the future UI task.
   - Keep it to shell-only content: mount point, title, and placeholder sections for the later device/status/log views.

4. Wire the frontend build output into the Nest app.
   - Add the smallest frontend build path that produces static browser assets which Nest can serve.
   - Prefer a single-package setup over a new workspace. The frontend should build into a path the Nest shell can serve without affecting simulator modules.

5. Update repository scripts and TypeScript config.
   - Extend `build` so backend and frontend artifacts are produced.
   - Extend `typecheck` so simulator, Nest, and React code are all covered.
   - Preserve `npm test` as the single test entrypoint.
   - Keep `npm run cli` working against the simulator entrypoint.

6. Add bootstrap-focused tests only.
   - Verify the dashboard shell boots and serves the placeholder page.
   - Verify the React shell is reachable through the dashboard app surface.
   - Verify the CLI path remains available after the entrypoint split.

## Validation And Error-Handling Strategy

- Keep placeholder-only HTTP behavior in the Nest layer. Do not add device CRUD, runtime orchestration, or log persistence logic in this task.
- Fail fast during startup if required frontend assets are missing in the production build path, with an explicit error or controlled placeholder response rather than silent 404s.
- Keep simulator CLI parsing and simulator runtime behavior untouched apart from entrypoint relocation.
- Avoid coupling Nest controllers to existing simulation or protocol code in this task; the shell should stop at routing and static asset serving.

## Tests To Add Or Update

- Add a dashboard shell test that boots the Nest app and verifies:
  - the root HTML response succeeds;
  - the placeholder shell markers are present;
  - the route does not require device-management APIs yet.
- Add or update a smoke test that verifies the simulator CLI entry is still callable after moving startup logic into `src/cli.ts`.
- If the chosen frontend build path needs config coverage, add a narrow test around the controller or asset-serving behavior rather than browser-heavy UI tests.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- Replacing `src/index.ts` directly with Nest bootstrap logic would break the existing CLI and public exports. The entrypoint split is the root-cause-safe way to preserve behavior.
- Adding a separate frontend workspace would widen scope and increase maintenance for little value at bootstrap stage.
- React browser assets introduce a new build step; if output paths are ambiguous, later tasks will spend time undoing shell wiring instead of building features.
- Overusing Nest-specific structure in this task could pull future domain modules into bootstrap work. Keep the module tree shallow and placeholder-only.

## Unresolved Blockers

- No blocking repository issue is visible for TASK-001.
- Implementation should keep the assumption that React source lives in `src/dashboard/frontend/` and is served by the Nest dashboard shell, because TASK-006 already depends on that layout.
