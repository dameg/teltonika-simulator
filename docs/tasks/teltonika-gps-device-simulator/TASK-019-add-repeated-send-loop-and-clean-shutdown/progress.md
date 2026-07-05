Status: IMPLEMENTATION_COMPLETE

# Completed Work

- Added `src/live-session.ts` to run one accepted device session that reuses the existing route, simulation, AVL mapping, and packet send modules while keeping telemetry generation outside the TCP session helper.
- Replaced the live-mode CLI stub in `src/index.ts` with a single-device live runtime path, process `SIGINT`/`SIGTERM` abort wiring, and a guard that rejects multiple IMEIs outside dry-run mode.
- Updated `src/imei-handshake.ts` so the IMEI handshake accepts an `AbortSignal`, aborts a pending pre-ack socket cleanly, and normalizes handshake-time shutdown into an `AbortError` instead of leaking transport resets.
- Updated `src/live-session.ts` so handshake-time aborts flow through the same clean shutdown path as post-accept aborts, including socket teardown before returning a completed shutdown result.
- Added parser-visible runtime coverage in `tests/live-session.test.ts` for repeated sends, deterministic packet sequences, interval-driven timestamp advancement, clean shutdown on abort, and shutdown while the IMEI acknowledgement is still pending.
- Updated `tests/dry-run.test.ts` for the async CLI entry point and added coverage for the single-IMEI live-mode guard.
- Added handshake abort regression coverage in `tests/imei-handshake.test.ts` and extended `tests/fixtures/teltonika-parser-fixture.ts` so tests can intentionally hold back the IMEI acknowledgement.

# Changed Files

- `src/live-session.ts`
- `src/imei-handshake.ts`
- `src/index.ts`
- `tests/live-session.test.ts`
- `tests/imei-handshake.test.ts`
- `tests/fixtures/teltonika-parser-fixture.ts`
- `tests/dry-run.test.ts`

# Verification

- `npm run build` -> passed
- `npm run typecheck` -> passed
- `npm test` -> passed

# Review Findings Addressed

- `REV-001` resolved: aborting during a pending IMEI acknowledgement now closes the in-flight handshake socket, `runLiveSession(...)` returns through the shutdown path, and regression tests cover both the handshake helper and the full live session.

# Unresolved Issues

- None within `TASK-019` scope.
