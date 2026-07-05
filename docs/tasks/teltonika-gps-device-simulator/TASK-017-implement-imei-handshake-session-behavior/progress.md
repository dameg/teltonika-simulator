# TASK-017 Progress

Status: IMPLEMENTATION_COMPLETE

## Completed Work

- Added `src/imei-handshake.ts` with a transport-only IMEI handshake helper that:
  - opens one outbound TCP connection with Node's built-in `net` client;
  - sends the two-byte big-endian IMEI length plus ASCII IMEI payload;
  - returns `{ kind: "accepted", socket }` for `0x01`;
  - returns `{ kind: "rejected" }` and closes the socket for `0x00`;
  - throws explicit protocol errors for unexpected acknowledgement bytes or socket closure before acknowledgement.
- Exported the handshake helper from `src/index.ts` for reuse by later TCP session tasks.
- Extended `tests/fixtures/teltonika-parser-fixture.ts` so handshake tests can configure any one-byte IMEI acknowledgement while keeping parser-visible behavior unchanged.
- Added `tests/imei-handshake.test.ts` to verify:
  - the fixture receives the exact IMEI handshake bytes;
  - accepted IMEIs return an accepted session result and do not send AVL before acceptance;
  - rejected IMEIs stop the session without reconnecting;
  - unexpected acknowledgement bytes fail clearly and close the session.

## Changed Files

- `src/imei-handshake.ts`
- `src/index.ts`
- `tests/fixtures/teltonika-parser-fixture.ts`
- `tests/imei-handshake.test.ts`

## Verification

- `npm run build` — passed
- `npm run typecheck` — passed
- `npm test` — passed

## Review Findings Addressed

- None. `review.md` does not exist for this task.

## Unresolved Issues

- None.
