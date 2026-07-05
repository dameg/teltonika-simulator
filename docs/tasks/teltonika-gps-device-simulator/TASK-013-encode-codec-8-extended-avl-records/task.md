---
id: TASK-013
title: Encode Codec 8 Extended AVL Records
initial_status: completed
depends_on:
  - TASK-011
  - TASK-012
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-013: Encode Codec 8 Extended AVL Records

## Goal

Encode AVL records into Codec 8 Extended record bytes.

## Scope

- Encode timestamp, priority, longitude, latitude, altitude, angle, satellites, speed, event IO ID, and total IO count.
- Encode 1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO groups with Codec 8 Extended 2-byte IDs/counts where applicable.
- Use Node.js `Buffer` APIs.
- Preserve AVL domain independence from binary serialization by keeping encoding in the Codec layer.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaProtocolDecoder.java
- references/traccar/TeltonikaProtocolDecoderTest.java
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- Encoded field order matches Codec 8 Extended decoding evidence in Traccar.
- Longitude and latitude are encoded as signed 32-bit integers.
- Event IO ID and total IO count are encoded correctly.
- Tests cover records with basic IO and X-byte IO.
- Codec encoder does not import route, driving-style, simulation, or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- TCP packet framing.
- IMEI handshake.
- Runtime send loop.
