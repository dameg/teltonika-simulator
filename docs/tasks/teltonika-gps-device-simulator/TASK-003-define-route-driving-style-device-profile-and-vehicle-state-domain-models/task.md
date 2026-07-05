---
id: TASK-003
title: Define Route Driving-Style Device-Profile And Vehicle-State Domain Models
initial_status: completed
depends_on:
  - TASK-001
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-003: Define Route Driving-Style Device-Profile And Vehicle-State Domain Models

## Goal

Create typed domain models shared by route, driving-style, device-profile, and vehicle simulation layers.

## Scope

- Define route point, route metadata, driving style, vehicle state, driving event, and device profile types.
- Keep route, driving-style, device-profile, and vehicle-state models independent from TCP networking and Codec binary serialization.

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

- Route and route metadata types support ordered points and route metadata.
- Driving-style types can represent `eco`, `normal`, and `aggressive` profile parameters.
- Device-profile types can represent model name, codec, supported IO IDs, defaults, and vehicle-state mapping rules.
- Vehicle state covers position, speed, acceleration, braking, stopping, idling, ignition, movement, voltage, and driving events.
- No domain module imports `net`, Codec, or packet encoder modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- AVL GPS and IO record models.
- Teltonika coordinate conversion.
- Route file loading.
- Route interpolation.
- Device-profile mapping implementation.
- Packet encoding.
