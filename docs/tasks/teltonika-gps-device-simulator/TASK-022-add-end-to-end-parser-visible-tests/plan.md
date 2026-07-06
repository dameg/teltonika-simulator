# Plan

## Status

COMPLETED

## Current Findings

- The repository already has the required runtime composition points for this task:
  - `src/live-session.ts` drives a simulated device through IMEI handshake, AVL packet transmission, acknowledgement handling, and reconnect behavior.
  - `src/multi-device-runtime.ts` composes concurrent live sessions for multiple IMEIs.
  - `src/dry-run.ts` produces deterministic packet output for a fixed route, driving style, seed, and interval.
- The reusable local parser fixture already exists in `tests/fixtures/teltonika-parser-fixture.ts` and exposes parser-visible handshake and AVL frame capture plus controllable acknowledgement behavior.
- Existing tests cover many lower-level expectations separately (`tests/live-session.test.ts`, `tests/multi-device-runtime.test.ts`, `tests/dry-run.test.ts`, `tests/avl-session.test.ts`), but TASK-022 still needs a dedicated end-to-end parser-visible test layer that demonstrates the full flow explicitly against the local parser fixture.

## Files To Create Or Modify

- Create `tests/end-to-end-parser-visible.test.ts` for the task-focused parser-visible integration coverage.
- Optionally extend shared test helpers only if the new end-to-end spec needs a small reusable assertion that does not already exist.

## Implementation Steps

1. Add a dedicated end-to-end parser-visible test file that starts the local parser fixture and drives the existing public runtime entry points for this task instead of re-testing isolated packet helpers.
2. Add a single-device test that runs a live session with the route fixture, asserts an accepted IMEI handshake, waits for a parser-visible AVL frame, and ties the captured frame back to the expected IMEI and connection metadata.
3. In that same flow, validate one parser-captured AVL packet as Codec 8 Extended by reusing the existing framing and CRC assertions already present in the test suite, rather than introducing a parallel packet parser in the new file.
4. Add a multi-device test via `runMultiDeviceRuntime` for two IMEIs, asserting both devices connect, both IMEIs are observed by the parser fixture, and both produce parser-visible AVL traffic. This is the preferred acceptance path because TASK-022 explicitly allows "at least two IMEIs or reconnect behavior" and the repository already has reusable multi-device coverage patterns.
5. Add a dry-run determinism test in the same task-focused spec that invokes the public dry-run path for a fixed route, style, seed, and interval and asserts identical output across repeated runs.
6. Keep assertions focused on externally visible behavior only: parser-observed IMEI/AVL traffic, packet validity, multi-device behavior, and deterministic dry-run output.

## Validation And Error-Handling Strategy

- Reuse the parser fixture’s wait helpers to avoid race-prone sleeps.
- Assert connection identity and IMEI association using fixture-captured metadata so concurrent-device coverage stays parser-visible.
- Reuse existing packet parsing and validation helpers rather than re-implementing framing, length, record-count, or CRC checks in the new spec.
- Treat acknowledgement mismatches and reconnect behavior as observable session outcomes; do not add implementation-only assertions against private helpers.

## Tests To Add Or Update

- Add `tests/end-to-end-parser-visible.test.ts` with coverage for:
  - accepted IMEI handshake followed by parser-visible AVL exchange from a route-following live session;
  - validation of at least one parser-captured packet as Codec 8 Extended with correct length, count, and CRC;
  - two-IMEI concurrent runtime behavior through `runMultiDeviceRuntime`;
  - deterministic dry-run output for repeated runs with identical inputs.
- Avoid broad refactors of existing tests unless a tiny helper extraction clearly reduces duplication for the new file.

## Verification

- `npm run build`
- `npm run typecheck`
- `npm test`

## Risks And Constraints

- Existing tests already satisfy large parts of the acceptance criteria in a distributed way, so the main risk is accidental duplication without producing clearer task-level coverage. The implementation should prefer one focused integration spec that composes existing helpers.
- End-to-end networking tests can become timing-sensitive. The implementation should continue using fixture-driven synchronization and abort signals instead of hard-coded delays.
- `src/dry-run.ts` uses the raw configured seed while live multi-device runtime derives per-device seeds from IMEI. This is acceptable for current task scope because TASK-022 requires deterministic dry-run output, not dry-run/live parity for multiple IMEIs, but it should not be silently tightened into a new requirement here.

## Open Questions

- The implementation should confirm whether the existing packet-validation assertions can be imported directly from current tests or need a tiny shared helper extraction. Any extraction should stay minimal and test-only; no production-code changes are justified by this task.
