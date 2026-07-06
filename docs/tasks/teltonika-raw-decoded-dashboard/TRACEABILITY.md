# Teltonika Raw And Decoded Dashboard Traceability

## PRD Coverage

| PRD area | Covered by |
| --- | --- |
| Raw TCP capture and decoded JSON dashboard | TASK-002, TASK-003, TASK-004 |
| Codec 8 Extended decoder | TASK-001, TASK-004 |
| IMEI handshake and AVL acknowledgement behavior | TASK-002, TASK-004 |
| Raw lowercase hex presentation | TASK-003, TASK-004 |
| Local startup with visible TCP port and web URL | TASK-002, TASK-004 |
| Malformed and unsupported packet errors | TASK-001, TASK-004 |
| Deterministic decoded output | TASK-001, TASK-004 |

## Requirements By Section

- Problem statement: TASK-001 through TASK-004.
- Solution: TASK-002 and TASK-003.
- Goals:
  - capture raw Teltonika TCP messages: TASK-002 and TASK-004
  - display raw message bytes as lowercase hex: TASK-003 and TASK-004
  - decode supported Teltonika messages into JSON: TASK-001, TASK-003, TASK-004
  - show raw and decoded views together: TASK-003 and TASK-004
  - reuse existing protocol knowledge: TASK-001 and TASK-002
- Functional requirements:
  - TCP parser endpoint: TASK-002
  - Codec 8 Extended decoder: TASK-001
  - dashboard presentation and in-memory retention: TASK-003
- Acceptance criteria:
  - local startup and visible ports: TASK-002 and TASK-004
  - simulator can target dashboard TCP port: TASK-002 and TASK-004
  - raw IMEI and AVL frames are visible: TASK-002, TASK-003, TASK-004
  - decoded JSON records are visible: TASK-001, TASK-003, TASK-004
  - invalid packets show actionable errors: TASK-001 and TASK-004
  - decoder tests cover valid and malformed packets: TASK-001
  - parser/dashboard tests prove web-facing visibility: TASK-004

## Non-Goals Preserved

- Production fleet management.
- Authentication and multi-user accounts.
- Persistence beyond the current local run.
- UDP support.
- Codecs other than Codec 8 Extended.
- Maps, charts, geofencing, alerts, reports, or device command sending.
- Replacing the simulator CLI.

## Open Questions

- Whether the dashboard launcher should be exposed as a new CLI mode or a separate command.
- Whether in-memory retention stays the only storage model for MVP.
- Whether the first UI should use server-rendered HTML with polling or a small client-side stream mechanism.
