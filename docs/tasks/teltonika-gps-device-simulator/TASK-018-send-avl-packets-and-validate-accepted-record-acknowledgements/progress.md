# TASK-018 Progress

## Status

IMPLEMENTATION_COMPLETE

## Completed Work

- Added `src/avl-session.ts` with a transport-only `sendAvlPacket` helper that:
  - encodes and sends exactly one Codec 8 Extended AVL packet on an accepted socket;
  - reads exactly one 4-byte big-endian accepted-record acknowledgement;
  - treats acknowledgement count mismatches as explicit session failures;
  - destroys the socket on mismatch, early close, or socket error so later runtime tasks cannot continue on a broken session.
- Updated `src/imei-handshake.ts` to pause the accepted socket before returning it, so post-handshake protocol stages can safely perform their own reads.
- Re-exported the AVL send helper from `src/index.ts` without changing the dry-run-only CLI boundary.
- Extended `tests/fixtures/teltonika-parser-fixture.ts` with configurable acknowledgement chunking so tests can exercise fragmented 4-byte server acknowledgements.
- Added `tests/avl-session.test.ts` to verify:
  - the parser fixture receives the exact framed AVL bytes after IMEI acceptance;
  - matching acknowledgement counts succeed;
  - mismatched acknowledgement counts fail clearly and do not silently retry;
  - fragmented acknowledgement bytes are reassembled before comparison.

## Changed Files

- `src/avl-session.ts`
- `src/imei-handshake.ts`
- `src/index.ts`
- `tests/fixtures/teltonika-parser-fixture.ts`
- `tests/avl-session.test.ts`

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Verification Results

- `npm run build` — passed
- `npm run typecheck` — passed
- `npm test` — passed

## Review Findings Addressed

- None. `review.md` does not exist for this task yet.

## Unresolved Issues

- None.
