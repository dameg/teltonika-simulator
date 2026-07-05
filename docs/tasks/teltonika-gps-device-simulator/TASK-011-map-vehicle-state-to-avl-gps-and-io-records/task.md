---
id: TASK-011
title: Map Vehicle State To AVL GPS And IO Records
initial_status: completed
depends_on:
  - TASK-004
  - TASK-009
  - TASK-010
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-011: Map Vehicle State To AVL GPS And IO Records

## Goal

Convert generic vehicle-state snapshots into AVL-ready GPS and IO records.

## Scope

- Map vehicle timestamp, coordinates, altitude, heading, satellites, and speed into AVL GPS fields.
- Map ignition, movement, voltage, idle, harsh-driving events, and no-GPS-fix state into IO elements through the selected device profile.
- Set priority and event IO ID from vehicle events.
- Keep mapping independent from binary serialization and TCP sessions.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaProtocolDecoder.java
- src/
- tests/
- tests/fixtures/

### Expected to Create or Modify

- src/
- tests/
- tests/fixtures/

## Acceptance Criteria

- A vehicle-state snapshot maps to an AVL record with GPS and IO fields populated.
- No GPS fix maps to zero satellites and expected GPS validity-related values.
- Default profile produces expected IO IDs and values for ignition, movement, voltage, idle, harsh acceleration, and harsh braking.
- Mapping is deterministic for the same vehicle state and device profile.
- Mapping code does not import Codec or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- CRC calculation.
- Binary encoding.
- TCP sending.
