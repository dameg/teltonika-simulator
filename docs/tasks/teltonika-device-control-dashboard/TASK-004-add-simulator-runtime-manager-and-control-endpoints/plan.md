# TASK-004 Plan

Status: READY

## Scope Understanding

Add a dashboard runtime manager and control endpoints that start and stop
simulator sessions per IMEI while reusing the existing in-process simulator
core. The implementation must prevent duplicate active runs for the same IMEI,
support single-device and multi-device start flows, expose stop operations, and
persist observable runtime status and log state through the existing dashboard
repositories.

## Relevant Findings

- `src/live-session.ts` already provides the correct single-device execution
  primitive. It supports `AbortSignal`, performs the Teltonika handshake and AVL
  exchange, and returns terminal outcomes (`completed` or `rejected`) without
  requiring NestJS-specific protocol code.
- `src/multi-device-runtime.ts` is useful evidence for concurrent execution but
  is not sufficient as the dashboard runtime manager because it runs a fixed
  batch under one call and does not track or stop individual IMEIs.
- `src/dashboard/domain.ts` already defines the run statuses and log event types
  required by the PRD, including `starting`, `running`, `reconnecting`,
  `stopped`, `rejected`, `failed`, and `completed`.
- `src/dashboard/repositories/runtime-repository.ts` and
  `src/dashboard/repositories/log-repository.ts` already provide the in-memory
  persistence surface needed for runtime state and log history.
- `src/dashboard/device-management/device-management.service.ts` already uses
  runtime status to prevent edits while a device is active, so the new runtime
  manager must keep repository status transitions accurate.
- `src/dashboard/device-management/device-management.module.ts` currently
  constructs the repository providers internally. Runtime control cannot create
  a second copy of those providers or device management and runtime endpoints
  will see different in-memory state.
- `src/dashboard/app.module.ts` currently only wires device management. A new
  runtime module must be added explicitly.

## Files To Create Or Modify

- Create `src/dashboard/runtime/runtime.module.ts`
- Create `src/dashboard/runtime/runtime.service.ts`
- Create `src/dashboard/runtime/runtime.controller.ts`
- Create or extract a shared dashboard repository provider module/file under
  `src/dashboard/` so device management and runtime control resolve the same
  in-memory repository instances
- Create focused runtime tests under `tests/` for service and HTTP behavior
- Update `src/dashboard/app.module.ts`
- Update `src/dashboard/device-management/device-management.module.ts`
- Update `tests/dashboard-device-management.test.ts` only as needed for shared
  repository wiring expectations
- Add `tests/dashboard-runtime.test.ts` or an equivalently named focused
  runtime-control test file
- Update `tests/end-to-end-parser-visible.test.ts` so parser-visible coverage
  exercises dashboard-triggered runtime control rather than only direct
  `runLiveSession` calls

## Implementation Plan

1. Define the dashboard runtime module boundary.
   - Add a dedicated `runtime` NestJS module that owns orchestration only.
   - Extract the current repository provider factories into a shared dashboard
     repository module or equivalent provider file, then import that shared
     provider surface from both runtime control and device management so both
     features operate on the same process-local state.
   - Inject the shared device, runtime, and log repositories instead of
     duplicating storage or simulator logic.
   - Preserve the existing repository class tokens so current tests that call
     `app.get(InMemoryDashboardDeviceRepository)` and related lookups continue
     to resolve the same singleton instances.

2. Implement an in-memory runtime manager service keyed by IMEI.
   - Keep an internal map of active runs containing at minimum the IMEI, current
     `AbortController`, and the background promise for the active
     `runLiveSession` call.
   - Normalize IMEIs consistently with the existing repository conventions
     before lookups and state transitions.
   - Reject duplicate starts when an IMEI already has an active run entry or a
     repository status indicating an active lifecycle.

3. Reuse `runLiveSession` directly for dashboard-triggered starts.
   - Start one device by loading its configuration from the device repository,
     marking runtime state as `starting`, and launching `runLiveSession` with a
     per-device abort signal.
   - Start multiple devices by iterating selected enabled devices and invoking
     the same single-device start path for each device rather than introducing a
     second runtime layer.
   - Support “start all enabled devices” by selecting enabled device records
     from the repository and applying the same per-device path.

