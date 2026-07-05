---
id: TASK-019
title: Add Repeated Send Loop And Clean Shutdown
initial_status: blocked
depends_on:
  - TASK-011
  - TASK-018
  - TASK-024
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-019: Add Repeated Send Loop And Clean Shutdown

## Goal

Run one accepted device session that emits simulation-derived AVL packets repeatedly until stopped.

## Scope

- Connect route simulation output to device-profile mapping and packet framing.
- Send one AVL record per packet by default.
- Honor configured send interval.
- Advance simulation deterministically per interval.
- Log connection lifecycle, IMEI accept/reject, packet send result, and acknowledgement count.
- Stop cleanly on abort signal or process termination hook.

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

- Parser fixture receives multiple AVL packets over time.
- Same route, style, seed, and interval produce the same sent packet sequence.
- Send interval controls simulation advancement and packet emission.
- Clean shutdown closes the TCP session.
- TCP session code does not generate telemetry directly; it consumes mapped packet inputs.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Reconnect after disconnect.
- Multiple-device supervision.
