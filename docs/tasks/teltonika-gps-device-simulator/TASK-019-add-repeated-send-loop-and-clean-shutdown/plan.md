Status: READY

# Current Repository Findings

- `src/dry-run.ts` already composes route resolution, device-profile lookup, deterministic simulation, vehicle-state mapping, and Codec 8 Extended framing into a repeatable packet sequence without touching TCP.
- `src/imei-handshake.ts` already opens a TCP connection, sends the IMEI frame, and returns either a connected accepted socket or a rejected result.
- `src/avl-session.ts` already sends one AVL packet, waits for the 4-byte acknowledgement, validates the accepted-record count, and destroys the socket on send failure.
- `src/index.ts` still rejects live mode with `Live TCP runtime is not implemented yet. Use --dry-run.`
- The parser fixture in `tests/fixtures/teltonika-parser-fixture.ts` can already record multiple AVL frames over one socket and can close the server-side socket, which is enough to exercise repeated sends and shutdown behavior.
- Task dependencies are completed in `docs/tasks/teltonika-gps-device-simulator/manifest.json`, so there is no repository-level blocker for planning this task.

# Files To Create Or Modify

- Modify `src/index.ts` to replace the live-mode stub with a single-session runtime entry point and process shutdown wiring.
- Create `src/live-session.ts` (or similarly narrow runtime file) to run one accepted device session that loops on interval, consumes mapped AVL records, logs session events, and closes cleanly.
- Optionally modify `src/avl-session.ts` only if a small socket-close helper or clearer shutdown behavior is needed; do not move telemetry generation into this file.
- Add tests in `tests/` for repeated live sends, deterministic packet sequences, interval-driven advancement, and clean shutdown.
- Optionally extend `tests/fixtures/teltonika-parser-fixture.ts` only if a tiny helper is needed for timing or close observation; keep it reusable.

# Ordered Implementation Steps

1. Add a narrow live-session module above the existing transport helpers.
   The module should accept resolved runtime inputs instead of reading CLI state directly: host, port, imei, interval, route/device-profile inputs, logger, and an optional `AbortSignal`.

2. Reuse the existing dry-run composition inside that module.
   Resolve the route, load the device profile, create one deterministic vehicle simulator, and on each loop iteration call `simulator.next()`, `mapVehicleStateToAvlRecord(...)`, and `sendAvlPacket(socket, [record])`.

3. Keep transport and telemetry responsibilities separate.
   `src/avl-session.ts` should continue to consume ready-made AVL records only; the new live-session module is the place that advances simulation and decides when to send the next packet.

4. Implement the repeated send loop with interval pacing.
   After an accepted IMEI handshake, send one record per packet by default, wait for the acknowledgement, log the accepted count, then wait for the configured interval before sending the next record. Use a cancellable sleep so abort/shutdown does not wait for the full interval to elapse.

5. Implement clean shutdown semantics.
   On abort signal or process termination hook, stop scheduling new sends, end or destroy the socket exactly once, and let the live-session promise resolve without treating intentional shutdown as an error. If IMEI is rejected, log it and stop without reconnecting.

6. Update the CLI entry point for this task’s scope only.
   Replace the live-mode throw in `src/index.ts` with one live-session invocation. Keep scope to one device session: if multiple IMEIs are configured in non-dry-run mode, fail clearly instead of silently widening into TASK-021.

7. Add parser-visible tests around the new runtime behavior.
   Cover multiple packets over time on one accepted socket, deterministic sequences for identical route/style/seed/interval inputs, interval-driven simulation advancement, and clean socket closure on abort.

# Validation And Error-Handling Strategy

- Treat IMEI rejection as a normal terminal result for this task: log reject and stop the session without reconnecting.
- Propagate handshake failures, socket errors, and AVL acknowledgement mismatches as explicit live-session failures; do not retry here because reconnect belongs to TASK-020.
- Use a single cancellation path for both external abort signals and process hooks so shutdown logic is not duplicated.
- Make shutdown idempotent: repeated aborts, socket `close`, and process signals should not cause double-destroy or duplicate logging.
- Use the configured interval as the single pacing source so simulation timestamps and packet emission cadence stay aligned.

# Tests To Add Or Update

- Add a live-session test that performs IMEI accept, waits for multiple AVL frames on one connection, and asserts the parser fixture records more than one packet.
- Add a determinism test that runs the same live-session inputs twice against the fixture and compares recorded packet bytes for equality.
- Add an interval test that verifies successive packet timestamps advance by the configured interval rather than by wall-clock timing assumptions.
- Add a clean-shutdown test that aborts the running session and asserts the client socket closes and no extra AVL frames are sent afterward.
- Update CLI-facing tests only as needed to cover the new non-dry-run path or the single-IMEI guard.

# Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

# Risks

- Timer-based tests can become flaky if they rely on real delays instead of parser-visible packet contents or explicit abort synchronization.
- Process signal handling is hard to test directly; keep the core runtime driven by `AbortSignal` so only a thin CLI hook layer depends on `process`.
- Mixing shutdown logic into `src/avl-session.ts` would blur the architecture boundary the task explicitly protects; keep loop orchestration above transport.

# Unresolved Blockers

- None for planning.
