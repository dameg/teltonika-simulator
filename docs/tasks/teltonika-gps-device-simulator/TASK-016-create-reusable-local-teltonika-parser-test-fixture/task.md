---
id: TASK-016
title: Create Reusable Local Teltonika Parser Test Fixture
initial_status: ready
depends_on:
  - TASK-014
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-016: Create Reusable Local Teltonika Parser Test Fixture

## Goal

Provide a reusable local TCP parser fixture for parser-visible networking tests.

## Scope

- Build a Vitest fixture using Node.js built-in `net`.
- Accept TCP client connections.
- Parse and record IMEI handshake frames.
- Parse and record AVL packet frames using Teltonika length framing.
- Send configurable IMEI accept/reject bytes.
- Send configurable 4-byte accepted-record acknowledgements.
- Support server-side socket close for reconnect tests.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaFrameDecoder.java
- references/traccar/TeltonikaProtocolDecoder.java
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- Fixture records raw IMEI and AVL frames.
- Fixture can accept or reject IMEIs.
- Fixture can acknowledge a chosen AVL record count.
- Fixture can close sockets to simulate parser restart.
- Fixture tests use parser-visible bytes, not private production helpers.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Production TCP client implementation.
- Full Traccar server emulation.
