# Teltonika GPS Device Simulator Tasks

## Execution Rules

- Work on exactly one task at a time.
- Select the first task with status `ready`.
- Verify that every dependency is `done` before implementation.
- Read all relevant files before implementation.
- Do not silently expand scope.
- Run every verification command listed for the task.
- Mark a task `done` only after all acceptance criteria pass.
- Unblock a task only when every dependency is `done`.
- Commit each completed task separately.
- Do not include unrelated refactors in a task commit.
- Stop when no ready tasks remain.
- Never modify files under `references/`.

## Stack And Decisions

- Language/runtime: TypeScript on Node.js.
- TCP: Node.js built-in `net` module.
- Binary encoding: Node.js `Buffer` APIs.
- Tests: Vitest.
- Production dependencies: minimal.
- Forbidden for MVP: NestJS, Express, Fastify, web framework, database, message broker.
- Route format: JSON.
- End of route: loop to the first route point.
- IMEI rejection `0x00`: stop that device session without reconnecting.
- AVL acknowledgement mismatch: fail that device session explicitly.
- TCP connection loss: reconnect after the configured fixed delay.
- Multiple devices: one independent device runner and TCP session per IMEI.
- Default runtime: one AVL record per packet.
- Encoder capability: one or more AVL records per packet.
- Determinism: same route, driving style, seed, and interval must produce the same output.

## Open Questions

No implementation-blocking questions remain for the MVP. Logging format and future model-specific device profiles can stay simple until the PRD requires more.

## TASK-001: Bootstrap TypeScript Node Project

**Status:** done

**Depends on:** none

**Goal**

Create the minimal TypeScript, Node.js, and Vitest project skeleton.

**Scope**

- Add `package.json` with scripts for `build`, `typecheck`, `test`, and local CLI execution.
- Add TypeScript configuration for Node.js.
- Add Vitest configuration.
- Add a minimal `src/` entry point and a smoke test.
- Add only development dependencies needed for TypeScript and Vitest.
- Do not add production dependencies unless required by a later task.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `README.md`
- `package.json`
- `tsconfig.json`
- `vitest.config.*`
- `src/`
- `tests/`

**Acceptance Criteria**

- `npm install` completes successfully.
- `npm run build` compiles TypeScript.
- `npm run typecheck` succeeds.
- `npm test` runs Vitest successfully.
- No web framework or unnecessary production dependency is added.

**Verification**

```sh
npm install
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- CLI option parsing.
- Simulation logic.
- Binary encoding.
- TCP networking.

## TASK-002: Add CLI And Environment Configuration Parsing

**Status:** done

**Depends on:** TASK-001

**Goal**

Parse and validate simulator configuration from CLI flags and environment variables.

**Scope**

- Add parser host, parser port, IMEI list, send interval, reconnect delay, route file, driving style, simulation seed, device profile, dry-run, and packet-count options.
- Add environment variable defaults for the same options.
- Define CLI-over-environment precedence.
- Validate required fields and ranges.
- Keep configuration parsing independent from simulation and TCP runtime.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`

**Acceptance Criteria**

- CLI flags can provide host, port, and one or more IMEIs.
- Environment variables can provide equivalent configuration.
- CLI flags override environment variables.
- Invalid port, interval, reconnect delay, driving style, seed, and missing IMEI fail clearly.
- `--help` exits successfully.

**Verification**

```sh
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

**Out of Scope**

- Opening TCP sockets.
- Loading route files.
- Running simulation.

## TASK-003: Define Route Driving-Style Device-Profile And Vehicle-State Domain Models

**Status:** done

**Depends on:** TASK-001

**Goal**

Create typed domain models shared by route, driving-style, device-profile, and vehicle simulation layers.

**Scope**

- Define route point, route metadata, driving style, vehicle state, driving event, and device profile types.
- Keep route, driving-style, device-profile, and vehicle-state models independent from TCP networking and Codec binary serialization.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`

**Acceptance Criteria**

- Route and route metadata types support ordered points and route metadata.
- Driving-style types can represent `eco`, `normal`, and `aggressive` profile parameters.
- Device-profile types can represent model name, codec, supported IO IDs, defaults, and vehicle-state mapping rules.
- Vehicle state covers position, speed, acceleration, braking, stopping, idling, ignition, movement, voltage, and driving events.
- No domain module imports `net`, Codec, or packet encoder modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- AVL GPS and IO record models.
- Teltonika coordinate conversion.
- Route file loading.
- Route interpolation.
- Device-profile mapping implementation.
- Packet encoding.