4. Translate simulator lifecycle events into dashboard status and log records.
   - Provide a logger adapter for `runLiveSession` that maps known simulator log
     messages into `DashboardLogEvent` records and updates runtime status when
     key transitions happen.
   - Record at least the start request, TCP/connect-handshake milestones, AVL
     send/ack milestones, reconnect attempts, stop requests, completion,
     rejection, and failure outcomes.
   - Persist terminal metadata such as `lastStartAtMs`, `lastStopAtMs`, and
     `lastError` in the runtime repository.

5. Handle clean stop and terminal cleanup deterministically.
   - Stop one device by aborting its controller, recording a stop-requested log
     event, and converting the eventual resolved session outcome into
     `stopped` instead of leaving the run as `completed`.
   - Remove active map entries in a `finally` path so duplicate-start protection
     does not become stale after any terminal outcome.
   - Add stop-all behavior that aborts every currently active device and returns
     per-device results.

6. Expose runtime control endpoints.
   - Add controller endpoints for starting one device, stopping one device,
     starting a selected set of devices, starting all enabled devices, and
     stopping all active devices.
   - Return clear per-device outcomes so callers can distinguish started,
     already-running/rejected, stopped, and failed cases.
   - Keep endpoint validation and HTTP error mapping inside the controller or
     service boundary, without moving protocol behavior into NestJS routes.

7. Wire the runtime feature into the application.
   - Import the runtime module from `src/dashboard/app.module.ts`.
   - Update device-management wiring to consume the shared repository provider
     surface rather than constructing its own private in-module instances.
   - Verify tests still resolve the same repository tokens from the Nest
     application context so runtime control and device management share state
     in both HTTP tests and normal runtime execution.

## Validation And Error-Handling Strategy

- Treat nonexistent devices, disabled devices, and invalid batch inputs as
  explicit request failures instead of silently skipping them.
- Treat duplicate active starts as a rejected runtime-control outcome, not as a
  second session launch.
- Distinguish terminal outcomes:
  - aborted by dashboard stop -> `stopped`
  - IMEI handshake rejection -> `rejected`
  - successful natural completion -> `completed`
  - thrown/transport error after retries exhausted -> `failed`
- Ensure repository status is always synchronized with the active run map so
  device management blocking behavior remains correct.
- Keep cleanup in `finally` blocks to avoid leaked active entries after errors.

## Tests To Add Or Update

- Add runtime service tests covering:
  - shared repository instances are visible from both runtime control and
    device-management consumers
  - start single device creates an active run and updates repository status
  - duplicate start for the same IMEI is rejected without launching a second run
  - stop single device aborts the run and produces `stopped`
  - start selected devices launches at least two concurrent sessions with
    independent tracking
  - start all enabled devices excludes disabled devices
  - stop all aborts every active device and clears active tracking
  - terminal rejected and failed outcomes propagate to repository state and logs

- Add dashboard HTTP tests covering:
  - start one device endpoint
  - stop one device endpoint
  - selected batch start endpoint
  - start-all endpoint
  - duplicate-start behavior returns a clear rejected/conflict-style outcome
  - per-device results include mixed batch outcomes when some devices are
    startable and others are already active or invalid

- Add or extend parser-visible integration coverage so a dashboard-triggered run
  still exercises the existing simulator core and produces observable handshake
  and AVL behavior against the parser/server fixture. Prefer extending
  `tests/end-to-end-parser-visible.test.ts` instead of creating a second
  end-to-end harness.

## Verification Commands

Run exactly these repository-defined checks after implementation:

```bash
npm run build
npm run typecheck
npm test
```

## Risks And Edge Cases

- `runLiveSession` currently emits plain string logs, so the implementation will
  need a careful, stable mapping layer from those messages to dashboard log
  events and runtime transitions. The planner should preserve this as an
  adapter, not a protocol rewrite inside NestJS.
- Abort-driven shutdown currently resolves through the live-session completion
  path. The runtime manager must distinguish operator-requested stop from
  natural completion so stopped sessions are not mislabeled as completed.
- Batch start behavior needs deterministic partial-failure reporting because
  some IMEIs may start while others are rejected or invalid in the same request.
- The runtime repository is shared with device management logic, so inaccurate
  active-state cleanup would cause downstream edit/delete operations to remain
  blocked incorrectly.
- If repository providers are not centralized before adding the runtime module,
  the application will boot with split in-memory state and the device-running
  protections in device management will become unreliable.

## Open Questions

- None blocking for planning. The implementation can proceed using per-IMEI
  `runLiveSession` orchestration and repository-backed state without changing
  simulator-core architecture.
