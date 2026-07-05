---
id: TASK-014
title: Frame Codec 8 Extended TCP AVL Packets
initial_status: completed
depends_on:
  - TASK-013
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-014: Frame Codec 8 Extended TCP AVL Packets

## Goal

Wrap one or more Codec 8 Extended AVL records in Teltonika TCP AVL packet framing.

## Scope

- Add 4-byte zero preamble.
- Add 4-byte data field length.
- Add Codec ID `0x8E`.
- Add record count, encoded records, repeated record count, and 4-byte CRC field.
- Support one or more records per packet.
- Keep one record per packet as the runtime default outside the encoder.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaFrameDecoder.java
- references/traccar/TeltonikaProtocolDecoder.java
- references/traccar/TeltonikaProtocolDecoderTest.java
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- Packet starts with a 4-byte zero preamble.
- Data field length equals actual data field byte count.
- Codec ID is `0x8E`.
- First and repeated record count fields match.
- CRC validates over only the data field.
- Tests cover one-record and multi-record packets.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- TCP sessions.
- Dry-run CLI.
- Codecs other than Codec 8 Extended.