## TASK-004: Define AVL Domain Models And Teltonika Coordinate Conversion

**Status:** done

**Depends on:** TASK-001

**Goal**

Create AVL protocol domain models and Teltonika coordinate conversion.

**Scope**

- Define AVL GPS element, AVL IO element, and AVL record types.
- Represent timestamp, priority, longitude, latitude, altitude, heading, satellites, speed, event IO ID, and IO groups.
- Add coordinate conversion to Teltonika signed integer format: `degrees * 10000000`.
- Keep AVL models independent from binary serialization and TCP networking.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- AVL domain types cover timestamp, priority, longitude, latitude, altitude, heading, satellites, speed, event IO ID, and IO groups.
- Known coordinates produce exact signed Teltonika integer values.
- Invalid coordinate ranges fail clearly.
- AVL domain modules do not import `net` or packet encoder modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Route, driving-style, device-profile, and vehicle-state models.
- Route file loading.
- Route interpolation.
- Device-profile mapping implementation.
- Packet encoding.

## TASK-005: Add JSON Route Schema Validation And Loading

**Status:** done

**Depends on:** TASK-003

**Goal**

Load and validate deterministic route definitions from JSON files.

**Scope**

- Define MVP JSON route schema.
- Load route JSON from disk using Node.js filesystem APIs.
- Validate route metadata, ordered points, coordinates, optional altitude, optional speed limits, and optional stop/idling hints.
- Return typed route objects for route geometry and simulation layers.
- Add fixed route fixtures for tests.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Valid JSON routes load deterministically.
- Invalid JSON, empty routes, invalid coordinates, and malformed speed limits fail clearly.
- Route point order is preserved.
- Route loading does not import Codec or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Route interpolation.
- Vehicle simulation.
- Packet encoding.
- Non-JSON route formats.

## TASK-006: Implement Route Geometry And Smooth Interpolation

**Status:** done

**Depends on:** TASK-005

**Goal**

Calculate route geometry and interpolate smooth vehicle positions between route points.

**Scope**

- Compute segment distances, cumulative route distance, and segment headings.
- Interpolate latitude, longitude, altitude, and heading for a travelled distance or elapsed route progress.
- Apply loop-to-first-point behavior at route end.
- Respect route speed limits where provided as inputs to later simulation.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Positions progress smoothly between route points rather than jumping point to point.
- Heading is calculated from route geometry.
- End-of-route loops to the first point deterministically.
- Known route coordinates produce expected interpolated positions.
- Route geometry code does not import Codec or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Driving-style behavior.
- Vehicle acceleration and braking.
- Device-profile mapping.
- Networking.

## TASK-007: Define Driving-Style Profiles

**Status:** done

**Depends on:** TASK-003

**Goal**

Define the MVP `eco`, `normal`, and `aggressive` driving-style profiles.

**Scope**

