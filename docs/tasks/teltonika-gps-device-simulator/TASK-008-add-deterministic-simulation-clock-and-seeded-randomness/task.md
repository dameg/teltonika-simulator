---
id: TASK-008
title: Add Deterministic Simulation Clock And Seeded Randomness
initial_status: completed
depends_on:
  - TASK-006
  - TASK-007
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-008: Add Deterministic Simulation Clock And Seeded Randomness

## Goal

Provide deterministic time advancement and seeded randomness for vehicle simulation.

## Scope

- Add a simulation clock driven by start timestamp and fixed interval.
- Add a seeded pseudo-random source with stable output for the same seed.
- Add helpers for producing deterministic sequences across route, style, seed, and interval inputs.
- Keep the clock and randomness independent from networking.

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

- Same seed and interval produce the same clock/random sequence.
- Different seeds produce different random sequences.
- Clock timestamps advance in milliseconds by the configured interval.
- No simulation clock code imports `net` or Codec modules.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Vehicle behavior rules.
- Device-profile mapping.
- TCP runtime.
