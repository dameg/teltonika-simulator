Status: READY

## Current Repository Findings

- `src/dashboard/domain.ts` already provides the shared IMEI domain rules required by this task: `normalizeImei`, `assertUniqueImei`, `findDuplicateImeis`, and `DashboardDomainError` codes for empty, invalid, duplicate, and missing-device cases.
- `src/dashboard/repositories/device-repository.ts` already supports in-memory device CRUD with normalized IMEIs and merged config updates, so this task should add API orchestration on top rather than duplicating repository logic.
- `src/dashboard/repositories/runtime-repository.ts` already stores per-device runtime status, which is the correct place to consult before allowing device updates or deletes.
- `src/dashboard/app.module.ts` currently wires only the shell and health endpoints. There is no NestJS device-management module, controller, or service yet.
- Existing dashboard HTTP tests in `tests/dashboard-app-shell.test.ts` use `startDashboardServer` and `fetch`, which is the most relevant pattern for API-level coverage in this task.

## Files To Create Or Modify

- Create `src/dashboard/device-management/device-management.module.ts`
- Create `src/dashboard/device-management/device-management.service.ts`
- Create `src/dashboard/device-management/device-management.controller.ts`
- Create any small DTO/provider helper file under `src/dashboard/device-management/` only if it keeps the controller/service boundary clear
- Modify `src/dashboard/app.module.ts` to register the new device-management module/providers
- Add a focused dashboard API test file under `tests/` for device CRUD and bulk import behavior

## Ordered Implementation Steps

1. Add a `device-management` NestJS module that owns the HTTP API surface for dashboard device management and wires the existing in-memory repositories as providers.
2. Implement a service layer that wraps the repositories and centralizes task-specific business rules:
   - create a device with per-device config;
   - list devices;
   - update a device;
   - delete a device;
   - bulk import devices from pasted IMEI text.
3. Implement bulk import parsing in the service using newline/comma splitting, trimming, and shared domain validation so the request can reject malformed, empty, or duplicate IMEIs with a clear error before mutating repository state.
4. Enforce the “do not edit/delete while running” rule in the service by consulting the runtime repository before update/delete and rejecting mutations for active runtime states.
5. Add a controller with explicit request/response shapes for CRUD and bulk import endpoints, and map domain/service failures to clear HTTP responses instead of leaking raw exceptions.
6. Register the module in `src/dashboard/app.module.ts` without changing unrelated dashboard shell behavior.
7. Add HTTP-level tests that exercise the new endpoints through the running Nest app, reusing the existing dashboard server bootstrap pattern.

## Validation And Error-Handling Strategy

- Reuse the shared IMEI helpers from `src/dashboard/domain.ts`; do not duplicate IMEI regex or normalization logic in controller code.
- Treat bulk import as all-or-nothing: if any submitted IMEI is empty, malformed, duplicated within the pasted payload, or already present in repository state, reject the request with a clear validation/conflict response and do not partially create devices.
- Keep the running-device restriction in the service layer so both controller behavior and future callers share the same rule.
- Map failures to stable API errors:
  - invalid or empty IMEI input -> `400`;
  - duplicate IMEI input or existing-device conflict -> `409`;
  - missing device on update/delete -> `404`;
  - edit/delete blocked by active runtime status -> `409`.
- Use explicit JSON error payloads that identify the failing IMEI or reason so the dashboard UI can surface actionable messages later.

## Tests To Add Or Update

- Add API tests covering device creation and listing with persisted per-device config.
- Add API tests covering device update and delete for a configured, non-running device.
- Add API tests covering bulk IMEI import from newline-separated and comma-separated pasted input.
- Add API tests covering invalid IMEI rejection and duplicate rejection both within the same bulk payload and against already stored devices.
- Add API tests covering update/delete rejection when the runtime repository reports an active status for the device.

## Verification Commands

- `npm run build`
- `npm run typecheck`
- `npm test`

## Risks And Assumptions

- The PRD says edits/deletes are allowed only when a device is not running, but the domain model has multiple non-terminal statuses. Unless implementation evidence suggests otherwise, treat `starting`, `running`, and `reconnecting` as active states that block updates/deletes, while terminal states such as `stopped`, `failed`, `rejected`, and `completed` remain editable.
- Bulk import response shape is not prescribed in `task.md`. The safest interpretation for this task is a single request-level success or failure, not partial success with per-row results.

## Unresolved Blockers

- None currently blocking planning. The task can proceed with the assumptions above and should surface them in implementation comments/tests only where needed.