- Add profile definitions for acceleration, braking intensity, speed variation, idling behavior, cornering behavior, harsh acceleration probability, and harsh braking probability.
- Add profile lookup and validation helpers.
- Keep profiles data-driven and independent from route geometry and TCP networking.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`

**Acceptance Criteria**

- `eco`, `normal`, and `aggressive` profiles are available by name.
- Invalid profile names fail clearly.
- Profiles have observably different acceleration, braking, speed variation, idling, and harsh-event settings.
- Profile code does not import Codec or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Simulation state evolution.
- Route interpolation.
- Device-profile IO mapping.

## TASK-008: Add Deterministic Simulation Clock And Seeded Randomness

**Status:** ready

**Depends on:** TASK-006, TASK-007

**Goal**

Provide deterministic time advancement and seeded randomness for vehicle simulation.

**Scope**

- Add a simulation clock driven by start timestamp and fixed interval.
- Add a seeded pseudo-random source with stable output for the same seed.
- Add helpers for producing deterministic sequences across route, style, seed, and interval inputs.
- Keep the clock and randomness independent from networking.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Same seed and interval produce the same clock/random sequence.
- Different seeds produce different random sequences.
- Clock timestamps advance in milliseconds by the configured interval.
- No simulation clock code imports `net` or Codec modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Vehicle behavior rules.
- Device-profile mapping.
- TCP runtime.

## TASK-009: Simulate Vehicle Movement And Driving Behavior

**Status:** blocked

**Depends on:** TASK-008

**Goal**

Generate deterministic vehicle-state snapshots over time for a route and driving style.

**Scope**

- Advance vehicle position along the interpolated route.
- Generate speed, acceleration, deceleration, braking, stopping, idling, ignition, movement, voltage, and harsh-driving events.
- Apply route speed limits where available.
- Apply `eco`, `normal`, and `aggressive` driving-style differences.
- Produce deterministic state sequences for the same route, style, seed, and interval.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Same route, driving style, seed, and interval produce the same vehicle-state sequence.
- Different driving styles produce observably different speed, acceleration, braking, idling, and harsh-event behavior on the same route.
- Vehicle position progresses smoothly between route points.
- Ignition and movement state transitions are represented.
- Simulation code does not import Codec or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Teltonika IO mapping.
- Binary packet encoding.
- Runtime TCP sessions.

## TASK-010: Add Teltonika Device Profile Format And Default IO Mappings

**Status:** ready

**Depends on:** TASK-003

**Goal**

Define replaceable Teltonika device profiles and one default Codec 8 Extended IO mapping.

**Scope**

- Define device-profile format for model name, codec, supported IO IDs, defaults, and vehicle-state mapping rules.
- Add one default Codec 8 Extended profile.
- Include mappings for ignition, movement, voltage/power, harsh acceleration, harsh braking, idle, satellites/no GPS fix, and event IO ID.
- Keep profile definitions independent from route movement and TCP sessions.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- A default Codec 8 Extended device profile is available.
- The default profile maps ignition, movement, voltage, idle, harsh acceleration, and harsh braking into explicit IO element IDs.
- Device-profile validation rejects malformed mappings.
- Device-profile modules do not import route simulation or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Multiple model-specific profiles beyond the default.
- Binary encoding.
- Route simulation.

## TASK-011: Map Vehicle State To AVL GPS And IO Records

**Status:** blocked

**Depends on:** TASK-004, TASK-009, TASK-010

**Goal**

Convert generic vehicle-state snapshots into AVL-ready GPS and IO records.

**Scope**

- Map vehicle timestamp, coordinates, altitude, heading, satellites, and speed into AVL GPS fields.
- Map ignition, movement, voltage, idle, harsh-driving events, and no-GPS-fix state into IO elements through the selected device profile.
- Set priority and event IO ID from vehicle events.
- Keep mapping independent from binary serialization and TCP sessions.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- A vehicle-state snapshot maps to an AVL record with GPS and IO fields populated.
- No GPS fix maps to zero satellites and expected GPS validity-related values.
- Default profile produces expected IO IDs and values for ignition, movement, voltage, idle, harsh acceleration, and harsh braking.
- Mapping is deterministic for the same vehicle state and device profile.
- Mapping code does not import Codec or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- CRC calculation.
- Binary encoding.
- TCP sending.

## TASK-012: Implement CRC-16/IBM

**Status:** ready

**Depends on:** TASK-001

**Goal**

Implement the Teltonika CRC-16/IBM calculation with independent verification.

**Scope**

- Define polynomial, initial value, reflection behavior, final XOR, byte range, byte order, and 4-byte field representation.
- Implement CRC over a Node.js `Buffer`.
- Calculate CRC only over the Teltonika data field.
- Verify against the standard `"123456789"` CRC-16/IBM vector and at least one known Teltonika packet fixture from Traccar tests.
- Do not copy Traccar implementation directly.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `references/traccar/TeltonikaProtocolEncoder.java`
- `references/traccar/TeltonikaProtocolDecoderTest.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- CRC parameters are documented in tests or source comments.
- The standard `"123456789"` vector passes.
- At least one known Teltonika packet fixture validates against its CRC field.
- Mutating a data-field byte changes the CRC result.
- The 16-bit CRC placement in the 4-byte protocol field is tested.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- AVL record encoding.
- Packet framing.
- TCP networking.

## TASK-013: Encode Codec 8 Extended AVL Records

