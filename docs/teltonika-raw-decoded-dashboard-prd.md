# PRD: Teltonika Raw And Decoded Message Dashboard

## Problem Statement

Developers testing Teltonika integrations need a local way to inspect exactly
what a simulated or real Teltonika device sent and compare it with the decoded
message shape a backend parser would use. The current simulator can generate
and send Codec 8 Extended binary packets, and its test parser fixture can
record raw IMEI and AVL frames, but the application does not currently expose a
reusable production decoder that converts AVL packets into JSON.

## Solution

Build a local web dashboard that listens for Teltonika TCP device traffic,
records raw messages, decodes supported messages into JSON, and displays both
views side by side.

The first version should stay narrow: Codec 8 Extended over TCP, IMEI
handshake frames, AVL packet frames, acknowledgement behavior, raw hex, and a
decoded JSON representation of packet metadata and AVL records.

## Goals

- Capture raw Teltonika TCP messages received by a local parser endpoint.
- Display raw message bytes as lowercase hex.
- Decode supported Teltonika messages into JSON.
- Show raw and decoded views together for each received message.
- Reuse existing protocol knowledge: IMEI frame handling, Codec 8 Extended
  framing, CRC-16/IBM, and AVL domain shapes.
- Keep packet decoding separate from the web dashboard and TCP server.
- Provide a small local UI suitable for simulator debugging and parser
  development.

## Non-Goals

- Production fleet management.
- Authentication, multi-user accounts, or persistence beyond the local run.
- UDP support in the first version.
- Codecs other than Codec 8 Extended in the first version.
- Maps, charts, geofencing, alerts, reports, or device command sending.
- Replacing the simulator CLI.

## Current Repository Fit

- Feasible in the current setup.
- Existing encoder: `src/codec8-extended.ts` creates valid Codec 8 Extended TCP
  AVL packets.
- Existing CRC: `src/codec-crc.ts` validates the CRC-16/IBM protocol field.
- Existing domain model: `src/domain.ts` defines AVL GPS and IO record shapes.
- Existing parser fixture: `tests/fixtures/teltonika-parser-fixture.ts`
  accepts TCP connections, parses IMEI frames, records raw AVL frames, and
  sends AVL acknowledgements.
- Missing before the dashboard: a reusable Codec 8 Extended decoder that turns
  raw packet bytes into JSON/domain records.

## User Stories

1. As a parser developer, I want to see the raw Teltonika message hex, so that
   I can debug protocol framing issues.
2. As a parser developer, I want to see decoded JSON next to the raw message,
   so that I can verify GPS, IO, record count, and CRC handling.
3. As a simulator user, I want to point simulated devices at the dashboard
   parser endpoint, so that I can inspect generated traffic without another
   backend.
4. As a QA engineer, I want malformed frames to show decoding errors, so that
   protocol failures are visible instead of silently dropped.
5. As a developer, I want the decoded output to be deterministic JSON, so that
   it can be copied into tests or bug reports.

## Functional Requirements

- TCP parser endpoint:
  - Accept Teltonika TCP client connections.
  - Parse IMEI handshake frames.
  - Respond with configurable IMEI acceptance, defaulting to accept.
  - Parse complete AVL packet frames from fragmented TCP chunks.
  - Acknowledge AVL packets with the decoded record count when valid.
- Codec 8 Extended decoder:
  - Validate zero preamble and data length.
  - Validate Codec ID `0x8E`.
  - Validate first and repeated record counts match.
  - Validate CRC-16/IBM over the data field.
  - Decode timestamp, priority, GPS element, event IO ID, total IO count, and
    1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO groups.
  - Return explicit structured errors for malformed or unsupported packets.
- Dashboard:
  - Show connection/session identifier and IMEI where known.
  - Show message type: `imei`, `avl`, or `error`.
  - Show receive timestamp.
  - Show raw frame hex.
  - Show decoded JSON.
  - Keep the most recent messages in memory for the current process.
  - Provide a clear empty state and decoding-error state.

## Architecture Boundaries

- TCP parsing belongs in a parser server module.
- Codec 8 Extended decoding belongs in a protocol decoder module.
- JSON serialization should be a thin projection of decoded protocol/domain
  data.
- The dashboard should consume parser events and must not implement binary
  parsing itself.
- The simulator should remain able to run without the dashboard.

## Implementation Decisions

- Use Node.js built-ins for the first parser/dashboard backend where possible.
- Avoid adding a large web framework unless routing and static file serving
  become non-trivial.
- Start with in-memory message storage only.
- Prefer a simple local browser UI over a full SPA build pipeline unless the
  task explicitly requires richer frontend tooling.
- Reuse existing test fixtures and known packet fixtures instead of creating a
  second protocol implementation in tests.

## Testing Decisions

- Add decoder tests using existing encoder output and at least one known packet
  fixture independent of the decoder.
- Add malformed packet tests for bad preamble, bad length, unsupported codec,
  mismatched record counts, and bad CRC.
- Add parser-visible integration tests that send simulator traffic to the
  dashboard parser endpoint and assert raw hex plus decoded JSON are emitted.
- Add a minimal dashboard rendering test or HTTP smoke test for the message API
  and static UI.

## Acceptance Criteria

- A user can start the dashboard locally and see the listening TCP port and web
  URL.
- A simulator run can target the dashboard TCP port.
- The dashboard shows each IMEI and AVL frame with raw hex.
- Valid Codec 8 Extended AVL packets show decoded JSON records.
- Invalid or unsupported packets show actionable decode errors.
- Decoder tests cover valid and malformed packets.
- Parser/dashboard tests prove raw and decoded messages are visible through the
  web-facing interface.

## Open Questions

- Should dashboard startup be a new CLI mode on this package or a separate
  command?
- Should messages be kept only in memory, or should local JSONL export be part
  of a later task?
- Should the first UI use server-rendered HTML plus polling, or a small client
  script with Server-Sent Events?
