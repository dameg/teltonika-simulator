# PRD: Teltonika GPS Device Simulator

## Problem Statement

Teams building or validating GPS ingestion systems need a repeatable way to test Teltonika-style TCP integrations without relying on physical trackers, SIM cards, cellular coverage, or real vehicles. The simulator must behave like a real Teltonika GPS device: connect to an external TCP parser, identify itself with an IMEI handshake, send binary AVL frames, and handle parser acknowledgements.

## Solution

Build a Teltonika GPS device simulator that opens outbound TCP connections to a configurable parser endpoint and sends valid binary Teltonika AVL packets. The simulator represents a virtual Teltonika device installed in a virtual vehicle. The vehicle follows a configured route, and its telemetry is influenced by a configurable driving style and deterministic simulation seed.

The first version should focus on the smallest useful behavior: one or more simulated devices, configurable IMEI values, deterministic vehicle movement, generated GPS telemetry, Codec 8 Extended-compatible binary framing, acknowledgement handling, reconnects, route playback, and basic driving-style profiles.

## Goals

- Simulate real Teltonika device TCP behavior closely enough for parser integration tests.
- Send binary frames, not JSON or text.
- Support configurable external parser host and port.
- Support unique simulated devices identified by IMEI.
- Generate valid AVL records with timestamp, priority, GPS element, IO elements, record count, and CRC.
- Handle the initial IMEI handshake and server acknowledgement.
- Continue sending telemetry at configurable intervals until stopped.
- Provide deterministic scenarios for repeatable tests.
- Simulate vehicle movement over time instead of only emitting isolated GPS points.
- Allow the same route to produce different telemetry based on the selected driving style.
- Keep vehicle simulation, Teltonika device mapping, protocol encoding, and TCP session behavior separate.

## Non-Goals

- Full Teltonika firmware emulation.
- UDP support in the first version.
- Any Teltonika codec other than Codec 8 Extended.
- Real cellular modem behavior.
- Device management protocols, SMS commands, firmware update flows, or CAN bus simulation.
- A production fleet management backend.

## User Stories

1. As a backend developer, I want to point the simulator at my parser host and port, so that I can test ingestion locally or in staging.
2. As a parser developer, I want the simulator to send real binary Teltonika-style frames, so that my parser is exercised through the same protocol surface as production devices.
3. As a QA engineer, I want to configure an IMEI, so that I can test device registration and lookup behavior.
4. As a QA engineer, I want to run multiple simulated devices, so that I can test concurrent TCP sessions.
5. As a QA engineer, I want repeatable telemetry scenarios, so that failed parser tests can be reproduced.
6. As an integration tester, I want generated GPS coordinates, speed, heading, altitude, and satellite count, so that normal AVL decoding paths are covered.
7. As an integration tester, I want route playback from predefined points, so that movement over time can be tested.
8. As a parser developer, I want configurable send intervals, so that I can test low-volume and burst-like ingestion.
9. As a parser developer, I want the simulator to perform the IMEI handshake, so that connection authorization behavior is tested.
10. As a parser developer, I want the simulator to wait for parser acknowledgement before sending AVL frames, so that handshake failures are visible.
11. As a parser developer, I want the simulator to read AVL acknowledgements, so that acknowledgement handling bugs are caught.
12. As an operations engineer, I want reconnect behavior after TCP disconnects, so that parser restart scenarios can be tested.
13. As an operations engineer, I want connection and send logs, so that I can diagnose failed parser sessions.
14. As a developer, I want invalid acknowledgement failures to be reported clearly, so that parser protocol mismatches are easy to identify.
15. As a developer, I want a dry-run packet dump mode, so that I can inspect generated hex without opening a socket.
16. As a developer, I want minimal setup, so that the simulator can run in local development and CI.
17. As a CI maintainer, I want deterministic output with fixed seeds or fixed routes, so that automated tests do not fail randomly.
18. As a QA engineer, I want scenarios for ignition on/off, movement, idle, and no GPS fix, so that common fleet states are covered.
19. As a parser developer, I want basic IO elements included, so that parser IO decoding is tested.
20. As a product owner, I want this simulator documented, so that new developers can test parser integrations without a real tracker.
21. As a developer, I want to select a driving style, so that I can test calm, normal, and aggressive driving behavior.
22. As a developer, I want the same route to produce different telemetry for different driving styles.
23. As a QA engineer, I want a fixed simulation seed, so that the same route and driving style produce the same telemetry sequence.
24. As a developer, I want vehicle position to progress smoothly between route points instead of jumping directly from point to point.
25. As a parser developer, I want Teltonika IO elements to reflect simulated ignition, movement, voltage, and driving events.
26. As a developer, I want device profiles to define model-specific IO mappings without changing the simulation engine.

## Simulation Model

The simulator must model both the Teltonika protocol and the behavior of a vehicle moving along a predefined route.

Simulation input consists of:

- A route describing the path travelled by the vehicle.
- A driving-style profile describing acceleration, braking, speed variation, idling, and harsh-driving behavior.
- A Teltonika device profile describing supported IO element IDs and default device values.
- A deterministic seed for repeatable runs.
- A simulation interval controlling how frequently vehicle state is advanced and AVL records are emitted.