**Status:** blocked

**Depends on:** TASK-011, TASK-012

**Goal**

Encode AVL records into Codec 8 Extended record bytes.

**Scope**

- Encode timestamp, priority, longitude, latitude, altitude, angle, satellites, speed, event IO ID, and total IO count.
- Encode 1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO groups with Codec 8 Extended 2-byte IDs/counts where applicable.
- Use Node.js `Buffer` APIs.
- Preserve AVL domain independence from binary serialization by keeping encoding in the Codec layer.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `references/traccar/TeltonikaProtocolDecoderTest.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- Encoded field order matches Codec 8 Extended decoding evidence in Traccar.
- Longitude and latitude are encoded as signed 32-bit integers.
- Event IO ID and total IO count are encoded correctly.
- Tests cover records with basic IO and X-byte IO.
- Codec encoder does not import route, driving-style, simulation, or TCP modules.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- TCP packet framing.
- IMEI handshake.
- Runtime send loop.

## TASK-014: Frame Codec 8 Extended TCP AVL Packets

**Status:** blocked

**Depends on:** TASK-013

**Goal**

Wrap one or more Codec 8 Extended AVL records in Teltonika TCP AVL packet framing.

**Scope**

- Add 4-byte zero preamble.
- Add 4-byte data field length.
- Add Codec ID `0x8E`.
- Add record count, encoded records, repeated record count, and 4-byte CRC field.
- Support one or more records per packet.
- Keep one record per packet as the runtime default outside the encoder.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaFrameDecoder.java`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `references/traccar/TeltonikaProtocolDecoderTest.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- Packet starts with a 4-byte zero preamble.
- Data field length equals actual data field byte count.
- Codec ID is `0x8E`.
- First and repeated record count fields match.
- CRC validates over only the data field.
- Tests cover one-record and multi-record packets.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- TCP sessions.
- Dry-run CLI.
- Codecs other than Codec 8 Extended.

## TASK-015: Add Dry-Run Deterministic Hex Dump Mode

**Status:** blocked

**Depends on:** TASK-002, TASK-011, TASK-014

**Goal**

Generate deterministic packet hex from simulation without opening a TCP socket.

**Scope**

- Wire CLI dry-run mode to route loading, vehicle simulation, device-profile mapping, and packet framing.
- Print packet hex lines to stdout.
- Keep logs/context on stderr.
- Support deterministic packet count.
- Ensure no TCP connection is opened in dry-run mode.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Same route, driving style, seed, interval, and count produce identical hex output.
- Different driving styles produce different dry-run packet sequences for the same route and seed.
- Dry-run packets are valid Codec 8 Extended framed packets.
- Dry-run mode does not import or invoke production TCP session startup.

**Verification**

```sh
npm run build
npm run typecheck
npm test
npm run cli -- --dry-run --host 127.0.0.1 --port 5027 --imei 123456789012345 --count 2
```

**Out of Scope**

- Live TCP parser communication.
- Reconnect behavior.

## TASK-016: Create Reusable Local Teltonika Parser Test Fixture

**Status:** blocked

**Depends on:** TASK-014

**Goal**

Provide a reusable local TCP parser fixture for parser-visible networking tests.

**Scope**

- Build a Vitest fixture using Node.js built-in `net`.
- Accept TCP client connections.
- Parse and record IMEI handshake frames.
- Parse and record AVL packet frames using Teltonika length framing.
- Send configurable IMEI accept/reject bytes.
- Send configurable 4-byte accepted-record acknowledgements.
- Support server-side socket close for reconnect tests.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaFrameDecoder.java`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- Fixture records raw IMEI and AVL frames.
- Fixture can accept or reject IMEIs.
- Fixture can acknowledge a chosen AVL record count.
- Fixture can close sockets to simulate parser restart.
- Fixture tests use parser-visible bytes, not private production helpers.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Production TCP client implementation.
- Full Traccar server emulation.

## TASK-017: Implement IMEI Handshake Session Behavior

**Status:** blocked

**Depends on:** TASK-002, TASK-016

**Goal**

Connect one device session and complete Teltonika IMEI identification.

**Scope**

