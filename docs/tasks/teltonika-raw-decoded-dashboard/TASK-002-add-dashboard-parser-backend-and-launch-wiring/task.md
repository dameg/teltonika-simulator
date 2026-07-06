---
id: TASK-002
title: Add Dashboard Parser Backend And Launch Wiring
initial_status: blocked
depends_on:
  - TASK-001
source_prd: docs/teltonika-raw-decoded-dashboard-prd.md
workflow_version: 2
---

# TASK-002: Add Dashboard Parser Backend And Launch Wiring

## Goal

Stand up the local dashboard backend that accepts Teltonika TCP traffic,
captures raw messages, decodes supported packets, and exposes the data to the
web UI.

## Scope

- Accept Teltonika TCP client connections.
- Parse IMEI handshake frames and support configurable IMEI acceptance with a
  default of accept.
- Parse fragmented AVL packet frames and acknowledge valid packets with the
  decoded record count.
- Feed valid packet bytes into the reusable Codec 8 Extended decoder.
- Keep recent messages in memory for the current process.
- Expose the data needed by the browser dashboard and print the local TCP and
  web addresses on startup.
- Keep parser/backend logic separate from browser rendering.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-raw-decoded-dashboard-prd.md
- src/index.ts
- src/config.ts
- src/imei-handshake.ts
- src/avl-session.ts
- src/live-session.ts
- src/codec8-extended.ts
- tests/fixtures/teltonika-parser-fixture.ts
- tests/imei-handshake.test.ts
- tests/avl-session.test.ts
- tests/live-session.test.ts

### Expected to Create or Modify

- src/
- tests/

## Acceptance Criteria

- A user can start the dashboard locally and see the listening TCP port and web
  URL.
- A simulator run can target the dashboard TCP port.
- IMEI handshakes are accepted by default and can be rejected by config.
- Valid AVL packets are acknowledged with the decoded record count.
- Raw message events keep session ID, IMEI where known, timestamp, type, and
  raw hex in memory for the current run.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Browser markup and styling.
- Packet decoder internals.
- Persistent storage or export.