The simulation engine produces vehicle-state snapshots over time. Each snapshot is mapped to a Teltonika AVL record and then encoded as a Codec 8 Extended binary packet.

The architecture must preserve these boundaries:

- Route and driving-style logic belongs to the vehicle simulation layer.
- Teltonika IO mapping belongs to the device-profile layer.
- Binary serialization belongs to the Codec 8 Extended encoder.
- Connection lifecycle and acknowledgement handling belong to the TCP session layer.
- The protocol encoder must not contain route or driving-style logic.
- The TCP session must not contain telemetry-generation logic.

For the MVP, the simulator must support these driving styles:

- `eco`
- `normal`
- `aggressive`

The same route, driving style, seed, and interval must produce the same sequence of vehicle states and AVL records. Using a different driving style for the same route must produce different speed, acceleration, braking, idling, and harsh-driving-event behavior.

## Protocol Requirements

- The simulator opens a TCP client connection to the configured parser.
- The simulator sends an IMEI handshake using Teltonika TCP framing: two-byte IMEI length followed by the ASCII IMEI.
- The simulator expects the parser to respond with a one-byte acknowledgement where `0x01` accepts the device and `0x00` rejects it.
- After acceptance, the simulator sends AVL data packets using Teltonika binary framing:
  - 4-byte zero preamble.
  - 4-byte data field length.
  - Codec ID, initially Codec 8 Extended (`0x8E`).
  - Number of data records.
  - One or more AVL records.
  - Repeated number of data records.
  - 4-byte CRC-16/IBM over the data field.
- The simulator expects the parser to acknowledge AVL packets with a 4-byte integer containing the accepted record count.
- The simulator treats mismatched acknowledgement counts as send failures.
- The encoder must support one or more AVL records per packet.
- The default runtime behavior sends one AVL record per packet.

## Functional Requirements

- Configuration:
  - Parser host.
  - Parser port.
  - Device IMEI or list of IMEIs.
  - Send interval.
  - Codec 8 Extended packet settings.
  - Scenario or route source.
  - Reconnect delay.
  - Driving style.
  - Deterministic simulation seed.
  - Teltonika device profile.
- Telemetry generation:
  - Timestamp in milliseconds.
  - Priority.
  - Longitude and latitude encoded as signed integers in Teltonika format.
  - Altitude.
  - Angle.
  - Satellites.
  - Speed.
  - Event IO ID.
  - Basic IO elements.
- Vehicle simulation:
  - Load a deterministic route from a JSON file.
  - Interpolate vehicle position between route points.
  - Calculate heading from route geometry.
  - Apply route speed limits where provided.
  - Generate acceleration, deceleration, braking, idling, and stopping behavior.
  - Support `eco`, `normal`, and `aggressive` driving styles.
  - Produce repeatable output for the same route, driving style, seed, and interval.
  - Generate ignition and movement state transitions.
  - Generate common driving events such as harsh acceleration and harsh braking.
  - Loop from the first route point after reaching the end of the route.
- Device profiles:
  - Define Teltonika IO element mappings independently from route simulation.
  - Provide one default Codec 8 Extended device profile.
  - Map simulated vehicle state into GPS and IO AVL fields.
  - Keep device-profile definitions replaceable without changing the simulation engine.
- Runtime behavior:
  - Connect.
  - Send IMEI.
  - Wait for accept/reject.
  - Send AVL packets repeatedly.
  - Read acknowledgements.
  - Reconnect on connection loss.
  - Stop cleanly on process termination.
- Observability:
  - Log connection lifecycle.
  - Log IMEI accept/reject.
  - Log packet send result.
  - Log acknowledgement count.
  - Optional hex dump for packets.

## Implementation Decisions

- Implement the simulator as a TCP client because real devices initiate connections to the parser.
- Start with Codec 8 Extended because it covers modern Teltonika AVL packets with extended IO element IDs and larger IO payloads.
- Keep packet encoding isolated behind a small binary encoder module so tests can validate packets without opening TCP sockets.
- Keep TCP session behavior separate from packet encoding so parser acknowledgement handling can be tested independently.
- Use deterministic route/scenario input for test runs.
- Use generated telemetry only when no route file is supplied.
- Prefer configuration through CLI flags and environment variables before adding a UI.
- Support multiple devices by running one TCP session per IMEI.
- Treat protocol mismatches as explicit errors instead of silently retrying forever.
- Implement the simulator in TypeScript on Node.js.
- Use the Node.js built-in `net` module for TCP communication and `Buffer` APIs for binary encoding.
- Use Vitest for unit and integration tests.
- Keep production dependencies minimal and do not use NestJS or another web framework for the simulator core.
- Use JSON as the route-file format for the first version.
- Loop route playback after the final route point.
- Stop a rejected IMEI session without reconnecting it.
- Fail a device session explicitly on AVL acknowledgement count mismatch.
- Reconnect only after TCP connection loss or parser restart, using the configured fixed delay.
- Run one independent device runner and TCP session per IMEI.
- Separate route loading, route interpolation, driving-style behavior, vehicle simulation, device-profile mapping, Codec encoding, and TCP transport into distinct modules.

