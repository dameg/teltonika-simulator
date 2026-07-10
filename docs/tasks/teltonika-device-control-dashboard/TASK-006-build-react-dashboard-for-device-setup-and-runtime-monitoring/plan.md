# TASK-006 Plan

Status: READY

## Current Repository Findings

- `src/dashboard/frontend/main.tsx` already mounts React `App` into `#root`.
- `src/dashboard/frontend/App.tsx` is only a placeholder and has no API calls.
- `src/dashboard/app.service.ts` serves the built bundle; `app.module.ts` already imports all four dashboard API modules and should not change for this task.
- Device APIs are available under `/api/devices`: list, create, patch, delete, and `POST /api/devices/import` with newline/comma-separated `imeis`.
- Runtime APIs are available under `/api/runtime`: per-device start/stop, `start-selected`, `start-all-enabled`, and `stop-all`.
- Status APIs are available under `/api/status`: device list, per-device status, overview, and `DELETE /api/status/state`.
- Log APIs are available under `/api/logs`: filtered list plus global and per-device delete.
- Backend validation and conflict responses use `{ error: { code, message } }`; active runs block editing/deletion and state clearing.
- Dependencies TASK-001, TASK-003, TASK-004, and TASK-005 are completed in the current manifest. No nested `AGENTS.md`, `progress.md`, or `review.md` applies to this task.
- The existing frontend toolchain is React + ReactDOM + TypeScript + esbuild; no component-test library is installed. Keep frontend tests build/API-oriented unless a test can be added without introducing a dependency.

## Files To Create Or Modify

- Modify `src/dashboard/frontend/App.tsx` to replace the placeholder with the complete desktop-first dashboard.
- Modify `src/dashboard/frontend/main.tsx` only if bootstrap behavior requires it; otherwise leave it unchanged.
- Create only the smallest frontend helpers/components needed under `src/dashboard/frontend/` (for example, an API client and focused view components). Keep state local to the app; do not add a state-management dependency.
- Modify `tests/dashboard-app-shell.test.ts` to assert real dashboard markers and retained bundle behavior.
- Add focused frontend/API contract coverage under `tests/` only where existing tests cannot cover the behavior.
- Do not modify `src/dashboard/app.module.ts` unless an actual frontend-serving or compilation requirement appears.

## Ordered Implementation Steps

1. Define minimal TypeScript types matching the existing device, status, overview, log, and `{ error }` response shapes. Add a small `fetch` wrapper that parses JSON when present and turns non-2xx responses into readable errors.
2. Build the dashboard shell with accessible headings, labels, buttons, tables/lists, empty states, and visible error/status regions. Use native HTML controls and inline or local styling; do not add a UI library.
3. Implement device setup: list configured devices, create/edit fields for label, enabled, IMEI, and all `config` fields, and bulk import text. Send the exact backend payloads and refresh after successful mutations. Disable edits/deletes while the returned status is active.
4. Implement runtime controls: per-device start/stop, selection checkboxes with start-selected, start-all-enabled, and stop-all actions. Track in-flight action keys so duplicate clicks are prevented and show returned errors/conflicts.
5. Implement monitoring: overview count cards, device status table/detail selection, selected-device metadata, and recent logs. Support log filtering by device, severity, and event type where the API supports it, plus global/per-device log clear and dashboard-state clear actions.
6. Add one polling loop using `useEffect` cleanup and a fixed interval (1 second is consistent with the existing dashboard). Refresh status, overview, and visible logs without replacing unsaved form state; refresh immediately after mutations. Avoid overlapping refreshes with an in-flight guard.
7. Update shell/build assertions and add the smallest deterministic tests for API request wiring or rendered bundle markers. Do not test private component structure or add a test framework solely for this task.

## Validation And Error-Handling Strategy

- Treat backend validation as authoritative; retain client-side required-field checks only for immediate usability.
- Keep field/form values intact when a request fails and display the backend message/code.
- Render explicit loading, empty, polling-error, mutation-error, and active-run conflict states.
- Do not optimistically mark a run started/stopped; update from the status APIs after the command response.
- Abort or ignore stale polling updates after unmount, and clean up the interval.
- Encode IMEIs in URL path segments with `encodeURIComponent`; use query parameters for log filters.
- Keep all simulation/protocol behavior in the backend; the frontend only calls APIs and renders state.

## Tests To Add Or Update

- Update `tests/dashboard-app-shell.test.ts` so the built bundle is asserted to contain real device setup, runtime control, status, log, and clear-action markers rather than placeholder copy.
- Add a focused test if needed to verify the frontend request contract for create/import/start/stop/clear and the polling endpoint set. Prefer testing exported API helpers or static bundle-visible behavior over introducing React testing infrastructure.
- Preserve existing device-management, runtime, status, and logging API tests as regression coverage.

## Verification Commands

Run exactly the task-defined checks:

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The task spans several API payloads; mismatched nested `config` fields are the main integration risk. Reuse the backend names exactly.
- Polling can overwrite user edits or create stale state; isolate form state and guard refresh lifecycle.
- A single large component can become hard to reason about; split only along the visible views/API boundaries, without speculative abstractions.
- Runtime errors are asynchronous after a successful start request; status polling and logs must remain the source of truth.
- `DELETE /api/status/state` removes devices, runtime records, and logs and returns `409` while active runs exist; confirm before issuing it and surface conflicts.

## Unresolved Blockers

- None. The backend endpoints required by this task exist and the dependency tasks are complete. Scope remains limited to the React dashboard and its focused verification.
