---
id: TASK-023
title: Document CLI Usage And MVP Limits
initial_status: blocked
depends_on:
  - TASK-022
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-023: Document CLI Usage And MVP Limits

## Goal

Document how to run the virtual Teltonika vehicle simulator and what the MVP supports.

## Scope

- Update README with local setup and npm commands.
- Document CLI flags and environment variables.
- Document JSON route format and loop-at-end behavior.
- Document driving styles, simulation seed, send interval, and determinism guarantees.
- Document dry-run hex dump, single IMEI, multiple IMEIs, and reconnect behavior.
- Document protocol limits and non-goals.
- Mention that `references/` files are read-only server-side evidence.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- README.md
- references/traccar/README.md
- src/

### Expected to Create or Modify

- README.md
- src/

## Acceptance Criteria

- README explains running with parser host, parser port, and IMEI.
- README includes route JSON, driving style, seed, dry-run, and multi-IMEI examples.
- README states Codec 8 Extended is the only supported codec.
- README states UDP, TLS, web dashboard, cloud deployment, trip database, and command-response simulation are out of scope.
- README documents the virtual vehicle model, not only packet generation.

## Verification

```bash
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

## Out of Scope

- Web UI.
- Package publishing.
- New product behavior.
