---
id: TASK-006
title: Implement Route Geometry And Smooth Interpolation
initial_status: completed
depends_on:
  - TASK-005
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-006: Implement Route Geometry And Smooth Interpolation

## Goal

Calculate route geometry and interpolate smooth vehicle positions between route points.

## Scope

- Compute segment distances, cumulative route distance, and segment headings.
- Interpolate latitude, longitude, altitude, and heading for a travelled distance or elapsed route progress.
- Apply loop-to-first-point behavior at route end.
- Respect route speed limits where provided as inputs to later simulation.

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

- Positions progress smoothly between route points rather than jumping point to point.
- Heading is calculated from route geometry.
- End-of-route loops to the first point deterministically.
- Known route coordinates produce expected interpolated positions.
- Route geometry code does not import Codec or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Driving-style behavior.
- Vehicle acceleration and braking.
- Device-profile mapping.
- Networking.
