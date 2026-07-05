---
id: TASK-022
title: Add End-To-End Parser-Visible Tests
initial_status: blocked
depends_on:
  - TASK-015
  - TASK-021
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-022: Add End-To-End Parser-Visible Tests

## Goal

Verify the complete virtual vehicle-to-parser flow through existing modules and fixtures.

## Scope

- Compose configuration, JSON route, driving style, simulation, device-profile mapping, Codec 8 Extended framing, TCP session, acknowledgements, reconnect, and multi-device runtime.
- Use the reusable parser fixture.
- Reuse existing packet validation helpers instead of duplicating lower-level tests.
- Include a dry-run determinism check.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- references/traccar/README.md
- references/traccar/TeltonikaFrameDecoder.java
- references/traccar/TeltonikaProtocolDecoder.java
- src/
- tests/
- tests/fixtures/

### Expected to Create or Modify

- src/
- tests/
- tests/fixtures/

## Acceptance Criteria

- A local parser verifies complete IMEI handshake and AVL packet exchange.
- At least one received packet validates as Codec 8 Extended with correct length, record counts, and CRC.
- End-to-end test covers route-following vehicle simulation, not only fixed packet generation.
- End-to-end test covers at least two IMEIs or reconnect behavior.
- Dry-run output is deterministic for fixed route, driving style, seed, and interval.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Live Traccar server testing.
- Cloud deployment.
- Full matrix duplication of lower-level tests.
