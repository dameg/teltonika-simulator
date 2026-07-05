---
id: TASK-018
title: Send AVL Packets And Validate Accepted-Record Acknowledgements
initial_status: blocked
depends_on:
  - TASK-014
  - TASK-017
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-018: Send AVL Packets And Validate Accepted-Record Acknowledgements

## Goal

Send framed AVL packets after IMEI acceptance and validate parser acknowledgement counts.

## Scope

- Send one framed Codec 8 Extended AVL packet on an accepted session.
- Read a 4-byte accepted-record count.
- Treat matching count as success.
- Treat mismatched count as explicit session failure.
- Keep session logic independent from telemetry generation.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaProtocolDecoder.java
- references/traccar/TeltonikaFrameDecoder.java
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- Parser fixture receives a valid Codec 8 Extended AVL packet after acceptance.
- Simulator reads the 4-byte acknowledgement count.
- Matching acknowledgement count succeeds.
- Mismatched acknowledgement count fails clearly and does not silently retry.
- Tests assert parser-visible packet bytes and acknowledgement behavior.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Vehicle simulation runtime loop.
- Reconnect behavior.
- Multiple devices.
