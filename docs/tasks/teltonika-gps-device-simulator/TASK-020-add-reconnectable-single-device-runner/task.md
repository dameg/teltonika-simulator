---
id: TASK-020
title: Add Reconnectable Single-Device Runner
initial_status: blocked
depends_on:
  - TASK-019
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 2
---

# TASK-020: Add Reconnectable Single-Device Runner

## Goal

Reconnect a single device after TCP connection loss using the configured fixed delay.

## Scope

- Add runner lifecycle around one device session.
- Reconnect after connect failure, socket close, or parser restart.
- Repeat IMEI handshake after reconnect.
- Do not reconnect after IMEI rejection.
- Do not silently retry after acknowledgement mismatch.
- Preserve deterministic simulation sequence across reconnect behavior.

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

- Parser fixture can close a socket and observe reconnection after fixed delay.
- Reconnected session sends a fresh IMEI handshake before AVL data.
- IMEI rejection permanently stops that device runner.
- AVL acknowledgement mismatch fails that device runner explicitly.
- Reconnect tests assert parser-visible behavior.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Multiple-device runtime.
- Exponential backoff.
- TLS.
