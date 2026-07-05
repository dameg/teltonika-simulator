---
id: TASK-024
title: Add Generated Telemetry Fallback
initial_status: ready
depends_on:
  - TASK-002
  - TASK-009
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-024: Add Generated Telemetry Fallback

## Goal

Provide deterministic simulator telemetry when no route file is configured.

## Scope

- Add a small default route or scenario source for configurations without `routeFile`.
- Resolve configured route input into a deterministic simulation route before dry-run or runtime use.
- Use the fallback only when no route file is supplied; explicit route files remain authoritative.
- Keep fallback source selection independent from Codec encoding and TCP sessions.
- Add tests proving deterministic fallback output and explicit route-file precedence.

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

- Simulator configuration without a route file can produce a deterministic route or vehicle-state source.
- The same seed, driving style, and interval produce the same fallback telemetry sequence.
- Supplying an explicit route file bypasses the fallback source.
- Fallback source code does not import Codec or TCP modules.
- Tests cover fallback determinism and explicit route-file precedence.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Live TCP sending.
- Dry-run packet printing.
- New route file formats.
- Random non-deterministic scenario generation.
