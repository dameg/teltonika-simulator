# Traceability Matrix

## Requirements

| PRD requirement | Covered by | Coverage type |
| --- | --- | --- |
| TypeScript, Node.js, `net`, `Buffer`, Vitest, minimal dependencies | TASK-001 | migrated |
| CLI and environment configuration | TASK-002 | migrated |
| Parser host and parser port | TASK-002, TASK-023 | migrated |
| IMEI or list of IMEIs | TASK-002, TASK-021, TASK-023 | migrated |
| Send interval | TASK-002, TASK-008, TASK-019 | migrated |
| Reconnect delay | TASK-002, TASK-020 | migrated |
| Driving style and seed configuration | TASK-002, TASK-007, TASK-008, TASK-023 | migrated |
| Teltonika device profile configuration | TASK-002, TASK-010 | migrated |
| Route, driving-style, device-profile, and vehicle-state domain models | TASK-003 | migrated |
| AVL domain models | TASK-004 | migrated |
| Longitude and latitude Teltonika signed integer encoding | TASK-004, TASK-011, TASK-013 | migrated |
| JSON route file loading | TASK-005 | migrated |
| Route validation | TASK-005 | migrated |
| Route geometry and heading | TASK-006 | migrated |
| Smooth position interpolation | TASK-006, TASK-009, TASK-022 | migrated |
| End-of-route loops to first point | TASK-006, TASK-019, TASK-023 | migrated |
| `eco`, `normal`, and `aggressive` driving styles | TASK-007, TASK-009, TASK-023 | migrated |
| Same route, style, seed, and interval produces same telemetry | TASK-008, TASK-009, TASK-015, TASK-019, TASK-022 | migrated |
| Different styles produce different behavior on same route | TASK-007, TASK-009, TASK-015 | migrated |
| Speed, acceleration, braking, stopping, idling behavior | TASK-009 | migrated |
| Ignition and movement behavior | TASK-009, TASK-011 | migrated |
| Harsh acceleration and harsh braking events | TASK-009, TASK-010, TASK-011 | migrated |
| Default Codec 8 Extended device profile | TASK-010 | migrated |
| Device profile maps ignition, movement, voltage, and events | TASK-010, TASK-011 | migrated |
| Vehicle state maps into AVL GPS and IO values | TASK-011 | migrated |
| Timestamp, priority, GPS element, event IO ID, and IO elements | TASK-004, TASK-011, TASK-013 | migrated |
| CRC-16/IBM over Teltonika data field | TASK-012, TASK-014 | migrated |
| Independent CRC vector or known packet fixture | TASK-012 | migrated |
| Codec 8 Extended AVL record encoding | TASK-013 | migrated |
| TCP AVL packet preamble, length, codec ID, record counts, CRC | TASK-014 | migrated |
| Encoder supports one or more records per packet | TASK-014 | migrated |
| Runtime default sends one AVL record per packet | TASK-019 | migrated |
| Dry-run deterministic hex dump | TASK-015, TASK-022, TASK-023 | migrated |
| Reusable local parser fixture | TASK-016 | migrated |
| TCP client connection to parser | TASK-017, TASK-018, TASK-019 | migrated |
| IMEI handshake two-byte length plus ASCII IMEI | TASK-017 | migrated |
| IMEI acknowledgement `0x01` accepted and `0x00` rejected | TASK-017, TASK-020 | migrated |
| Rejected IMEI stops without reconnecting | TASK-017, TASK-020 | migrated |
| AVL send after IMEI acceptance | TASK-018 | migrated |
| 4-byte accepted-record acknowledgement | TASK-018 | migrated |
| Acknowledgement mismatch fails session explicitly | TASK-018, TASK-020 | migrated |
| Repeated send loop until stopped | TASK-019 | migrated |
| Clean shutdown | TASK-019, TASK-021 | migrated |
| Connection lifecycle, send result, and acknowledgement logs | TASK-019 | migrated |
| Reconnect after TCP connection loss | TASK-020 | migrated |
| One independent runner and TCP session per IMEI | TASK-021 | migrated |
| At least two IMEIs concurrently | TASK-021, TASK-022 | migrated |
| Local parser verifies complete handshake and AVL exchange | TASK-016, TASK-018, TASK-022 | migrated |
| External parser can decode at least one Codec 8 Extended packet | TASK-014, TASK-018, TASK-022 | migrated |
| Vehicle simulation separated from Codec and TCP layers | TASK-003, TASK-004, TASK-009, TASK-011, TASK-013, TASK-018 | migrated |
| Route layer does not encode packets or open TCP | TASK-005, TASK-006 | migrated |
| Device-profile layer does not implement route movement or sockets | TASK-010, TASK-011 | migrated |
| Codec layer contains no route, style, reconnect, or socket logic | TASK-013, TASK-014 | migrated |
| TCP session does not generate telemetry | TASK-017, TASK-018, TASK-019 | migrated |
| README and CLI documentation | TASK-023 | migrated |
| References under `references/` are read-only | TASK-001, TASK-012, TASK-016, TASK-023 | migrated |
| Non-goals: no UDP, TLS, web dashboard, cloud deployment, historical trip database, command-response simulation, or non-Codec 8 Extended codecs | TASK-001, TASK-014, TASK-020, TASK-023 | migrated |
| Generated telemetry is used only when no route file is supplied | TASK-024 | new |

