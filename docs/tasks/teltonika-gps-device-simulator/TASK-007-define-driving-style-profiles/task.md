---
id: TASK-007
title: Define Driving-Style Profiles
initial_status: completed
depends_on:
  - TASK-003
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-007: Define Driving-Style Profiles

## Goal

Define the MVP `eco`, `normal`, and `aggressive` driving-style profiles.

## Scope

- Add profile definitions for acceleration, braking intensity, speed variation, idling behavior, cornering behavior, harsh acceleration probability, and harsh braking probability.
- Add profile lookup and validation helpers.
- Keep profiles data-driven and independent from route geometry and TCP networking.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- `eco`, `normal`, and `aggressive` profiles are available by name.
- Invalid profile names fail clearly.
- Profiles have observably different acceleration, braking, speed variation, idling, and harsh-event settings.
- Profile code does not import Codec or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Simulation state evolution.
- Route interpolation.
- Device-profile IO mapping.
