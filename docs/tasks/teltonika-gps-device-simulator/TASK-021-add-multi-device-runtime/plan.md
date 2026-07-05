# TASK-021 Plan

## Status

READY

## Scope Summary

Implement a multi-device live runtime that starts one independent reconnectable
device runner per configured IMEI, preserves per-device TCP session isolation,
keeps other devices running when one device is rejected or fails, derives
deterministic but device-specific simulation inputs from shared configuration,
and shuts every runner down cleanly on process stop.

## Current Repository Findings

- `src/index.ts` is the current single-device gate. It rejects live runs when
  more than one IMEI is configured and invokes `runLiveSession(...)` exactly
  once.
- `src/config.ts` already supports multiple IMEIs through CLI and environment
  parsing, so configuration changes are not the main blocker.
- `src/live-session.ts` already provides the right per-device primitive:
  independent connect / handshake / AVL send / reconnect behavior for a single
  IMEI.
- `src/live-session.ts` currently uses the shared `seed` directly, which means
  two devices with the same route, profile, interval, and seed would emit the
  same simulated telemetry unless the caller derives per-device inputs.
- `tests/fixtures/teltonika-parser-fixture.ts` already accepts multiple client
  sockets, but it records AVL frames globally without a stable IMEI/session
  association, which is insufficient for proving per-device packet attribution
  under concurrent connections.
- `tests/live-session.test.ts` already covers the single-device reconnect,
  rejection, acknowledgement, and shutdown behavior that the multi-device
  orchestration should reuse rather than duplicate inside transport code.
- `tests/dry-run.test.ts` currently expects the CLI to reject multiple IMEIs in
  live mode and will need to be updated once multi-device live runtime is
  allowed.

## Files To Modify

- `src/index.ts`
- `tests/fixtures/teltonika-parser-fixture.ts`
- `tests/dry-run.test.ts`
- add a focused runtime test file for multi-device behavior

## Files To Create

- `src/multi-device-runtime.ts` or equivalent runtime-orchestration module
- `tests/multi-device-runtime.test.ts` or equivalent focused test coverage

## Implementation Steps

1. Add a dedicated multi-device runtime module above `runLiveSession(...)`.
   This module should accept the shared live configuration plus the IMEI list,
   start one session promise per IMEI, and manage those long-lived runners
   without fail-fast behavior.

2. Keep transport/session responsibilities separated. Reuse
   `runLiveSession(...)` as the single-device session primitive instead of
   merging multi-device orchestration into socket or AVL encoding layers.

3. Define deterministic per-device simulation input derivation. The runtime
   should convert the shared configuration into a stable device-specific value
   for each IMEI, such as a derived seed based on the shared seed plus IMEI, so
   repeated runs remain reproducible while different IMEIs do not produce
   identical telemetry streams by default.

4. Define multi-device settlement behavior explicitly. A rejected IMEI should
   stop only that device runner. A recoverable connection failure should remain
   local to that device's reconnect loop. A non-recoverable device failure
   should surface in runtime results or logs without masking successful
   sessions from other IMEIs.

5. Update `src/index.ts` to remove the single-IMEI live runtime restriction and
   invoke the new orchestrator with the shared shutdown signal wiring that
   already exists for process signals.

6. Extend the parser fixture so tests can attribute observed AVL packets to the
   device/session that produced them. The minimal acceptable shape is to retain
   the existing global capture while also storing per-socket or per-IMEI frame
   metadata needed by the acceptance criteria.

7. Add multi-device runtime tests that prove:
   two IMEIs can connect concurrently;
   handshake frames are distinct and attributable to each IMEI;
   AVL packets are observed for each IMEI;
   one rejected or failed IMEI does not prevent another device from connecting
   and sending data;
   stop/abort shuts down every runner cleanly.

8. Update obsolete CLI/runtime tests that asserted multi-IMEI live execution is
   rejected.

## Validation And Error-Handling Strategy

- Preserve the current single-device reconnect behavior in `runLiveSession(...)`
  so connection retries remain isolated to one IMEI.
- Avoid `Promise.all(...)` fail-fast orchestration for long-running device
  sessions. Use settlement tracking so one device failure does not tear down
  unrelated sessions prematurely.
- Keep shutdown centralized through the existing abort signal path and ensure
  the multi-device runtime waits for all runners to finish their cleanup before
  returning.
- Make per-device outcomes explicit so operators and tests can identify which
  IMEI failed, was rejected, or completed cleanly.
- Do not blur simulation and networking boundaries. Per-device seed derivation
  belongs in runtime/session input preparation, not in AVL encoding or TCP
  transport code.

## Tests To Add Or Update

- Add focused unit/integration-style tests for the multi-device runtime using
  the existing Teltonika parser fixture server.
- Update fixture coverage if necessary to verify IMEI-to-AVL attribution.
- Update `tests/dry-run.test.ts` to remove or replace the obsolete expectation
  that live mode rejects multiple IMEIs.
- Keep existing single-device tests passing to guard against regressions in
  reconnect, rejection, acknowledgement handling, and shutdown behavior.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks And Edge Cases

- The main correctness risk is seed derivation. The implementation must make
  device output distinct across IMEIs while staying deterministic across
  repeated runs with the same shared configuration.
- Multi-device orchestration can accidentally reintroduce coupled failure if it
  uses fail-fast promise composition or shared mutable session state.
- Packet attribution in tests can become flaky if the fixture only records raw
  frames without stable socket/IMEI linkage.
- Shutdown behavior must account for mixed states: one device reconnecting,
  another connected, and another already rejected or failed.

## Open Questions And Blockers

- No blocking repository-level ambiguity was found for planning.
- The implementation should choose and document one stable per-device seed
  derivation rule during coding so test expectations match runtime behavior.
