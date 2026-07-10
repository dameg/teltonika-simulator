# TASK-007 Plan

Status: READY

## Current Repository Findings

- TASK-004, TASK-005, and TASK-006 are complete in the task manifest, so the
  NestJS runtime, status/log/clear APIs, and React dashboard surface are
  available for end-to-end coverage.
- `startDashboardServer()` creates a fresh Nest application with fresh
  in-memory repositories. This provides the PRD's process-local restart
  semantics without adding persistence-specific test infrastructure.
- Dashboard HTTP surfaces are already split across `/api/devices`,
  `/api/runtime`, `/api/status`, and `/api/logs`.
- `RuntimeService` delegates actual sessions to the existing `runLiveSession`
  path, so dashboard-triggered traffic can be observed by the reusable
  `startTeltonikaParserFixture()` rather than by duplicating protocol parsing.
- The parser fixture records exact IMEI frames, AVL frames, connection IDs, and
  IMEI-to-connection associations, and exposes wait helpers suitable for
  synchronization in concurrent tests.
- Existing `tests/dashboard-device-management.test.ts` and
  `tests/dashboard-runtime.test.ts` cover isolated API behavior. Existing
  `tests/dashboard-app-shell.test.ts` covers the built React bundle. TASK-007
  should add one composed HTTP/parser flow instead of repeating those unit-like
  assertions broadly.
- No nested `AGENTS.md`, `progress.md`, or `review.md` applies to this task.

## Files To Create Or Modify

- Create `tests/dashboard-end-to-end.test.ts` for dashboard-to-parser
  integration and HTTP smoke coverage.
- Modify `tests/dashboard-app-shell.test.ts` only to make the existing bundle
  smoke assertion explicitly cover the status, logs, clear-log, and
  polling-oriented dashboard markers required by TASK-007; do not add browser
  automation or a new frontend test dependency.
- Do not modify production code, the parser fixture, existing protocol tests,
  or files under `references/`.

## Ordered Implementation Steps

1. Add test lifecycle helpers that build the React bundle when needed, start a
   local `startTeltonikaParserFixture()`, start `startDashboardServer()` on an
   ephemeral port, and close sockets, parser fixtures, and dashboard servers
   in `afterEach`/`afterAll` even when assertions fail.
2. Add a single-device dashboard flow that creates a device through
   `POST /api/devices`, starts it through the runtime endpoint, waits for the
   parser fixture to capture the IMEI and AVL frames, and asserts the captured
   frames are associated with the configured IMEI. Use the existing Codec 8
   Extended decoder/packet assertions where needed; do not implement another
   frame parser in this test.
3. In the same composed flow, poll the dashboard status and logs endpoints
   until the asynchronous run has reached a terminal state, then assert
   running/terminal status transitions and visible lifecycle events including
   connection, IMEI, AVL, and acknowledgement events. Exercise the stop
   endpoint with a bounded run when the test needs to prove explicit stopping.
4. Add a two-device flow that bulk-imports two IMEIs, patches or creates the
   required per-device parser configuration, starts both via
   `POST /api/runtime/start-selected` (or the all-enabled action), and waits
   for two parser-visible IMEI and AVL exchanges. Assert both distinct IMEIs
   appear in fixture records and both dashboard statuses/logs are visible.
5. Add HTTP smoke assertions for manual per-device/global log clear and
   dashboard-state clear, using the existing API response contracts. Confirm
   the cleared endpoints return empty state after the operation.
6. Add a restart test that creates dashboard state, closes the server, starts a
   new dashboard server, and verifies devices, runtime history, and logs are
   empty. Keep the test process-local; do not introduce persistence or process
   spawning.
7. Extend the app-shell bundle assertions only for stable user-visible strings
   and polling endpoint wiring that demonstrate the React surface exposes
   status, logs, clear actions, and refresh behavior. Avoid assertions on
   minified/private component structure.

## Validation And Error-Handling Strategy

- Synchronize network assertions with parser fixture wait helpers and status/
  log polling helpers; avoid arbitrary sleeps and race-prone fixed timing.
- Use short packet counts and intervals so successful runs terminate quickly,
  while leaving enough time to issue and observe an explicit stop action.
- Assert HTTP status codes and response payloads at each dashboard boundary;
  treat asynchronous runtime status and logs as the source of truth after a
  start/stop request.
- Ensure cleanup stops active dashboard runs before closing the parser fixture
  so open sockets and reconnect timers cannot leak into later tests.
- For malformed or failed setup responses, preserve the existing API contract
  assertions in the focused API suites; TASK-007 only needs one composed
  success path plus clear/restart behavior unless an integration failure makes
  an error case necessary.

## Tests To Add Or Update

- `tests/dashboard-end-to-end.test.ts`:
  - dashboard-created device produces parser-visible IMEI and Codec 8 Extended
    AVL traffic;
  - dashboard status/log endpoints expose asynchronous lifecycle events;
  - two dashboard-configured devices run concurrently and are distinguishable
    at the parser boundary;
  - stop and manual clear actions are visible over HTTP;
  - a newly started dashboard has no devices, runs, or logs from the previous
    server instance.
- `tests/dashboard-app-shell.test.ts`:
  - retain the existing build/serve/health checks;
  - assert stable markers for status visibility, recent logs, clear actions,
    and polling refresh endpoints.
- Reuse `tests/fixtures/teltonika-parser-fixture.ts` and current public
  simulator/parser helpers; do not rebuild protocol assertions in NestJS
  tests.

## Verification Commands

Run the task-defined checks from the repository root:

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The runtime is asynchronous and can complete before an assertion observes a
  transient `running` state. Assert the parser exchange and terminal/status
  logs deterministically, and only require `running` after waiting for the
  corresponding IMEI acceptance event.
- Two sessions may interleave fixture events. Use recorded IMEI/frame metadata
  and set-based assertions rather than relying on event order.
- Starting a dashboard server requires the frontend bundle. The test setup
  must build it or rely on the task's documented build prerequisite without
  making test order significant; prefer the existing test setup pattern.
- A stop request can race with natural packet-count completion. Use a bounded
  run and assert the returned action plus a terminal status accepted by the
  runtime contract.
- Existing legacy parser-dashboard tests target `startDashboardBackend()` and
  are not interchangeable with the NestJS control-plane flow; keep both test
  surfaces intact.

## Unresolved Blockers

- None. The required fixture, dashboard endpoints, React bundle, and simulator
  session path are present, and the task's dependency statuses are complete.
