---
id: TASK-002
title: Define Dashboard Domain Models And In-Memory Repositories
initial_status: blocked
depends_on:
  - TASK-001
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-002: Define Dashboard Domain Models And In-Memory Repositories

## Goal

Define the dashboard-side device, run-state, and log models plus in-memory
repositories that hold them for the current process lifetime.

## Scope

- Define typed dashboard domain models for:
  - configured device records;
  - runtime status and run metadata;
  - structured log events.
- Define IMEI validation and duplicate-detection rules used by later API tasks.
- Add in-memory repositories for devices, runtime records, and logs.
- Keep storage in memory only and make restart-clears-state behavior explicit.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- package.json
- src/domain.ts
- src/config.ts
- tests/config.test.ts

### Expected to Create or Modify

- src/dashboard/domain.ts
- src/dashboard/repositories/
- tests/

## Acceptance Criteria

- Device, run-state, and log-event types exist for later dashboard tasks.
- In-memory repositories support the operations needed by later tasks without
  adding a database.
- Duplicate or malformed IMEIs can be rejected through shared validation logic.
- Repository tests prove state is process-local and independent from simulator
  protocol code.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- HTTP controllers or routes.
- Starting or stopping simulator sessions.
- React rendering.
