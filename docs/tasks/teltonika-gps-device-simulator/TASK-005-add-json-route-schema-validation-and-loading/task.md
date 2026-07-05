---
id: TASK-005
title: Add JSON Route Schema Validation And Loading
initial_status: completed
depends_on:
  - TASK-003
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-005: Add JSON Route Schema Validation And Loading

## Goal

Load and validate deterministic route definitions from JSON files.

## Scope

- Define MVP JSON route schema.
- Load route JSON from disk using Node.js filesystem APIs.
- Validate route metadata, ordered points, coordinates, optional altitude, optional speed limits, and optional stop/idling hints.
- Return typed route objects for route geometry and simulation layers.
- Add fixed route fixtures for tests.

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

- Valid JSON routes load deterministically.
- Invalid JSON, empty routes, invalid coordinates, and malformed speed limits fail clearly.
- Route point order is preserved.
- Route loading does not import Codec or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Route interpolation.
- Vehicle simulation.
- Packet encoding.
- Non-JSON route formats.
