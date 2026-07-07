---
id: TASK-004
title: Add Simulator Runtime Manager And Control Endpoints
initial_status: blocked
depends_on:
  - TASK-001
  - TASK-002
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-004: Add Simulator Runtime Manager And Control Endpoints

## Goal

Add a dashboard runtime manager that starts and stops simulator sessions per
IMEI and exposes control endpoints for single-device and multi-device runs.

## Scope

- Build a runtime orchestration service above the existing simulator core.
- Reuse current multi-device, live-session, handshake, packet-send, and
  reconnect behavior instead of reimplementing protocol logic in NestJS.
- Expose start/stop actions for one device and for selected or enabled device
  groups.
- Prevent duplicate active runs for the same IMEI.
- Surface explicit run outcomes such as stopped, rejected, and failed.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- src/live-session.ts
- src/multi-device-runtime.ts
- src/imei-handshake.ts
- src/avl-session.ts
- src/dashboard/domain.ts
- src/dashboard/repositories/
- tests/live-session.test.ts
- tests/multi-device-runtime.test.ts

### Expected to Create or Modify

- src/dashboard/runtime/
- src/dashboard/app.module.ts
- tests/

## Acceptance Criteria

- A dashboard control endpoint can start one configured device.
- A dashboard control endpoint can start at least two configured devices
  concurrently.
- A dashboard control endpoint can stop a running device cleanly.
- Active sessions remain keyed by IMEI and do not duplicate per device.
- Parser-visible behavior still flows through the existing simulator core.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Browser UI controls.
- Log-query APIs.
- Downstream telemetry-host forwarding.
