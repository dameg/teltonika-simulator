---
id: TASK-015
title: Add Dry-Run Deterministic Hex Dump Mode
initial_status: blocked
depends_on:
  - TASK-002
  - TASK-011
  - TASK-014
  - TASK-024
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-015: Add Dry-Run Deterministic Hex Dump Mode

## Goal

Generate deterministic packet hex from simulation without opening a TCP socket.

## Scope

- Wire CLI dry-run mode to route loading, vehicle simulation, device-profile mapping, and packet framing.
- Print packet hex lines to stdout.
- Keep logs/context on stderr.
- Support deterministic packet count.
- Ensure no TCP connection is opened in dry-run mode.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- src/
- tests/
- tests/fixtures/

### Expected to Create or Modify

- src/
- tests/
- tests/fixtures/

## Acceptance Criteria

- Same route, driving style, seed, interval, and count produce identical hex output.
- Different driving styles produce different dry-run packet sequences for the same route and seed.
- Dry-run packets are valid Codec 8 Extended framed packets.
- Dry-run mode does not import or invoke production TCP session startup.

## Verification

```bash
npm run build
npm run typecheck
npm test
npm run cli -- --dry-run --host 127.0.0.1 --port 5027 --imei 123456789012345 --count 2
```

## Out of Scope

- Live TCP parser communication.
- Reconnect behavior.
