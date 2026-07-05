---
id: TASK-009
title: Simulate Vehicle Movement And Driving Behavior
initial_status: completed
depends_on:
  - TASK-008
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-009: Simulate Vehicle Movement And Driving Behavior

## Goal

Generate deterministic vehicle-state snapshots over time for a route and driving style.

## Scope

- Advance vehicle position along the interpolated route.
- Generate speed, acceleration, deceleration, braking, stopping, idling, ignition, movement, voltage, and harsh-driving events.
- Apply route speed limits where available.
- Apply `eco`, `normal`, and `aggressive` driving-style differences.
- Produce deterministic state sequences for the same route, style, seed, and interval.

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

- Same route, driving style, seed, and interval produce the same vehicle-state sequence.
- Different driving styles produce observably different speed, acceleration, braking, idling, and harsh-event behavior on the same route.
- Vehicle position progresses smoothly between route points.
- Ignition and movement state transitions are represented.
- Simulation code does not import Codec or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Teltonika IO mapping.
- Binary packet encoding.
- Runtime TCP sessions.