- Use Node.js built-in `net` to open an outbound TCP connection.
- Send two-byte IMEI length followed by ASCII IMEI.
- Read one-byte IMEI acknowledgement.
- Treat `0x01` as accepted.
- Treat `0x00` as rejected and stop that device session without reconnecting.
- Report unexpected acknowledgement bytes as protocol errors.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `references/traccar/TeltonikaFrameDecoder.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- Local parser fixture receives exact IMEI handshake bytes.
- Accepted IMEI returns an accepted session result.
- Rejected IMEI stops the session and does not reconnect.
- No AVL packet is sent before IMEI acceptance.
- Tests assert behavior through the parser fixture.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- AVL packet sending.
- Reconnectable runner.
- Multiple devices.

## TASK-018: Send AVL Packets And Validate Accepted-Record Acknowledgements

**Status:** blocked

**Depends on:** TASK-014, TASK-017

**Goal**

Send framed AVL packets after IMEI acceptance and validate parser acknowledgement counts.

**Scope**

- Send one framed Codec 8 Extended AVL packet on an accepted session.
- Read a 4-byte accepted-record count.
- Treat matching count as success.
- Treat mismatched count as explicit session failure.
- Keep session logic independent from telemetry generation.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `references/traccar/TeltonikaFrameDecoder.java`
- `src/`
- `tests/`

**Acceptance Criteria**

- Parser fixture receives a valid Codec 8 Extended AVL packet after acceptance.
- Simulator reads the 4-byte acknowledgement count.
- Matching acknowledgement count succeeds.
- Mismatched acknowledgement count fails clearly and does not silently retry.
- Tests assert parser-visible packet bytes and acknowledgement behavior.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Vehicle simulation runtime loop.
- Reconnect behavior.
- Multiple devices.

## TASK-019: Add Repeated Send Loop And Clean Shutdown

**Status:** blocked

**Depends on:** TASK-011, TASK-018

**Goal**

Run one accepted device session that emits simulation-derived AVL packets repeatedly until stopped.

**Scope**

- Connect route simulation output to device-profile mapping and packet framing.
- Send one AVL record per packet by default.
- Honor configured send interval.
- Advance simulation deterministically per interval.
- Log connection lifecycle, IMEI accept/reject, packet send result, and acknowledgement count.
- Stop cleanly on abort signal or process termination hook.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Parser fixture receives multiple AVL packets over time.
- Same route, style, seed, and interval produce the same sent packet sequence.
- Send interval controls simulation advancement and packet emission.
- Clean shutdown closes the TCP session.
- TCP session code does not generate telemetry directly; it consumes mapped packet inputs.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Reconnect after disconnect.
- Multiple-device supervision.

## TASK-020: Add Reconnectable Single-Device Runner

**Status:** blocked

**Depends on:** TASK-019

**Goal**

Reconnect a single device after TCP connection loss using the configured fixed delay.

**Scope**

- Add runner lifecycle around one device session.
- Reconnect after connect failure, socket close, or parser restart.
- Repeat IMEI handshake after reconnect.
- Do not reconnect after IMEI rejection.
- Do not silently retry after acknowledgement mismatch.
- Preserve deterministic simulation sequence across reconnect behavior.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- Parser fixture can close a socket and observe reconnection after fixed delay.
- Reconnected session sends a fresh IMEI handshake before AVL data.
- IMEI rejection permanently stops that device runner.
- AVL acknowledgement mismatch fails that device runner explicitly.
- Reconnect tests assert parser-visible behavior.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Multiple-device runtime.
- Exponential backoff.
- TLS.

## TASK-021: Add Multi-Device Runtime

**Status:** blocked

**Depends on:** TASK-020

**Goal**

Run one independent reconnectable device runner and TCP session per configured IMEI.

**Scope**

- Start one runner per IMEI.
- Keep runner failures isolated.
- Ensure each device has independent TCP session state.
- Provide deterministic per-device simulation inputs from shared route/style/seed configuration.
- Stop all runners cleanly.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- At least two IMEIs run concurrently.
- Parser fixture receives distinct handshakes and AVL packets per IMEI.
- One rejected or failed IMEI does not hide successful sessions.
- Each IMEI owns an independent TCP session.
- Stop shuts down every runner cleanly.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Fleet management backend behavior.
- Device commands.

## TASK-022: Add End-To-End Parser-Visible Tests

**Status:** blocked

**Depends on:** TASK-015, TASK-021

**Goal**

Verify the complete virtual vehicle-to-parser flow through existing modules and fixtures.

**Scope**

- Compose configuration, JSON route, driving style, simulation, device-profile mapping, Codec 8 Extended framing, TCP session, acknowledgements, reconnect, and multi-device runtime.
- Use the reusable parser fixture.
- Reuse existing packet validation helpers instead of duplicating lower-level tests.
- Include a dry-run determinism check.

**Relevant Files**

- `AGENTS.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `references/traccar/TeltonikaFrameDecoder.java`
- `references/traccar/TeltonikaProtocolDecoder.java`
- `src/`
- `tests/`
- `tests/fixtures/`

