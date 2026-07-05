# TASK-016 Plan

Status: READY

## Current Repository Findings

- The repository currently has Codec 8 Extended packet framing in [src/codec8-extended.ts](/Users/dameg/dev/private/teltonika-simulator/src/codec8-extended.ts:1) and CRC coverage in [tests/codec-crc.test.ts](/Users/dameg/dev/private/teltonika-simulator/tests/codec-crc.test.ts:1), but no TCP runtime or parser fixture yet.
- The public entrypoint in [src/index.ts](/Users/dameg/dev/private/teltonika-simulator/src/index.ts:1) still rejects live TCP mode, so this task should stay focused on reusable test infrastructure and not introduce production session behavior early.
- Vitest currently runs `tests/**/*.test.ts` via [vitest.config.ts](/Users/dameg/dev/private/teltonika-simulator/vitest.config.ts:1), and `tsconfig.json` already includes both `src` and `tests`, so a reusable helper can live in `tests/` without extra tooling changes.
- The Traccar framing reference shows two parser-visible inbound shapes the fixture must handle: IMEI frames use a 2-byte length prefix, while AVL packets use a zero preamble plus a 4-byte data length and total frame length of `dataLength + 12`.
- No nested `AGENTS.md` files exist under `src/`, `tests/`, or this task directory; the repository-root instructions apply.

## Files To Create Or Modify

- Create `tests/fixtures/teltonika-parser-fixture.ts`
- Create `tests/teltonika-parser-fixture.test.ts`

## Ordered Implementation Steps

1. Add a reusable test-local Teltonika parser fixture in `tests/fixtures/teltonika-parser-fixture.ts` using Node's built-in `net` server.
2. Define the smallest fixture API needed by later TCP-session tasks:
   - start listening on an ephemeral local port;
   - expose host and port for clients;
   - record accepted client sockets;
   - record raw IMEI frames and parsed IMEI strings;
   - record raw AVL frames;
   - allow configurable IMEI response byte (`0x01` or `0x00`);
   - allow configurable 4-byte accepted-record acknowledgement values;
   - support explicit server-side socket close and full fixture shutdown.
3. Implement parser-visible frame accumulation on each socket:
   - buffer incoming bytes across `data` events;
   - parse IMEI frames first from a 2-byte length prefix plus ASCII payload;
   - parse AVL frames from zero preamble, 4-byte data length, and total frame size `12 + dataLength`;
   - leave incomplete frames buffered until more bytes arrive;
   - preserve raw frame bytes exactly as received.
4. Keep the fixture intentionally narrow:
   - no full AVL record decoding;
   - no reuse of private production helpers;
   - no production imports unless a public encoder is only used in tests to assemble valid packet bytes.
5. Add Vitest coverage in `tests/teltonika-parser-fixture.test.ts` for:
   - accepting a TCP client and recording the exact IMEI frame and parsed IMEI;
   - sending configurable IMEI accept and reject bytes;
   - recording an exact AVL frame using Teltonika length framing;
   - sending a configurable 4-byte AVL acknowledgement count;
   - handling frame fragmentation across multiple writes;
   - closing a server-side socket so later reconnect tests can reuse the fixture.
6. Keep tests at the socket boundary by using a real local `net.Socket` client and raw `Buffer` writes, not direct calls into fixture internals beyond setup/control methods.

## Validation And Error-Handling Strategy

- Reject malformed IMEI lengths or malformed AVL headers with explicit test-helper errors so later session tests fail clearly instead of hanging.
- Do not parse partial frames eagerly; keep unread bytes buffered until a whole parser-visible frame is available.
- Only auto-respond after a full IMEI or AVL frame is captured, preventing acknowledgements from being emitted on partial input.
- Ensure fixture teardown closes all open sockets and the listening server so Vitest does not leak handles.

## Tests To Add Or Update

- Add `tests/teltonika-parser-fixture.test.ts` as the primary coverage for fixture behavior.
- Use raw IMEI bytes assembled as `uint16 length + ASCII IMEI`.
- Use either a raw known AVL packet fixture or the public `encodeCodec8ExtendedPacket` export to create a valid parser-visible AVL frame for socket tests.
- Include at least one fragmentation test that splits an IMEI or AVL frame across multiple `socket.write` calls.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main implementation risk is incorrect stream buffering: a fixture that assumes one frame per `data` event will break later reconnect and session tests.
- Another risk is overbuilding into a fake parser implementation. This task only needs frame capture and configurable acknowledgements, not AVL semantic decoding.
- If acknowledgement timing is coupled too tightly to first-write assumptions, later tests that intentionally fragment frames may become flaky.

## Unresolved Blockers

- None.
