Status: READY

# Current Repository Findings

- `src/live-session.ts` already composes route resolution, device-profile lookup, deterministic simulator creation, IMEI handshake, repeated AVL sends, interval pacing, and abort-aware shutdown into one live-session entry point.
- `src/imei-handshake.ts` already provides the reconnect seam for this task: each call opens a fresh TCP socket, sends the IMEI frame, and returns either `{ kind: "accepted", socket }` or `{ kind: "rejected" }`.
- `src/avl-session.ts` already treats write failures, socket close during acknowledgement read, and accepted-record-count mismatches as explicit errors; acknowledgement mismatch is already a hard failure surface rather than a retryable result.
- `src/index.ts` currently allows only one live IMEI and invokes `runLiveSession(...)` once, but it does not use the already parsed `reconnectDelayMs` setting from `src/config.ts`.
- `tests/live-session.test.ts` currently proves repeated sends, deterministic packet bytes for identical inputs, interval-driven timestamp advancement, and abort-driven clean shutdown against the parser fixture.
- `tests/fixtures/teltonika-parser-fixture.ts` already exposes the parser-visible hooks this task needs: it can wait for multiple connections, record IMEI and AVL frames per connection, close a client socket to simulate parser restart / TCP loss, and vary IMEI response bytes or AVL acknowledgement counts.
- The main architectural constraint is that reconnect cannot simply wrap repeated calls to the current `runLiveSession(...)`, because that function recreates the simulator from the initial seed and route every time, which would reset the telemetry sequence after each reconnect and violate the task’s deterministic-sequence requirement.
- No nested `AGENTS.md` files apply under `src/`, `tests/`, or this task directory, so the repository-root instructions govern this work.

# Files To Create Or Modify

- Modify `src/live-session.ts` to split one connected-session attempt from higher-level runner supervision while preserving existing live-session coverage and public behavior where possible.
- Optionally add a new narrow runtime module such as `src/single-device-runner.ts` if keeping reconnect supervision separate from per-connection session logic makes the deterministic-state boundary clearer.
- Modify `src/index.ts` to invoke the reconnectable single-device runner in live mode and pass through the configured `reconnectDelayMs` while retaining the single-IMEI guard.
- Update `tests/live-session.test.ts` with reconnect-focused parser-visible coverage.
- Optionally extend `tests/fixtures/teltonika-parser-fixture.ts` only if a small reusable helper is needed to make reconnect assertions deterministic and readable.

# Ordered Implementation Steps

1. Extract the long-lived simulation state from the per-connection transport lifecycle.
   The runner for this task needs one route resolution, one device-profile lookup, and one deterministic simulator instance for the entire process lifetime. Refactor the current live-session implementation so reconnecting reuses that existing simulator instead of reinitializing it from the original seed.

2. Define a narrow "single accepted connection attempt" flow below the runner.
   That flow should perform one IMEI handshake, send AVL packets in the existing interval loop while the socket remains healthy, and return a typed terminal result for IMEI rejection versus propagating retryable transport failures upward.

3. Add reconnect supervision above that attempt boundary.
   Retry after connect failure, handshake-time socket loss, or socket close during the active session by waiting the fixed configured delay and then performing a fresh IMEI handshake on a new socket. Keep this logic strictly single-device and do not broaden it into TASK-021 multi-device orchestration.

4. Preserve the task’s explicit stop and fail semantics.
   IMEI rejection must terminate the runner without reconnecting. AVL acknowledgement mismatch must remain an explicit runner failure with no silent retry. Intentional abort/shutdown must stop the runner cleanly without scheduling another reconnect attempt.

5. Wire the CLI live path to the reconnectable runner.
   Keep `src/index.ts` scoped to one configured IMEI in live mode, pass `reconnectDelayMs`, and continue to fail clearly if multiple IMEIs are configured outside dry-run mode.

6. Add parser-visible reconnect coverage.
   Reuse the existing fixture to close the server-side socket after at least one accepted send, assert that a second TCP connection appears only after the fixed delay, and assert that the first payload on the new connection is a fresh IMEI handshake before additional AVL traffic resumes.

7. Extend the existing failure-path tests for the new runner contract.
   Add coverage proving that IMEI rejection stops permanently without a second connection attempt and that AVL acknowledgement mismatch rejects the runner explicitly instead of reconnecting.

# Validation And Error-Handling Strategy

- Keep reconnect classification narrow and explicit: reconnect only on connection-establishment failure or unexpected socket closure, not on protocol-level rejection or acknowledgement mismatch.
- Preserve a fresh IMEI handshake on every reconnect by routing every retry through `performImeiHandshake(...)` rather than trying to reuse an old socket.
- Keep simulation advancement coupled to successful loop iterations only; reconnect delay should pause wall-clock sending, but must not recreate or rewind the simulator state.
- Reuse the existing abort-aware sleep pattern for both send intervals and reconnect delay so shutdown can interrupt either wait path immediately.
- Make socket teardown idempotent across active-session failure, parser-driven close, and abort handling so one failure path does not trigger duplicate cleanup or duplicate reconnect scheduling.

# Tests To Add Or Update

- Update `tests/live-session.test.ts` with a reconnect test that closes the parser-side socket, waits for a second connection, and asserts a second IMEI frame arrives before subsequent AVL frames.
- Add a reconnect-delay assertion that uses real elapsed time conservatively or a fixture-visible sequencing check to prove the runner does not reconnect immediately.
- Add a rejection test that configures the fixture to reject the IMEI and asserts the runner returns the terminal rejected result without opening another connection.
- Add an acknowledgement-mismatch test at the runner level that confirms the promise rejects explicitly and the fixture does not observe a reconnect attempt afterward.
- Preserve the existing deterministic-sequence and clean-shutdown coverage so the refactor does not regress TASK-019 behavior while adding reconnect support.

# Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

# Risks

- The main risk is refactoring `src/live-session.ts` at the wrong seam and accidentally resetting simulator state on reconnect, which would make packet bytes diverge across otherwise identical runs.
- Reconnect timing tests can become flaky if they rely on tight wall-clock assertions. Prefer parser-visible sequencing with only coarse elapsed-time checks where necessary.
- If reconnect policy is encoded too broadly, the runner could incorrectly retry after acknowledgement mismatch or IMEI rejection and violate explicit acceptance criteria.

# Unresolved Blockers

- None for planning.