**Acceptance Criteria**

- A local parser verifies complete IMEI handshake and AVL packet exchange.
- At least one received packet validates as Codec 8 Extended with correct length, record counts, and CRC.
- End-to-end test covers route-following vehicle simulation, not only fixed packet generation.
- End-to-end test covers at least two IMEIs or reconnect behavior.
- Dry-run output is deterministic for fixed route, driving style, seed, and interval.

**Verification**

```sh
npm run build
npm run typecheck
npm test
```

**Out of Scope**

- Live Traccar server testing.
- Cloud deployment.
- Full matrix duplication of lower-level tests.

## TASK-023: Document CLI Usage And MVP Limits

**Status:** blocked

**Depends on:** TASK-022

**Goal**

Document how to run the virtual Teltonika vehicle simulator and what the MVP supports.

**Scope**

- Update README with local setup and npm commands.
- Document CLI flags and environment variables.
- Document JSON route format and loop-at-end behavior.
- Document driving styles, simulation seed, send interval, and determinism guarantees.
- Document dry-run hex dump, single IMEI, multiple IMEIs, and reconnect behavior.
- Document protocol limits and non-goals.
- Mention that `references/` files are read-only server-side evidence.

**Relevant Files**

- `AGENTS.md`
- `README.md`
- `docs/teltonika-gps-device-simulator-prd.md`
- `references/traccar/README.md`
- `src/`

**Acceptance Criteria**

- README explains running with parser host, parser port, and IMEI.
- README includes route JSON, driving style, seed, dry-run, and multi-IMEI examples.
- README states Codec 8 Extended is the only supported codec.
- README states UDP, TLS, web dashboard, cloud deployment, trip database, and command-response simulation are out of scope.
- README documents the virtual vehicle model, not only packet generation.

**Verification**

```sh
npm run build
npm run typecheck
npm test
npm run cli -- --help
```

**Out of Scope**

- Web UI.
- Package publishing.
- New product behavior.

## Traceability Matrix

