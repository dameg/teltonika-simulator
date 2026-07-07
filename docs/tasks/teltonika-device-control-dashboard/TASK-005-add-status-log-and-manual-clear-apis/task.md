---
id: TASK-005
title: Add Status Log And Manual Clear APIs
initial_status: blocked
depends_on:
  - TASK-002
  - TASK-003
  - TASK-004
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-005: Add Status Log And Manual Clear APIs

## Goal

Expose dashboard APIs for device status, aggregate run views, structured logs,
and manual clearing of in-memory state.

## Scope

- Add query endpoints for:
  - device status list;
  - device detail status;
  - aggregate run counts;
  - per-device logs;
  - recent global events.
- Capture and persist structured runtime events in the in-memory repositories.
- Add manual clear endpoints for logs and dashboard-owned in-memory state.
- Keep polling-friendly responses simple and deterministic.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- src/dashboard/domain.ts
- src/dashboard/repositories/
- src/dashboard/runtime/
- docs/tasks/teltonika-device-control-dashboard/TASK-003-add-device-management-api-and-bulk-imei-import/task.md
- docs/tasks/teltonika-device-control-dashboard/TASK-004-add-simulator-runtime-manager-and-control-endpoints/task.md

### Expected to Create or Modify

- src/dashboard/status/
- src/dashboard/logging/
- src/dashboard/app.module.ts
- tests/

## Acceptance Criteria

- Dashboard APIs expose per-device status, aggregate counts, and structured
  logs.
- Runtime events such as start, connect, accept/reject, packet send,
  acknowledgement, reconnect, stop, and failure are captured.
- Manual clear actions remove in-memory logs or dashboard state as defined by
  the PRD.
- API responses are suitable for polling without server push.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- React presentation.
- WebSocket or Server-Sent Events.
- Historical persistence beyond the current process.
