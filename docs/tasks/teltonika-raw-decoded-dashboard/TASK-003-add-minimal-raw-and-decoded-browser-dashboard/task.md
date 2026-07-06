---
id: TASK-003
title: Add Minimal Raw And Decoded Browser Dashboard
initial_status: blocked
depends_on:
  - TASK-002
source_prd: docs/teltonika-raw-decoded-dashboard-prd.md
workflow_version: 2
---

# TASK-003: Add Minimal Raw And Decoded Browser Dashboard

## Goal

Render the captured Teltonika messages in a small local browser UI with raw
hex and decoded JSON shown side by side.

## Scope

- Render the current process message list from the parser backend.
- Show connection/session identifier and IMEI where known.
- Show message type, receive timestamp, raw frame hex, and decoded JSON.
- Keep raw and decoded views adjacent for each message.
- Provide clear empty and decoding-error states.
- Keep the UI lightweight and local; do not add a full SPA pipeline unless the
  implementation absolutely needs it.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-raw-decoded-dashboard-prd.md
- src/index.ts
- src/live-session.ts
- src/avl-session.ts
- tests/end-to-end-parser-visible.test.ts
- tests/teltonika-parser-fixture.test.ts
- tests/fixtures/teltonika-parser-fixture.ts

### Expected to Create or Modify

- src/
- tests/
- public/ or other local static assets if needed by the chosen implementation

## Acceptance Criteria

- The dashboard shows each IMEI and AVL frame with raw lowercase hex.
- Valid Codec 8 Extended packets show decoded JSON records next to the raw
  frame.
- Invalid packets show an actionable error state instead of disappearing.
- The UI remains a thin consumer of parser events and does not implement binary
  parsing itself.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- TCP session parsing.
- Codec 8 Extended decoding.
- Charts, maps, alerts, or command sending.
