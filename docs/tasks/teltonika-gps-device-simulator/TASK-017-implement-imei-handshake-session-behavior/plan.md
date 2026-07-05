# TASK-017 Plan

Status: READY

## Current Repository Findings

- `src/index.ts` still throws `Live TCP runtime is not implemented yet. Use --dry-run.` for non-dry-run execution, so there is no existing TCP client or runner to extend for this task.
- `src/config.ts` already provides the host, port, IMEI list, and reconnect delay inputs needed by later runtime work, but TASK-017 only needs one outbound connection and one IMEI exchange.
- `tests/fixtures/teltonika-parser-fixture.ts` already provides the right parser-visible seam for this task: it captures exact IMEI bytes, emits configurable `0x01`/`0x00` responses, records any AVL frames, and can close sockets for later reconnect scenarios.
- Current dry-run boundary tests in [tests/dry-run.test.ts](/Users/dameg/dev/private/teltonika-simulator/tests/dry-run.test.ts:1) forbid pulling `net` or session startup into `src/dry-run.ts` and `src/index.ts`, so handshake logic should live in a separate transport module instead of being wired into the CLI now.
- The Traccar references confirm the inverse device behavior needed here: send `uint16` IMEI length plus ASCII IMEI, then wait for a single-byte parser acknowledgement where `0x01` accepts and `0x00` rejects.
- No nested `AGENTS.md` files exist under `src/`, `tests/`, or this task directory; the repository-root instructions apply.

## Files To Create Or Modify

- Create `src/imei-handshake.ts`
- Modify `tests/teltonika-parser-fixture.test.ts`
- Add a new handshake-focused test file under `tests/` such as `tests/imei-handshake.test.ts`

## Ordered Implementation Steps

1. Add a small transport-only handshake module in `src/imei-handshake.ts`.
   - Use Node's built-in `net` client.
   - Build the handshake frame as two-byte big-endian IMEI length plus ASCII IMEI bytes.
   - Open one outbound TCP connection, send exactly that frame, and wait for exactly one acknowledgement byte.

2. Define the smallest reusable result shape for later tasks.
   - Return an accepted result that keeps the connected socket available for TASK-018 AVL sending.
   - Return a rejected result for `0x00` after closing the socket so the caller cannot accidentally reconnect or continue.
   - Treat any other byte, EOF before the acknowledgement byte, or socket error during the handshake as an explicit protocol/session failure.

3. Keep the task scoped to handshake behavior only.
   - Do not add reconnect loops, send intervals, telemetry generation, or AVL packet sending.
   - Do not wire live runtime startup into `src/index.ts` yet; TASK-020 owns runner behavior.
   - Keep the module independent from route, simulation, and Codec logic.

4. Add parser-visible tests with the existing fixture.
   - Assert the fixture receives the exact IMEI frame bytes for a successful handshake.
   - Assert `0x01` yields an accepted result and leaves the socket usable for the next task.
   - Assert `0x00` yields a rejected result, closes the client side, and does not reconnect.
   - Assert no AVL frame is recorded before IMEI acceptance.
   - Assert unexpected acknowledgement bytes fail clearly and do not leave an open socket behind.

5. Reuse or lightly extend existing fixture coverage only where it helps.
   - If useful, factor the local IMEI-frame encoder or socket-read helpers into the new handshake test instead of broad fixture changes.
   - Keep fixture changes minimal unless the handshake tests expose a missing observable needed by later TCP tasks.

## Validation And Error-Handling Strategy

- Validate IMEI framing in one place by encoding from the ASCII payload length; do not duplicate ad hoc frame assembly across callers.
- Accumulate acknowledgement bytes until one byte is available, because TCP can fragment reads even for the one-byte response.
- Close or destroy the socket on rejected IMEIs and protocol errors so later tasks do not inherit half-open sessions.
- Surface protocol mismatches with explicit errors that name the unexpected acknowledgement byte or missing acknowledgement condition.
- Keep accepted sockets open only after the acknowledgement is confirmed to be `0x01`.

## Tests To Add Or Update

- Add `tests/imei-handshake.test.ts` as the primary coverage for outbound TCP handshake behavior.
- Reuse `tests/fixtures/teltonika-parser-fixture.ts` to assert parser-visible bytes and configurable acknowledgement handling.
- Update `tests/teltonika-parser-fixture.test.ts` only if a small helper extraction or fixture assertion improves reuse without changing fixture scope.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main implementation risk is leaking sockets on rejected or invalid acknowledgements; that would make later reconnect and packet-send tasks flaky.
- Another risk is overcoupling the handshake helper to future runner concerns. This task only needs one connection attempt and one IMEI exchange.
- Importing the handshake module into `src/index.ts` now would break the existing dry-run boundary tests and expand scope into runtime orchestration too early.

## Unresolved Blockers

- None.
