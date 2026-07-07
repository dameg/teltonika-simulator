# Traceability Matrix

## Requirements

| PRD requirement | Covered by |
| --------------- | ---------- |
| Start the NestJS dashboard locally | TASK-001, TASK-007 |
| Create a device with a provided IMEI through the dashboard | TASK-002, TASK-003, TASK-006, TASK-007 |
| Bulk import multiple IMEIs through the dashboard | TASK-003, TASK-006, TASK-007 |
| Configure simulator settings per device without the CLI | TASK-002, TASK-003, TASK-006, TASK-007 |
| Start one configured device from the dashboard | TASK-004, TASK-006, TASK-007 |
| Start at least two configured devices concurrently from the dashboard | TASK-004, TASK-007 |
| Stop a running device from the dashboard | TASK-004, TASK-006, TASK-007 |
| Show current status for each configured device | TASK-004, TASK-005, TASK-006, TASK-007 |
| Show per-device logs for connection lifecycle and simulator events | TASK-004, TASK-005, TASK-006, TASK-007 |
| Refresh status and logs through polling without full page reload | TASK-005, TASK-006, TASK-007 |
| Manually clear in-memory logs or device/runtime data | TASK-005, TASK-006, TASK-007 |
| Clear in-memory devices, run state, and logs on restart | TASK-002, TASK-007 |
| Keep parser-visible simulator protocol behavior correct for dashboard-launched runs | TASK-004, TASK-007 |
| Keep downstream telemetry forwarding out of scope | TASK-001, TASK-004, TASK-006, TASK-007 |

## Architecture Boundaries

| Boundary | Covered by |
| -------- | ---------- |
| Simulation logic remains in existing simulator modules | TASK-004, TASK-007 |
| Protocol encoding, handshake, acknowledgement, and reconnect stay out of NestJS controllers and views | TASK-004, TASK-007 |
| NestJS owns HTTP routes, modules, and dashboard API surface | TASK-001, TASK-003, TASK-004, TASK-005 |
| React owns client-side rendering and polling behavior | TASK-001, TASK-006, TASK-007 |
| Runtime orchestration service manages active simulator instances per IMEI | TASK-004 |
| Storage boundary stays an in-memory repository | TASK-002, TASK-003, TASK-005 |
| Future telemetry-host integration remains a separate output boundary | TASK-004, TASK-006 |

## Important Non-Goals

| Non-goal | Protected by |
| -------- | ------------ |
| Sending simulator output into the future external telemetry host | TASK-004, TASK-006 |
| Authentication, multi-user accounts, and permissions | TASK-001, TASK-006 |
| Fleet analytics, trip history, maps, and reports | TASK-005, TASK-006 |
| Device command sending, firmware updates, SMS, and CAN bus simulation | TASK-004 |
| Additional codecs beyond Codec 8 Extended | TASK-004, TASK-007 |
| Cloud deployment automation and horizontal scaling | TASK-001 |
| CLI removal | TASK-004 |

## Open Questions

- None.
