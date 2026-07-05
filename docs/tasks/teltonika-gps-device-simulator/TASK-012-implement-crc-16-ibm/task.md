---
id: TASK-012
title: Implement CRC-16/IBM
initial_status: completed
depends_on:
  - TASK-001
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-012: Implement CRC-16/IBM

## Goal

Implement the Teltonika CRC-16/IBM calculation with independent verification.

## Scope

- Define polynomial, initial value, reflection behavior, final XOR, byte range, byte order, and 4-byte field representation.
- Implement CRC over a Node.js `Buffer`.
- Calculate CRC only over the Teltonika data field.
- Verify against the standard `"123456789"` CRC-16/IBM vector and at least one known Teltonika packet fixture from Traccar tests.
- Do not copy Traccar implementation directly.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaProtocolDecoder.java
- references/traccar/TeltonikaProtocolEncoder.java
- references/traccar/TeltonikaProtocolDecoderTest.java
- src/
- tests/

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- CRC parameters are documented in tests or source comments.
- The standard `"123456789"` vector passes.
- At least one known Teltonika packet fixture validates against its CRC field.
- Mutating a data-field byte changes the CRC result.
- The 16-bit CRC placement in the 4-byte protocol field is tested.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- AVL record encoding.
- Packet framing.
- TCP networking.
