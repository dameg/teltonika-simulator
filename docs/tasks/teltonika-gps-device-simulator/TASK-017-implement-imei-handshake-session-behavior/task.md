---
id: TASK-017
title: Implement IMEI Handshake Session Behavior
initial_status: blocked
depends_on:
  - TASK-002
  - TASK-016
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-017: Implement IMEI Handshake Session Behavior

## Goal

Connect one device session and complete Teltonika IMEI identification.

## Scope

- Use Node.js built-in `net` to open an outbound TCP connection.
- Send two-byte IMEI length followed by ASCII IMEI.
- Read one-byte IMEI acknowledgement.
- Treat `0x01` as accepted.
- Treat `0x00` as rejected and stop that device session without reconnecting.
- Report unexpected acknowledgement bytes as protocol errors.

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

- Local parser fixture receives exact IMEI handshake bytes.
- Accepted IMEI returns an accepted session result.
- Rejected IMEI stops the session and does not reconnect.
- No AVL packet is sent before IMEI acceptance.
- Tests assert behavior through the parser fixture.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- AVL packet sending.
- Reconnectable runner.
- Multiple devices.
