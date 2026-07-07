---
id: TASK-006
title: Build React Dashboard For Device Setup And Runtime Monitoring
initial_status: blocked
depends_on:
  - TASK-001
  - TASK-003
  - TASK-004
  - TASK-005
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-006: Build React Dashboard For Device Setup And Runtime Monitoring

## Goal

Build the React dashboard UI for device setup, manual run toggles, status
monitoring, log inspection, and polling-based refresh.

## Scope

- Implement the device list, create/edit form, device detail, and run overview
  views.
- Wire the UI to the dashboard APIs from TASK-003 through TASK-005.
- Add polling for status and log refresh without full page reload.
- Add manual toggle controls for start/stop and manual clear controls for
  in-memory logs or runtime state.
- Keep the frontend desktop-usable first and avoid broader analytics or map
  features.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- src/dashboard/device-management/
- src/dashboard/runtime/
- src/dashboard/status/
- src/dashboard/logging/

### Expected to Create or Modify

- src/dashboard/frontend/
- src/dashboard/app.module.ts
- tests/

## Acceptance Criteria

- A user can create and bulk import devices from the React UI.
- A user can start and stop device runs from the React UI.
- The UI shows per-device status, aggregate counts, and logs.
- Status and logs refresh through polling.
- The UI exposes manual clear actions for in-memory dashboard state.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Auth and multi-user access.
- Real-time map playback or analytics.
- Telemetry forwarding to another host.
