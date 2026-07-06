Status: IMPLEMENTATION_COMPLETE

Summary:
- Added a reusable Codec 8 Extended packet decoder in `src/codec8-extended-decoder.ts`.
- Exported the decoder API and result/error types from `src/index.ts`.
- Added decoder-focused tests in `tests/codec8-extended-decoder.test.ts` covering an independent fixture, round-trip decoding, malformed packet errors, and module-boundary independence.

Changed Files:
- `src/codec8-extended-decoder.ts`
- `src/index.ts`
- `tests/codec8-extended-decoder.test.ts`

Verification:
- `npm run build` -> PASS
- `npm run typecheck` -> PASS
- `npm test` -> PASS

Notes:
- `review.md` did not exist for this task, so there were no blocking review findings to address.
- `docs/tasks/teltonika-raw-decoded-dashboard/manifest.json` had a pre-existing modification in the worktree and was not changed.

Open Questions:
- None within implementer scope. The decoder and tests were implemented against the task plan, repository domain types, and the referenced Teltonika/Traccar packet fixture.
