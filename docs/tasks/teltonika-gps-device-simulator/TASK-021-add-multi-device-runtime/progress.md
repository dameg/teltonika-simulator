Status: IMPLEMENTATION_COMPLETE

Completed work:
- Added `src/multi-device-runtime.ts` to coordinate one independent live runner per IMEI with deterministic per-device seed derivation and failure isolation.
- Switched CLI live mode in `src/index.ts` to use the multi-device runtime instead of rejecting multiple IMEIs.
- Extended `tests/fixtures/teltonika-parser-fixture.ts` with connection IDs, per-connection IMEI responses, and IMEI-attributed AVL frame records for concurrent-session verification.
- Replaced the obsolete single-IMEI rejection assertion in `tests/dry-run.test.ts`.
- Added `tests/multi-device-runtime.test.ts` covering concurrent sessions and mixed accepted/rejected IMEIs.
- Resolved `REV-001` by adding a focused regression in `tests/multi-device-runtime.test.ts` that forces one accepted IMEI into an AVL acknowledgement mismatch after handshake while a second IMEI still completes on its own TCP session.

Changed files:
- `src/index.ts`
- `src/multi-device-runtime.ts`
- `tests/dry-run.test.ts`
- `tests/fixtures/teltonika-parser-fixture.ts`
- `tests/multi-device-runtime.test.ts`

Verification:
- `npm run build` PASS
- `npm run typecheck` PASS
- `npm test` PASS

Open questions and blockers:
- None found during implementation.