## Acceptance Criteria

| PRD acceptance criterion | Covered by |
| --- | --- |
| A user can run the simulator with parser host, parser port, and IMEI. | TASK-002, TASK-017, TASK-019, TASK-023 |
| The external parser receives an IMEI handshake. | TASK-017, TASK-022 |
| If the parser responds with `0x01`, the simulator sends AVL binary frames. | TASK-017, TASK-018, TASK-022 |
| If the parser responds with `0x00`, the simulator stops that session and reports rejection. | TASK-017, TASK-020 |
| The external parser can decode at least one Codec 8 Extended packet from the simulator. | TASK-014, TASK-018, TASK-022 |
| The simulator reads parser AVL acknowledgement counts. | TASK-018 |
| The simulator reports an error when the acknowledgement count does not match the sent record count. | TASK-018, TASK-020 |
| A local test parser can verify a complete handshake and AVL packet exchange. | TASK-016, TASK-018, TASK-022 |
| The simulator can run at least two IMEIs concurrently. | TASK-021, TASK-022 |
| The simulator can replay a deterministic route. | TASK-005, TASK-006, TASK-009, TASK-019, TASK-022 |
| The simulator supports `eco`, `normal`, and `aggressive` driving styles. | TASK-007, TASK-009 |
| The same route, driving style, seed, and interval produce the same telemetry sequence. | TASK-008, TASK-009, TASK-015, TASK-019, TASK-022 |
| Different driving styles produce different vehicle behavior on the same route. | TASK-007, TASK-009, TASK-015 |
| Vehicle position progresses smoothly between route points. | TASK-006, TASK-009 |
| A default Teltonika device profile maps ignition, movement, voltage, and driving events into Codec 8 Extended IO elements. | TASK-010, TASK-011 |
| When no route file is supplied, generated telemetry is deterministic and only used as a fallback. | TASK-024 |

## Architecture Boundaries

| Boundary | Covered by |
| --- | --- |
| Route loading and route geometry stay in the route layer. | TASK-005, TASK-006 |
| Driving-style behavior stays in the simulation layer. | TASK-007, TASK-009 |
| Vehicle simulation produces deterministic vehicle-state snapshots. | TASK-008, TASK-009, TASK-024 |
| Teltonika IO mappings stay in the device-profile layer. | TASK-010, TASK-011 |
| AVL domain models remain independent from binary serialization. | TASK-004, TASK-013 |
| Codec encoding contains no route, driving-style, reconnect, or socket logic. | TASK-012, TASK-013, TASK-014 |
| TCP session code does not generate telemetry. | TASK-017, TASK-018, TASK-019 |
| One independent device runner is used per IMEI. | TASK-020, TASK-021 |

## Important Non-Goals

| Non-goal | Protected by |
| --- | --- |
| Full Teltonika firmware emulation is out of scope. | TASK-023 |
| UDP transport is out of scope. | TASK-020, TASK-023 |
| Codecs other than Codec 8 Extended are out of scope. | TASK-014, TASK-023 |
| Real cellular modem behavior is out of scope. | TASK-023 |
| Device management, SMS commands, firmware update flows, and CAN bus simulation are out of scope. | TASK-021, TASK-023 |
| A production fleet management backend is out of scope. | TASK-021, TASK-023 |
| TLS, web dashboard, historical trip database, cloud deployment, and command-response simulation are out of scope. | TASK-020, TASK-023 |

## Migration Notes

- Migrated TASK-001 through TASK-023 from `docs/tasks/teltonika-gps-device-simulator-tasks.md`.
- Mapped legacy `done` status to manifest `completed` for TASK-001 through TASK-014.
- Preserved unfinished legacy tasks TASK-015 through TASK-023 as workflow version 2.
- Added TASK-024 as new workflow version 2 coverage for the PRD decision: generated telemetry is used only when no route file is supplied.
- Repaired dependencies by adding TASK-024 before dry-run/runtime work: TASK-015 now depends on TASK-024, and TASK-019 now depends on TASK-024.
- No ambiguous legacy statuses were found.
- No ambiguous dependency repairs were made.
- Requirements covered by completed migrated work include project bootstrap, configuration parsing, domain models, route loading and interpolation, driving styles, deterministic simulation, default device profile mapping, AVL mapping, CRC, record encoding, and packet framing.

## Open Questions

- None.
