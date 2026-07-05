---
id: TASK-002
title: Add CLI And Environment Configuration Parsing
initial_status: completed
depends_on:
  - TASK-001
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-002: Add CLI And Environment Configuration Parsing

## Goal

Parse and validate simulator configuration from CLI flags and environment variables.

## Scope

- Add parser host, parser port, IMEI list, send interval, reconnect delay, route file, driving style, simulation seed, device profile, dry-run, and packet-count options.
- Add environment variable defaults for the same options.
- Define CLI-over-environment precedence.
- Validate required fields and ranges.
- Keep configuration parsing independent from simulation and TCP runtime.

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

- CLI flags can provide host, port, and one or more IMEIs.
- Environment variables can provide equivalent configuration.
- CLI flags override environment variables.
- Invalid port, interval, reconnect delay, driving style, seed, and missing IMEI fail clearly.
- `--help` exits successfully.

## Verification

```bash
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

## Out of Scope

- Opening TCP sockets.
- Loading route files.
- Running simulation.
