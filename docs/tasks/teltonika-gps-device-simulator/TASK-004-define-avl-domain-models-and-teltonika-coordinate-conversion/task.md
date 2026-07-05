---
id: TASK-004
title: Define AVL Domain Models And Teltonika Coordinate Conversion
initial_status: completed
depends_on:
  - TASK-001
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-004: Define AVL Domain Models And Teltonika Coordinate Conversion

## Goal

Create AVL protocol domain models and Teltonika coordinate conversion.

## Scope

- Define AVL GPS element, AVL IO element, and AVL record types.
- Represent timestamp, priority, longitude, latitude, altitude, heading, satellites, speed, event IO ID, and IO groups.
- Add coordinate conversion to Teltonika signed integer format: `degrees * 10000000`.
- Keep AVL models independent from binary serialization and TCP networking.

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

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- AVL domain types cover timestamp, priority, longitude, latitude, altitude, heading, satellites, speed, event IO ID, and IO groups.
- Known coordinates produce exact signed Teltonika integer values.
- Invalid coordinate ranges fail clearly.
- AVL domain modules do not import `net` or packet encoder modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Route, driving-style, device-profile, and vehicle-state models.
- Route file loading.
- Route interpolation.
- Device-profile mapping implementation.
- Packet encoding.
