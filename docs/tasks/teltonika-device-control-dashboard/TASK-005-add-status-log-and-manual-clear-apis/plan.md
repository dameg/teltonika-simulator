Status: READY

## Current Repository Findings

- Root `AGENTS.md` applies to this task workspace and the affected `src/` and `tests/` files. No nested `AGENTS.md` files were found under the task directory, `src/`, `tests/`, `docs/`, or `.ralph/`.
- `src/dashboard/domain.ts` already defines the dashboard runtime status model, structured log severity/event types, log event shape, and repository-facing domain records needed by this task.
- `src/dashboard/repositories/device-repository.ts` already supports listing, lookup, mutation, and `clear()` for in-memory device definitions.
- `src/dashboard/repositories/runtime-repository.ts` already supports lookup/listing, status-based listing, aggregate `getOverview()`, deletion, and `clear()` for in-memory runtime state.
- `src/dashboard/repositories/log-repository.ts` already supports filtered log queries via `list({ imei, severity, type, limit })`, plus `clear()` and `clearByDevice(imei)`.
- `src/dashboard/device-management/device-management.service.ts` already records structured device lifecycle events and already clears device-specific logs when deleting a device.
- `src/dashboard/runtime/runtime.service.ts` already captures structured runtime events for start, stop, TCP connect, IMEI send, IMEI accept/reject, AVL send, AVL ack, reconnect, completion, and failure. The missing work is exposing these snapshots through polling-friendly APIs and adding manual clear surfaces.
- `src/dashboard/runtime/runtime.controller.ts` currently exposes only control endpoints. There are no read endpoints for device status, aggregate run counts, or logs, and no manual clear endpoints.
- `src/dashboard/app.module.ts` currently wires only device-management and runtime modules, so new read/clear API modules must be added there.
- Existing test coverage already proves repository behavior and runtime event capture at the service/controller level, but there are no API tests for status views or clear operations.
- Important data-model gap: devices can exist without a runtime record. The status API cannot rely on `runtimeRepository.getOverview()` alone for “configured” counts or device list status because unstarted devices must still appear as `configured`.

## Files To Create Or Modify

- Create `src/dashboard/status/status.service.ts`
- Create `src/dashboard/status/status.controller.ts`
- Create `src/dashboard/status/status.module.ts`
- Create `src/dashboard/logging/logging.service.ts`
- Create `src/dashboard/logging/logging.controller.ts`
- Create `src/dashboard/logging/logging.module.ts`
- Modify `src/dashboard/app.module.ts`
- Modify `src/index.ts` if the new modules/services need to be exported alongside the existing dashboard entrypoints
- Create or update dashboard API integration tests under `tests/` for status queries and manual clear behavior

## Ordered Implementation Steps

1. Add a status read layer under `src/dashboard/status/` that composes the device and runtime repositories into polling-friendly snapshots.
   - Build a list response that includes every configured device, even when no runtime record exists.
   - Derive device status as `configured` when a device exists without runtime state.
   - Expose aggregate counts using device inventory plus runtime state instead of relying only on `runtimeRepository.getOverview()`.
   - Expose a per-device detail view that merges device metadata with the latest runtime snapshot and summary fields required by the PRD.

2. Add a logging and manual-clear layer under `src/dashboard/logging/`.
   - Expose recent global events from `logRepository.list({ limit })`.
   - Expose per-device event history with supported filters for device, severity, event type, and limit.
   - Add manual clear endpoints for logs and dashboard-owned in-memory state using existing repository `clear()` primitives.

3. Define clear semantics explicitly before wiring endpoints.
   - Clearing logs can be allowed globally and per-device because the repository already supports both forms.
   - Clearing dashboard-owned device/runtime state must guard against active runs so the API does not orphan live sessions from their backing state.
   - If any device is `starting`, `running`, or `reconnecting`, reject broad state-clear operations with a deterministic client error instead of partially clearing state.

4. Wire the new modules into `src/dashboard/app.module.ts` and export any required symbols from `src/index.ts`.

5. Add integration coverage for the new HTTP surfaces.
   - Cover status list, aggregate overview, and per-device detail responses for both unstarted and active/completed devices.
   - Cover structured log retrieval, filter behavior, and recent global event retrieval.
   - Cover manual clear operations for logs and state, including rejection when active runs are present.

## Validation And Error-Handling Strategy

- Treat missing devices as `404` on per-device status/log endpoints, matching the existing controller behavior for unknown IMEIs.
- Keep query responses deterministic and polling-friendly:
  - return stable snapshots from repository state only;
  - include unstarted devices in list responses;
  - apply explicit `limit` handling for log queries.
- Validate clear requests against runtime activity before deleting device/runtime state.
  - Reject state-clear operations while any run is active (`starting`, `running`, `reconnecting`).
  - Avoid partial deletion across repositories.
- Reuse existing domain error and HTTP mapping patterns where possible instead of introducing a separate error model.
- Keep simulation/runtime execution separate from query composition: status and logging services should read repositories rather than reaching into transport/session internals.

## Tests To Add Or Update

- Add dashboard API integration tests that exercise:
  - device status list with configured devices that have never started;
  - aggregate counts that distinguish configured devices from tracked runtime states;
  - per-device detail status after start, stop, rejection, and failure flows;
  - recent global log retrieval;
  - per-device log retrieval with `severity`, `type`, and `limit` filters;
  - global log clear and per-device log clear behavior;
  - dashboard state clear behavior for idle state;
  - rejection of dashboard state clear while an active run exists.
- Reuse existing dashboard server/test fixture patterns instead of introducing new harnesses.

## Verification Commands

- `npm run build`
- `npm run typecheck`
- `npm test`

## Risks

- The biggest correctness risk is undercounting or hiding configured devices if the implementation relies only on runtime records. The status service must synthesize `configured` from the device repository for devices with no run history.
- Broad clear endpoints can create inconsistent state if they remove repository data while a runtime session is still active. The implementation must reject unsafe clears instead of attempting best-effort cleanup.
- Log filtering must remain simple and predictable; adding unsupported ad hoc filters would expand scope beyond the task and PRD.

## Unresolved Blockers

- None at planning time. The task is implementable with the current repository and runtime abstractions.