- Use the selected Traccar Teltonika protocol files as server-side
  implementation references and derive the inverse device-side behavior needed
  by the simulator.

## Testing Decisions

- The highest-value test seam is the simulator's external TCP behavior against a local test parser.
- Packet encoder tests should assert binary frame structure, length fields, record count fields, and CRC correctness.
- Session tests should use a local TCP server that accepts IMEI, acknowledges AVL records, and records received packets.
- Reconnect tests should close the server-side socket and assert the simulator reconnects after the configured delay.
- Deterministic route tests should verify that known coordinates produce known encoded latitude and longitude values.
- Simulation tests should verify that the same route, driving style, seed, and interval produce the same vehicle-state sequence.
- Simulation tests should verify that different driving styles produce observably different speed, acceleration, braking, idling, and harsh-event behavior on the same route.
- Route interpolation tests should verify smooth position progression between route points.
- Device-profile tests should verify that simulated vehicle state maps to the expected Teltonika IO element IDs and values.
- Tests should validate behavior visible to the parser, not internal helper calls.
- Translate valid Teltonika payload examples from Traccar decoder tests into
  simulator-side encoder fixtures, while independently validating frame
  lengths, record counts, field encoding, and CRC.

## Relevant Files

### Traccar Teltonika Protocol Reference

The selected files under `references/traccar/` are read-only external
implementation references derived from the Traccar project.

Traccar implements the parser/server side of the Teltonika protocol. This
simulator must implement the corresponding device-side behavior.

- `references/traccar/README.md`
  - Describes the source, pinned revision, license, intended use, and
    interpretation rules for the Traccar reference files.
  - Read this file before analyzing the Traccar implementation.

- `references/traccar/TeltonikaProtocolDecoder.java`
  - Primary reference for:
    - IMEI identification handling.
    - Codec 8 Extended packet decoding.
    - AVL record structure.
    - GPS element fields.
    - IO element decoding.
    - Parser acknowledgement behavior.

- `references/traccar/TeltonikaFrameDecoder.java`
  - Reference for TCP message boundaries and length-based framing.
  - Useful for understanding the distinction between:
    - IMEI identification messages.
    - AVL data packets.

- `references/traccar/TeltonikaProtocolDecoderTest.java`
  - Primary source of hexadecimal protocol examples and test fixtures.
  - Use these examples to derive deterministic simulator encoder tests.

- `references/traccar/TeltonikaProtocol.java`
  - Reference for the Traccar Teltonika server pipeline and handler ordering.

- `references/traccar/TeltonikaProtocolEncoder.java`
  - Secondary reference for server-to-device commands.
  - It is not required for the initial simulator version unless
    command-response behavior is added.

### Interpretation Rules

When using the Traccar reference files:

- Where Traccar reads an IMEI, the simulator sends an IMEI.
- Where Traccar sends `0x01` or `0x00`, the simulator reads and validates it.
- Where Traccar decodes an AVL packet, the simulator encodes and sends it.
- Where Traccar sends a 4-byte accepted-record count, the simulator reads and
  validates that count.
- Treat Traccar as implementation evidence, not as the authoritative Teltonika
  specification.
- Official Teltonika documentation takes precedence if it conflicts with
  Traccar.
- Do not copy Traccar application architecture into the simulator.
- Do not modify files under `references/traccar/`.

## Acceptance Criteria

- A user can run the simulator with parser host, parser port, and IMEI.
- The external parser receives an IMEI handshake.
- If the parser responds with `0x01`, the simulator sends AVL binary frames.
- If the parser responds with `0x00`, the simulator stops that session and reports rejection.
- The external parser can decode at least one Codec 8 Extended packet from the simulator.
- The simulator reads parser AVL acknowledgement counts.
- The simulator reports an error when the acknowledgement count does not match the sent record count.
- A local test parser can verify a complete handshake and AVL packet exchange.
- The simulator can run at least two IMEIs concurrently.
- The simulator can replay a deterministic route.
- The simulator supports `eco`, `normal`, and `aggressive` driving styles.
- The same route, driving style, seed, and interval produce the same telemetry sequence.
- Different driving styles produce different vehicle behavior on the same route.
- Vehicle position progresses smoothly between route points.
- A default Teltonika device profile maps ignition, movement, voltage, and driving events into Codec 8 Extended IO elements.

## Out of Scope

- Codec 16 and other Teltonika-specific variants.
- UDP transport.
- TLS transport.
- Web dashboard.
- Historical trip database.
- Cloud deployment automation.
- Real device command response simulation.

## Further Notes

- Codec 8 Extended is the only supported codec for this simulator.
- Add a web UI only after CLI usage becomes too limiting.
- Add more device profiles only when tests need model-specific IO fields.
- The primary product goal is a virtual Teltonika device in a virtual vehicle, not only a valid packet generator.
