---
id: TASK-003
title: Add Device Management API And Bulk IMEI Import
initial_status: blocked
depends_on:
  - TASK-001
  - TASK-002
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-003: Add Device Management API And Bulk IMEI Import

## Goal

Expose dashboard APIs for creating, listing, updating, deleting, and bulk
importing per-device simulator configuration records.

## Scope

- Add NestJS controllers and services for device CRUD.
- Support bulk IMEI import from pasted newline-separated or comma-separated
  input.
- Validate IMEIs and reject duplicates consistently through the shared domain
  rules from TASK-002.
- Enforce that running devices cannot be edited or deleted when the PRD says
  those actions must be blocked.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- docs/tasks/teltonika-device-control-dashboard/TASK-002-define-dashboard-domain-models-and-in-memory-repositories/task.md
- src/dashboard/domain.ts
- src/dashboard/repositories/

### Expected to Create or Modify

- src/dashboard/device-management/
- src/dashboard/app.module.ts
- tests/

## Acceptance Criteria

- A dashboard API can create a device with per-device simulator settings.
- A dashboard API can bulk import multiple IMEIs from pasted text.
- Invalid or duplicate IMEIs fail clearly.
- Device update and delete flows respect the not-while-running restriction.
- Tests cover single-device CRUD and bulk import behavior.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Starting or stopping simulator sessions.
- Runtime status polling.
- Browser UI implementation.
