---
id: TASK-021
title: Add Multi-Device Runtime
initial_status: blocked
depends_on:
  - TASK-020
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-021: Add Multi-Device Runtime

## Goal

Run one independent reconnectable device runner and TCP session per configured IMEI.

## Scope

- Start one runner per IMEI.
- Keep runner failures isolated.
- Ensure each device has independent TCP session state.
- Provide deterministic per-device simulation inputs from shared route/style/seed configuration.
- Stop all runners cleanly.

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

- At least two IMEIs run concurrently.
- Parser fixture receives distinct handshakes and AVL packets per IMEI.
- One rejected or failed IMEI does not hide successful sessions.
- Each IMEI owns an independent TCP session.
- Stop shuts down every runner cleanly.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Fleet management backend behavior.
- Device commands.
