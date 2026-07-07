---
id: TASK-007
title: Add End-To-End Dashboard And Parser-Visible Test Coverage
initial_status: blocked
depends_on:
  - TASK-004
  - TASK-005
  - TASK-006
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-007: Add End-To-End Dashboard And Parser-Visible Test Coverage

## Goal

Add end-to-end and parser-visible coverage proving the dashboard can configure,
launch, monitor, and stop simulator runs through the new NestJS and React
surfaces.

## Scope

- Add parser-visible integration tests for dashboard-triggered simulator runs.
- Add end-to-end or HTTP-smoke coverage for device creation, bulk import,
  start/stop actions, status visibility, log visibility, manual clear actions,
  and polling-oriented refresh behavior.
- Verify restart semantics match the PRD by treating in-memory state as
  process-local and cleared on restart.
- Reuse the existing Teltonika parser fixture and simulator protocol tests
  instead of rebuilding protocol assertions.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- src/dashboard/
- tests/fixtures/teltonika-parser-fixture.ts
- tests/end-to-end-parser-visible.test.ts
- tests/dashboard-backend.test.ts

### Expected to Create or Modify

- tests/

## Acceptance Criteria

- Tests prove dashboard-created devices can be launched into parser-visible
  simulator sessions.
- Tests prove at least two configured devices can run concurrently from the
  dashboard flow.
- Tests prove the React-facing dashboard surface exposes status, logs, and
  clear actions.
- Tests prove restart semantics clear in-memory dashboard state.
- Verification commands pass with the full dashboard task set implemented.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Additional protocol variants beyond the current simulator scope.
- Persistence beyond the current process.
