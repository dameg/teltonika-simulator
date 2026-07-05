# TASK-018 Plan

Status: READY

## Current Repository Findings

- `docs/tasks/teltonika-gps-device-simulator/manifest.json` shows `TASK-014` and `TASK-017` completed, so this task can plan against the existing packet encoder and accepted-handshake socket result without inventing new dependencies.
- `src/codec8-extended.ts` already frames valid Codec 8 Extended TCP AVL packets, including the zero preamble, data-length field, repeated record count, and CRC field. This task should reuse that encoder instead of duplicating framing logic.
- `src/imei-handshake.ts` already opens the TCP connection, sends the IMEI frame, and returns an accepted result with the live socket preserved. That accepted socket is the narrow seam this task should extend.
- `tests/fixtures/teltonika-parser-fixture.ts` already records exact AVL frame bytes and writes a configurable 4-byte big-endian acknowledgement count, which matches the Traccar TCP parser behavior and gives a parser-visible test seam.
- `src/index.ts` still rejects live runtime execution with `Live TCP runtime is not implemented yet. Use --dry-run.`, and `tests/dry-run.test.ts` guards the dry-run/runtime boundary. TASK-018 should not wire TCP runtime startup into the CLI.
- The Traccar references confirm the device-side behavior needed here: after the server accepts IMEI, the device sends the AVL frame and then reads a 4-byte accepted-record count; for TCP that acknowledgement is `writeInt(count)` on the server side.
- No nested `AGENTS.md` files exist under `src/`, `tests/`, or this task directory, so the repository-root instructions apply.

## Files To Create Or Modify

- Create `src/avl-session.ts`
- Modify `src/index.ts`
- Add `tests/avl-session.test.ts`
- Modify `tests/teltonika-parser-fixture.test.ts` only if a small helper extraction improves reuse

## Ordered Implementation Steps

1. Add a small transport-only AVL send helper in `src/avl-session.ts`.
   - Accept an already connected `net.Socket` plus either a pre-encoded AVL frame or the AVL records needed to encode one.
   - Reuse `encodeCodec8ExtendedPacket` if the helper accepts records, so packet framing stays in the existing encoder module.
   - Keep the helper independent from route loading, simulation, and device-profile mapping.

2. Define the narrow result and failure contract for one send attempt.
   - Write exactly one framed AVL packet to the accepted socket.
   - Read exactly 4 acknowledgement bytes, allowing for TCP fragmentation.
   - Decode the acknowledgement as an unsigned big-endian 32-bit record count.
   - Compare the acknowledgement count to the packet record count and treat any mismatch as an explicit session failure.

3. Keep failure handling strict and local to this task.
   - Reject on socket close before all 4 acknowledgement bytes arrive.
   - Reject on socket error during send or acknowledgement read.
   - Reject on acknowledgement-count mismatch and close or destroy the socket so the caller cannot silently continue on a broken session.
   - Do not add retries, reconnect loops, or telemetry-generation logic here.

4. Export the helper for later runtime tasks without wiring live CLI behavior.
   - Re-export the new helper and its result type from `src/index.ts`.
   - Leave `runCli` and `src/dry-run.ts` unchanged so the dry-run-only runtime boundary remains intact.

5. Add parser-visible tests around the accepted-session flow.
   - Perform a real IMEI handshake against the existing parser fixture to obtain an accepted socket.
   - Send one valid Codec 8 Extended packet after acceptance and assert the fixture records the exact bytes.
   - Assert a matching 4-byte acknowledgement count succeeds.
   - Assert a mismatched acknowledgement count fails clearly and does not silently retry.
   - Assert fragmented server acknowledgement bytes are reassembled correctly before comparison.

## Validation And Error-Handling Strategy

- Count records from the same packet data the helper actually sends, so acknowledgement comparison cannot drift from the transmitted frame.
- Buffer acknowledgement data until 4 bytes are available; TCP does not preserve message boundaries.
- Treat early EOF, socket errors, and mismatched counts as hard failures with explicit error messages.
- Close the socket on mismatch or incomplete acknowledgement to avoid leaving the caller with a half-valid session.
- Keep accepted-session socket ownership simple: success returns only after the acknowledgement matches, otherwise the helper tears the socket down.

## Tests To Add Or Update

- Add `tests/avl-session.test.ts` as the primary coverage for post-accept AVL send and acknowledgement handling.
- Reuse `tests/fixtures/teltonika-parser-fixture.ts` to assert parser-visible bytes and configurable acknowledgement counts.
- Update `tests/teltonika-parser-fixture.test.ts` only if a small helper extraction reduces duplication for reading fragmented acknowledgements; do not broaden fixture scope.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main risk is mishandling partial acknowledgement reads and comparing before all 4 bytes arrive; that would create flaky session behavior under normal TCP fragmentation.
- Another risk is leaving the socket open after a mismatched acknowledgement, which would make later reconnect or runner tasks inherit a bad session state.
- A larger-than-needed abstraction here would blur transport and telemetry boundaries. This task only needs one accepted-session send attempt and one acknowledgement check.

## Unresolved Blockers

- None.
