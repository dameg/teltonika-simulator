---
id: TASK-001
title: Add Reusable Codec 8 Extended Decoder And Error Model
initial_status: ready
depends_on: []
source_prd: docs/teltonika-raw-decoded-dashboard-prd.md
workflow_version: 2
---

# TASK-001: Add Reusable Codec 8 Extended Decoder And Error Model

## Goal

Create a reusable Codec 8 Extended decoder that turns raw Teltonika AVL packet
bytes into typed domain data and structured errors.

## Scope

- Decode the Codec 8 Extended TCP packet layout already produced by the
  simulator.
- Validate zero preamble, packet length, codec ID `0x8E`, matching record
  counts, and CRC-16/IBM.
- Decode timestamp, priority, GPS element, event IO ID, total IO count, and
  1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO groups.
- Return deterministic decoded data that can be projected to JSON later.
- Produce explicit structured errors for malformed or unsupported packets.
- Keep the decoder independent from TCP sockets and dashboard rendering.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-raw-decoded-dashboard-prd.md
- src/codec8-extended.ts
- src/codec-crc.ts
- src/domain.ts
- tests/codec8-extended.test.ts
- tests/fixtures/assert-codec8-extended-packet.ts
- references/traccar/README.md
- references/traccar/TeltonikaProtocolDecoder.java

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- Valid Codec 8 Extended packets decode into typed records without relying on
  the encoder implementation itself.
- Malformed or unsupported packets return actionable structured errors.
- Decoder coverage includes packet framing, record counts, CRC validation, GPS
  fields, and IO groups.
- The decoder module does not import `net`, the dashboard UI, or session code.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- TCP parsing and acknowledgement handling.
- Browser UI and message rendering.
- Runtime orchestration.
