---
id: TASK-004
title: Add Parser-Visible Integration And Dashboard Smoke Tests
initial_status: blocked
depends_on:
  - TASK-002
  - TASK-003
source_prd: docs/teltonika-raw-decoded-dashboard-prd.md
workflow_version: 2
---

# TASK-004: Add Parser-Visible Integration And Dashboard Smoke Tests

## Goal

Prove the dashboard surfaces raw and decoded Teltonika traffic through the
same web-facing interface that developers will use locally.

## Scope

- Send simulator traffic to the dashboard parser endpoint through the reusable
  parser fixture.
- Assert that raw hex and decoded JSON are emitted for valid Codec 8 Extended
  packets.
- Assert that malformed or unsupported packets surface decode errors.
- Add a minimal HTTP smoke test for the dashboard message API or page shell.
- Cover the startup path enough to verify the local TCP port and web URL are
  reachable.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-raw-decoded-dashboard-prd.md
- tests/end-to-end-parser-visible.test.ts
- tests/teltonika-parser-fixture.test.ts
- tests/fixtures/teltonika-parser-fixture.ts
- tests/fixtures/assert-codec8-extended-packet.ts
- src/

### Expected to Create or Modify

- tests/
- src/ if the smoke test requires a small helper hook

## Acceptance Criteria

- A parser-visible test proves that raw and decoded messages are visible
  through the web-facing interface.
- The test suite covers at least one valid packet and at least one malformed
  packet.
- The dashboard smoke test proves the local UI or message API responds without
  duplicating packet parsing logic.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Adding new protocol features beyond Codec 8 Extended.
- Long-term persistence or export formats.
