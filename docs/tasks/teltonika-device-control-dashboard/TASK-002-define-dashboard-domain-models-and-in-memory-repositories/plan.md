# TASK-002 Plan

Status: `READY`

## Current Repository Findings

- Only the repository-root `AGENTS.md` applies. There are no nested `AGENTS.md` files under `src/`, `tests/`, or this task workspace.
- `TASK-001` already established the NestJS dashboard shell under `src/dashboard/` with a shallow `AppModule`, `AppController`, and `AppService`, plus a React placeholder UI. There is no dashboard domain or repository layer yet.
- `src/dashboard/app.module.ts` currently wires only `AppService`; adding in-memory repositories in this task can stay local to `src/dashboard/` and later be exposed as Nest providers without changing simulator/protocol modules.
- `src/domain.ts` already defines simulator-side route, driving-style, vehicle-state, and device-profile types. `src/config.ts` defines the current single-run simulator option shape (`host`, `port`, `intervalMs`, `reconnectDelayMs`, `routeFile`, `drivingStyle`, `seed`, `deviceProfile`, `packetCount`), which the dashboard device model should mirror instead of inventing a second config vocabulary.
- `src/index.ts` is the public barrel for simulator and dashboard exports. If later tasks need to consume dashboard domain or repository types from tests or services, exports should be added there deliberately rather than duplicating types elsewhere.
- Existing dashboard shell tests are bootstrap-only. No current tests cover device records, run-state records, structured logs, IMEI validation, or in-memory persistence behavior.

## Files To Create Or Modify

- `src/dashboard/domain.ts`
- `src/dashboard/repositories/device-repository.ts`
- `src/dashboard/repositories/runtime-repository.ts`
- `src/dashboard/repositories/log-repository.ts`
- `src/dashboard/repositories/index.ts`
- `src/index.ts`
- `tests/dashboard-domain.test.ts`
- `tests/dashboard-repositories.test.ts`

## Ordered Implementation Steps

1. Define the dashboard domain model in `src/dashboard/domain.ts`.
   - Add typed records for configured devices, per-device simulator settings, runtime status/run metadata, aggregate counts if needed by later tasks, and structured log events.
   - Reuse existing simulator terms from `src/config.ts` and `src/domain.ts` for host/port/route/driving-style/profile/seed fields so later runtime code can map directly into `runMultiDeviceRuntime` inputs.
   - Keep the model dashboard-scoped: device configuration, runtime state, and logs only. Do not pull protocol framing, AVL payloads, or Nest controller DTO concerns into this file.

2. Add shared IMEI validation and duplicate-detection helpers in the same domain file.
   - Implement the smallest shared rules later API tasks need: reject empty IMEIs, reject malformed IMEIs, normalize IMEIs for repository keys, and detect duplicates before writes.
   - Keep validation independent from HTTP or Nest exceptions so services, tests, and future bulk-import parsing can reuse it directly.

3. Add plain in-memory repositories under `src/dashboard/repositories/`.
   - `device-repository.ts`: CRUD-style operations for configured devices, keyed by normalized IMEI, with duplicate rejection and list/get/delete/update methods needed by later API tasks.
   - `runtime-repository.ts`: store and update per-device run records and expose aggregate status views for later dashboard polling.
   - `log-repository.ts`: append, list, filter, and clear structured log events by device and globally.
   - Keep each repository process-local and self-contained. No simulator start/stop logic, no network calls, no filesystem persistence.

4. Add a repository barrel and expose anything needed through `src/index.ts`.
   - Export dashboard domain types and repository classes/functions once so later dashboard tasks can import them from stable paths.
   - Avoid over-exporting Nest shell internals or introducing a second barrel if `src/index.ts` is enough.

5. Add focused unit tests only.
   - Cover IMEI validation, normalization, and duplicate handling.
   - Cover repository read/write/update/delete behavior, clear behavior, per-device filtering, aggregate runtime counts, and process-local independence from simulator protocol code.
   - Keep tests at the observable behavior level; no HTTP bootstrapping is needed for this task.

## Validation And Error-Handling Strategy

- Treat malformed or duplicate IMEIs as explicit domain errors with stable, testable messages or error codes so later API handlers can map them cleanly.
- Normalize repository keys before lookup/write to avoid duplicate records that differ only by formatting assumptions.
- Keep in-memory storage restart-volatile by design. Do not add fallback persistence, caches, or auto-recovery behavior.
- Keep runtime records and log records decoupled from simulator protocol payloads. Store only dashboard-facing status, metadata, and structured event context needed by later tasks.
- Prefer simple `Map`-backed repositories and arrays for append-only logs; there is no requirement for concurrency control or database abstraction in this task.

## Tests To Add Or Update

- `tests/dashboard-domain.test.ts`
  - Valid IMEI acceptance.
  - Empty/malformed IMEI rejection.
  - Normalization behavior.
  - Duplicate detection across repeated imports.

- `tests/dashboard-repositories.test.ts`
  - Device repository create/list/get/update/delete and clear behavior.
  - Duplicate device rejection through shared validation.
  - Runtime repository set/update/read/aggregate behavior for statuses like `configured`, `starting`, `running`, `stopped`, `rejected`, `failed`, and `completed`.
  - Log repository append/list/filter/clear behavior, including device-scoped and global reads.
  - Process-local behavior by proving fresh repository instances do not share state.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- If dashboard device settings drift from `SimulatorConfig`, later runtime wiring will need translation glue or field renames. Reusing the existing simulator vocabulary is the smaller, safer choice.
- If IMEI validation lives only inside one repository method, later bulk-import and API tasks will duplicate logic. Shared domain helpers are the root-cause-safe place for it.
- If run-state and log models include transport/protocol details now, this task will blur the repository boundary the PRD and `AGENTS.md` require.
- If repositories hide duplicate or missing-record failures, later API tasks will have to infer what went wrong from side effects instead of explicit errors.

## Unresolved Blockers

- No blocking repository issue is visible for TASK-002.
- Open question, not blocking: the PRD defines visible statuses such as `configured`, `starting`, `running`, `reconnecting`, `stopped`, `rejected`, `failed`, and `completed`; this task should include the statuses later tasks clearly need now, and can add more only where the PRD already commits to them.
- Open question, not blocking: the PRD says keep recent logs in memory for the current process lifetime but does not require a retention cap. This task can leave logs uncapped and rely on manual clear behavior unless a later task sets a bound explicitly.
