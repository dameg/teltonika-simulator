# TASK-004 Plan

Status: READY

## Current Repository Findings

- The repository has only the root `AGENTS.md`; there are no nested instruction overrides under `src/`, `tests/`, or this task directory.
- `src/dashboard-backend.ts` already implements the production parser-visible surface this task needs: it accepts IMEI and AVL traffic, decodes valid Codec 8 Extended packets, retains decode errors for malformed packets, serves `GET /messages`, and serves the dashboard HTML at `GET /`.
- `tests/dashboard-backend.test.ts` already proves several backend behaviors, including HTML shell delivery, accepted and rejected IMEI handshakes, valid simulator traffic retained through `/messages`, and malformed AVL packets exposed as decode errors.
- `tests/end-to-end-parser-visible.test.ts` currently drives simulator traffic only into `tests/fixtures/teltonika-parser-fixture.ts`. It verifies parser-visible simulator coverage, but not the real dashboard parser endpoint or the web-facing dashboard interface.
- `tests/teltonika-parser-fixture.test.ts` and `tests/fixtures/teltonika-parser-fixture.ts` already provide reusable low-level TCP test patterns for direct socket writes, fragmented frames, and handshake control. They should be reused rather than duplicated.
- `src/index.ts` and `package.json` already expose the dashboard startup path through the existing CLI entrypoint (`npm run cli -- dashboard ...`), and `src/index.ts` prints both the Teltonika TCP listener and dashboard URL on startup.
- The task scope is therefore narrower than earlier dashboard tasks: most likely only tests need to change, with production code touched only if one small helper/export is required to observe startup behavior without brittle process parsing.

## Files To Create Or Modify

- Modify `tests/end-to-end-parser-visible.test.ts`
- Modify `tests/dashboard-backend.test.ts`
- Optionally modify `tests/fixtures/teltonika-parser-fixture.ts` only if one tiny reusable wait/helper removes duplicated socket polling in the new tests
- Optionally modify `src/index.ts` or another small `src/` helper only if the startup smoke coverage cannot be added cleanly from the exported backend surface

## Ordered Implementation Steps

1. Re-target parser-visible integration coverage from the fixture-only server to the real dashboard backend.
   - Start `startDashboardBackend(...)` in-process inside `tests/end-to-end-parser-visible.test.ts`.
   - Send simulator traffic to `backend.tcpAddress` with `runLiveSession(...)` so the test exercises the same TCP endpoint developers use locally.
   - Assert through the web-facing interface (`GET /messages`) that the resulting messages include raw lowercase hex and decoded JSON for at least one valid packet.

2. Add malformed-packet parser-visible coverage against the real dashboard backend.
   - Reuse direct socket writes and existing handshake helpers to connect to the dashboard TCP listener.
   - Send one malformed or unsupported AVL packet after a successful IMEI handshake.
   - Assert via `GET /messages` that the dashboard surfaces a retained decode error entry rather than silently dropping the frame or acknowledging success.

3. Add a dashboard smoke test for local reachability.
   - Start the dashboard backend and verify both the TCP listener and the HTTP URL are reachable.
   - Use a lightweight HTTP fetch against `GET /` or `GET /messages` rather than browser automation.
   - Keep the smoke test focused on reachability and response shape, not UI rendering details already covered in existing backend tests.

4. Cover the startup path enough to prove the local launch surface is usable.
   - Prefer testing the existing exported startup/backend surface directly.
   - Only if needed, add a minimal CLI-level assertion path that verifies dashboard startup exposes a reachable TCP port and web URL without introducing brittle long-running subprocess management.
   - Avoid expanding into a second launcher, new scripts, or process orchestration beyond this task.

5. Keep the diff scoped to observable integration behavior.
   - Build on `tests/dashboard-backend.test.ts` instead of creating a new framework or fixture layer.
   - Do not duplicate packet parsing logic in tests; consume the existing dashboard HTTP interface and existing simulator/handshake helpers.

## Validation And Error-Handling Strategy

- Treat `GET /messages` as the single source of truth for parser-visible assertions. The tests should verify the real dashboard interface, not internal arrays or copied decode logic.
- For valid coverage, assert on observable fields already exposed by the dashboard message model: `type`, `sessionId`, `imei`, `rawHex`, and decoded packet content.
- For malformed coverage, assert that the dashboard emits an `error` message with retained raw hex and structured decoder error details, and that no success acknowledgement is inferred.
- Keep simulation logic independent from dashboard transport logic by continuing to use `runLiveSession(...)` as the client and `startDashboardBackend(...)` as the server.
- Avoid brittle timing assumptions: wait for messages to appear through existing polling helpers or small reusable waits before asserting HTTP payloads.

## Tests To Add Or Update

- Update `tests/end-to-end-parser-visible.test.ts` to cover:
  - simulator traffic sent to the real dashboard backend TCP port
  - web-facing message visibility for a valid packet, including raw hex and decoded JSON
  - web-facing message visibility for a malformed or unsupported packet, including decode error output
- Update `tests/dashboard-backend.test.ts` to cover:
  - one focused HTTP smoke/reachability assertion for the dashboard page shell or message API
  - startup-path reachability of the local TCP listener and web URL if that is not already sufficiently proven by the re-targeted integration test
- Reuse existing helpers from:
  - `runLiveSession(...)`
  - `encodeImeiHandshakeFrame(...)`
  - direct socket utilities already present in dashboard/parser fixture tests

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main risk is accidentally asserting against backend internals instead of the task-required web-facing interface, which would miss the purpose of parser-visible coverage.
- Another risk is adding redundant test infrastructure when the repository already has enough simulator, socket, and dashboard helpers.
- Startup smoke coverage can become flaky if it depends on long-running CLI process parsing rather than the existing exported backend surface.
- Malformed-packet assertions must ensure the packet is malformed enough to produce a retained decode error, but still framed well enough to reach dashboard decode handling.

## Unresolved Blockers

- None.
- Planning assumption: the existing exported dashboard backend surface is sufficient for startup smoke coverage; a CLI-process assertion should only be added if direct backend startup cannot prove the required reachability.
