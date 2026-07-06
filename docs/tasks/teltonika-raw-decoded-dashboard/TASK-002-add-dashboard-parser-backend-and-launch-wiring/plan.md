# TASK-002 Plan

Status: READY

## Current Repository Findings

- `TASK-001` is complete and reviewed `PASS`; `src/index.ts` already re-exports `decodeCodec8ExtendedPacket`, so this task can consume the decoder without touching protocol internals.
- No nested `AGENTS.md` files apply under `src/`, `tests/`, or this task directory. The repository-root `AGENTS.md` is the governing instruction set.
- `src/index.ts` and `src/config.ts` currently implement a simulator-only CLI flow: parse simulator config, choose dry-run vs live runtime, and wire termination hooks for long-running sessions.
- `src/imei-handshake.ts`, `src/avl-session.ts`, and `src/live-session.ts` already encode the client-side Teltonika TCP behavior correctly. They are relevant as protocol references and as test clients, but the dashboard backend should stay separate from simulator runtime logic.
- `tests/fixtures/teltonika-parser-fixture.ts` already proves the server-side framing behavior needed here: per-connection IDs, IMEI capture, fragmented AVL frame assembly, configurable IMEI response bytes, and 4-byte AVL acknowledgement writes.
- `docs/teltonika-raw-decoded-dashboard-prd.md` and `TRACEABILITY.md` split responsibilities across tasks: `TASK-002` owns the parser endpoint, startup wiring, and backend data surface; `TASK-003` owns browser rendering; `TASK-004` owns parser-visible end-to-end and smoke coverage.
- `package.json` only exposes `build`, `typecheck`, `test`, and `cli`. There is no separate dashboard launcher yet, so this task must add launch wiring without changing runtime task state or adding extra tooling.
- `docs/tasks/teltonika-raw-decoded-dashboard/manifest.json` has a pre-existing worktree modification and must remain untouched.

## Files To Create Or Modify

- Create `src/dashboard-backend.ts`
- Modify `src/config.ts`
- Modify `src/index.ts`
- Create `tests/dashboard-backend.test.ts`
- Modify `tests/imei-handshake.test.ts`, `tests/avl-session.test.ts`, or `tests/live-session.test.ts` only if a tiny assertion update is needed to keep shared behavior aligned

## Ordered Implementation Steps

1. Extend CLI/config parsing to support dashboard startup without breaking the simulator flow.
   - Add the smallest explicit launch switch on the existing entrypoint, preferably a `dashboard` mode/subcommand on `src/index.ts` rather than a second binary.
   - Add backend-specific config fields for TCP port, web port, and IMEI acceptance behavior, defaulting to local startup and IMEI accept.
   - Keep simulator config parsing intact so existing `npm run cli -- ...` behavior remains backward compatible.

2. Add a production parser/backend module in `src/dashboard-backend.ts`.
   - Create a TCP server with per-connection state: connection ID, accumulated socket buffer, and IMEI when known.
   - Parse IMEI frames before AVL traffic, write a one-byte acknowledgement response, and close rejected sessions cleanly.
   - Parse complete AVL frames from fragmented TCP chunks using the same framing rules already exercised by the parser fixture.
   - Feed valid AVL packet bytes into `decodeCodec8ExtendedPacket` and acknowledge valid packets with the decoded record count only.

3. Add in-memory message retention and a thin backend-facing data surface for the later browser task.
   - Record message entries with session ID, IMEI where known, receive timestamp, message type, and raw lowercase hex.
   - For valid AVL packets, attach decoded JSON-ready data from the decoder result.
   - For malformed or unsupported packets, record actionable decode error data instead of silently dropping the frame.
   - Keep storage process-local and in-memory only; do not add persistence or export.

4. Expose a minimal local web surface and startup reporting from the backend module.
   - Start a small HTTP server with Node built-ins.
   - Expose a machine-readable message endpoint for `TASK-003`, such as a JSON route returning current retained messages.
   - Return a simple placeholder response at `/` if needed so the printed web URL is real before the browser dashboard is implemented.
   - Print the listening TCP address and local web URL on startup.

5. Wire the new backend mode into `src/index.ts`.
   - Branch cleanly between simulator mode and dashboard mode.
   - Reuse the existing termination-hook pattern so the dashboard shuts down cleanly on `SIGINT`/`SIGTERM`.
   - Avoid mixing dashboard parser state into `runMultiDeviceRuntime`, `runLiveSession`, or other simulator modules.

6. Add focused tests for observable backend behavior.
   - Start the dashboard backend in-process, then use `runLiveSession` against its TCP port to prove the simulator can target it.
   - Assert IMEI handshakes are accepted by default and rejected when configured to reject.
   - Assert fragmented valid AVL packets are decoded, retained in memory, and acknowledged with the decoded record count.
   - Assert the HTTP-facing message surface exposes the retained backend data needed by `TASK-003`.

## Validation And Error-Handling Strategy

- Treat parser/backend code as transport infrastructure, separate from browser rendering and separate from simulator runtime.
- Maintain explicit per-socket state so IMEI parsing and AVL parsing cannot interleave incorrectly across clients.
- Buffer TCP data until a whole frame is available; never decode partial AVL data and never acknowledge an incomplete frame.
- On valid AVL decode, acknowledge with the decoder's record count and retain the raw plus decoded message entry.
- On invalid or unsupported AVL decode, retain an error message entry with raw hex and structured decoder error details, and do not send a success acknowledgement.
- On rejected IMEI handshakes, send the rejection byte, do not treat later bytes as AVL traffic, and close the session promptly.
- Keep the HTTP layer thin: serialize already-retained message data, not binary parsing logic.

## Tests To Add Or Update

- Add `tests/dashboard-backend.test.ts` covering:
  - startup returns usable TCP and web listeners
  - default IMEI acceptance
  - configurable IMEI rejection
  - fragmented AVL frame handling with valid acknowledgement count
  - retained raw message metadata and decoded payload exposure
  - retained decode-error exposure for malformed packets
- Reuse existing simulator/client helpers where possible:
  - `runLiveSession` for valid simulator traffic
  - `encodeImeiHandshakeFrame` and raw socket writes for targeted malformed-frame cases if that is smaller than driving the full runtime
- Keep existing decoder tests unchanged unless a tiny shared assertion is needed; this task should not reopen `TASK-001` scope.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main correctness risk is duplicating the parser fixture's framing logic incorrectly in production code, especially around partial TCP chunks and multi-frame buffers.
- Another risk is coupling the HTTP surface too tightly to the eventual UI, which would blur the `TASK-002`/`TASK-003` boundary and expand scope.
- IMEI rejection handling can easily leave sockets half-open or accidentally process buffered AVL bytes after rejection if connection shutdown is not explicit.
- Acknowledging malformed AVL packets would hide parser failures from clients and violate the acceptance criteria; tests need to make that impossible.
- If launch wiring is bolted onto the simulator CLI without an explicit mode boundary, it becomes easy to regress the existing simulator startup path.

## Unresolved Blockers

- None.
- Planning assumption: the dashboard launcher will be added to the existing CLI entrypoint as an explicit dashboard mode/subcommand. A separate package command is not required by `task.md` and would be unnecessary scope for this task.
