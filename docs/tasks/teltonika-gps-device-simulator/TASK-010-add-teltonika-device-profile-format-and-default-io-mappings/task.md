---
id: TASK-010
title: Add Teltonika Device Profile Format And Default IO Mappings
initial_status: completed
depends_on:
  - TASK-003
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-010: Add Teltonika Device Profile Format And Default IO Mappings

## Goal

Define replaceable Teltonika device profiles and one default Codec 8 Extended IO mapping.

## Scope

- Define device-profile format for model name, codec, supported IO IDs, defaults, and vehicle-state mapping rules.
- Add one default Codec 8 Extended profile.
- Include mappings for ignition, movement, voltage/power, harsh acceleration, harsh braking, idle, satellites/no GPS fix, and event IO ID.
- Keep profile definitions independent from route movement and TCP sessions.

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

- A default Codec 8 Extended device profile is available.
- The default profile maps ignition, movement, voltage, idle, harsh acceleration, and harsh braking into explicit IO element IDs.
- Device-profile validation rejects malformed mappings.
- Device-profile modules do not import route simulation or TCP modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Multiple model-specific profiles beyond the default.
- Binary encoding.
- Route simulation.