| PRD requirement                                                                                                                                | Covered by                                                 |
| ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| TypeScript, Node.js, `net`, `Buffer`, Vitest, minimal dependencies                                                                             | TASK-001                                                   |
| CLI and environment configuration                                                                                                              | TASK-002                                                   |
| Parser host and parser port                                                                                                                    | TASK-002, TASK-023                                         |
| IMEI or list of IMEIs                                                                                                                          | TASK-002, TASK-021, TASK-023                               |
| Send interval                                                                                                                                  | TASK-002, TASK-008, TASK-019                               |
| Reconnect delay                                                                                                                                | TASK-002, TASK-020                                         |
| Driving style and seed configuration                                                                                                           | TASK-002, TASK-007, TASK-008, TASK-023                     |
| Teltonika device profile configuration                                                                                                         | TASK-002, TASK-010                                         |
| Route, driving-style, device-profile, and vehicle-state domain models                                                                          | TASK-003                                                   |
| AVL domain models                                                                                                                              | TASK-004                                                   |
| Longitude and latitude Teltonika signed integer encoding                                                                                       | TASK-004, TASK-011, TASK-013                               |
| JSON route file loading                                                                                                                        | TASK-005                                                   |
| Route validation                                                                                                                               | TASK-005                                                   |
| Route geometry and heading                                                                                                                     | TASK-006                                                   |
| Smooth position interpolation                                                                                                                  | TASK-006, TASK-009, TASK-022                               |
| End-of-route loops to first point                                                                                                              | TASK-006, TASK-019, TASK-023                               |
| `eco`, `normal`, and `aggressive` driving styles                                                                                               | TASK-007, TASK-009, TASK-023                               |
| Same route, style, seed, and interval produces same telemetry                                                                                  | TASK-008, TASK-009, TASK-015, TASK-019, TASK-022           |
| Different styles produce different behavior on same route                                                                                      | TASK-007, TASK-009, TASK-015                               |
| Speed, acceleration, braking, stopping, idling behavior                                                                                        | TASK-009                                                   |
| Ignition and movement behavior                                                                                                                 | TASK-009, TASK-011                                         |
| Harsh acceleration and harsh braking events                                                                                                    | TASK-009, TASK-010, TASK-011                               |
| Default Codec 8 Extended device profile                                                                                                        | TASK-010                                                   |
| Device profile maps ignition, movement, voltage, and events                                                                                    | TASK-010, TASK-011                                         |
| Vehicle state maps into AVL GPS and IO values                                                                                                  | TASK-011                                                   |
| Timestamp, priority, GPS element, event IO ID, and IO elements                                                                                 | TASK-004, TASK-011, TASK-013                               |
| CRC-16/IBM over Teltonika data field                                                                                                           | TASK-012, TASK-014                                         |
| Independent CRC vector or known packet fixture                                                                                                 | TASK-012                                                   |
| Codec 8 Extended AVL record encoding                                                                                                           | TASK-013                                                   |
| TCP AVL packet preamble, length, codec ID, record counts, CRC                                                                                  | TASK-014                                                   |
| Encoder supports one or more records per packet                                                                                                | TASK-014                                                   |
| Runtime default sends one AVL record per packet                                                                                                | TASK-019                                                   |
| Dry-run deterministic hex dump                                                                                                                 | TASK-015, TASK-022, TASK-023                               |
| Reusable local parser fixture                                                                                                                  | TASK-016                                                   |
| TCP client connection to parser                                                                                                                | TASK-017, TASK-018, TASK-019                               |
| IMEI handshake two-byte length plus ASCII IMEI                                                                                                 | TASK-017                                                   |
| IMEI acknowledgement `0x01` accepted and `0x00` rejected                                                                                       | TASK-017, TASK-020                                         |
| Rejected IMEI stops without reconnecting                                                                                                       | TASK-017, TASK-020                                         |
| AVL send after IMEI acceptance                                                                                                                 | TASK-018                                                   |
| 4-byte accepted-record acknowledgement                                                                                                         | TASK-018                                                   |
| Acknowledgement mismatch fails session explicitly                                                                                              | TASK-018, TASK-020                                         |
| Repeated send loop until stopped                                                                                                               | TASK-019                                                   |
| Clean shutdown                                                                                                                                 | TASK-019, TASK-021                                         |
| Connection lifecycle, send result, and acknowledgement logs                                                                                    | TASK-019                                                   |
| Reconnect after TCP connection loss                                                                                                            | TASK-020                                                   |
| One independent runner and TCP session per IMEI                                                                                                | TASK-021                                                   |
| At least two IMEIs concurrently                                                                                                                | TASK-021, TASK-022                                         |
| Local parser verifies complete handshake and AVL exchange                                                                                      | TASK-016, TASK-018, TASK-022                               |
| External parser can decode at least one Codec 8 Extended packet                                                                                | TASK-014, TASK-018, TASK-022                               |
| Vehicle simulation separated from Codec and TCP layers                                                                                         | TASK-003, TASK-004, TASK-009, TASK-011, TASK-013, TASK-018 |
| Route layer does not encode packets or open TCP                                                                                                | TASK-005, TASK-006                                         |
| Device-profile layer does not implement route movement or sockets                                                                              | TASK-010, TASK-011                                         |
| Codec layer contains no route, style, reconnect, or socket logic                                                                               | TASK-013, TASK-014                                         |
| TCP session does not generate telemetry                                                                                                        | TASK-017, TASK-018, TASK-019                               |
| README and CLI documentation                                                                                                                   | TASK-023                                                   |
| References under `references/` are read-only                                                                                                   | TASK-001, TASK-012, TASK-016, TASK-023                     |
| Non-goals: no UDP, TLS, web dashboard, cloud deployment, historical trip database, command-response simulation, or non-Codec 8 Extended codecs | TASK-001, TASK-014, TASK-020, TASK-023                     |
