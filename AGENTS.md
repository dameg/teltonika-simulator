# Agent Instructions

## Sources of Truth

- Product requirements:
  `docs/teltonika-gps-device-simulator-prd.md`

- Implementation task plan:
  `docs/tasks/teltonika-gps-device-simulator-tasks.md`

- Traccar protocol reference rules:
  `references/traccar/README.md`

- External protocol reference files:
  `references/traccar/`

When requirements conflict, use this priority:

1. Current PRD.
2. Repository-level agent instructions.
3. Current active task.
4. Official Teltonika documentation.
5. Traccar implementation references.
6. Existing implementation details.

Traccar is implementation evidence from the parser/server side. It is not the
authoritative Teltonika protocol specification.

## Product Model

The project represents a virtual Teltonika device installed in a virtual
vehicle.

The vehicle:

- follows a configured route;
- moves over time between route points;
- uses a configured driving-style profile;
- produces deterministic vehicle-state snapshots;
- maps vehicle state into Teltonika GPS and IO values;
- sends Codec 8 Extended AVL packets to an external TCP parser.

The project is not only a packet generator. It must simulate meaningful,
repeatable vehicle behavior.

## Architecture Boundaries

- Route loading and route geometry belong to the route layer.
- Driving-style behavior belongs to the simulation layer.
- Vehicle simulation produces deterministic vehicle-state snapshots.
- Teltonika IO mappings belong to the device-profile layer.
- AVL domain models must remain independent from binary serialization.
- Codec encoding must not contain route or driving-style logic.
- TCP session code must not generate telemetry.
- One independent device runner is used per IMEI.

### Route layer

Responsible for:

- loading route definitions;
- validating route files;
- exposing route points, speed limits, and route metadata;
- calculating route geometry where needed.

The route layer must not encode Teltonika packets or open TCP connections.

### Vehicle simulation layer

Responsible for:

- advancing simulation time;
- interpolating position between route points;
- applying acceleration and braking;
- applying driving-style behavior;
- generating speed, heading, altitude, ignition, movement, and driving events;
- producing deterministic vehicle-state snapshots.

The simulation layer must not know Codec 8 Extended byte layout or TCP session
details.

### Driving-style layer

Responsible for defining behavior such as:

- target acceleration;
- braking intensity;
- speed variation;
- idling behavior;
- cornering behavior;
- harsh acceleration probability;
- harsh braking probability.

Required MVP driving styles:

- `eco`
- `normal`
- `aggressive`

The same route, driving style, seed, and interval must produce the same vehicle
state sequence.

### Device-profile layer

Responsible for:

- mapping vehicle state into Teltonika IO element IDs;
- defining device-specific defaults;
- mapping ignition, movement, voltage, and driving events;
- producing AVL-ready values from generic vehicle state.

The device profile must not implement route movement or socket communication.

### AVL domain layer

Responsible for:

- typed AVL records;
- GPS elements;
- IO elements;
- timestamps;
- priority;
- event IO ID.

The AVL domain model must remain independent from binary serialization.

### Codec layer

Responsible for:

- CRC calculation;
- Codec 8 Extended record encoding;
- packet framing;
- length fields;
- record counts;
- binary byte order.

The Codec encoder must not contain route, driving-style, reconnect, or socket
logic.

### TCP session layer

Responsible for:

- opening an outbound TCP connection;
- sending the IMEI handshake;
- reading IMEI acceptance or rejection;
- sending AVL packets;
- reading accepted-record acknowledgements;
- detecting disconnects;
- reconnecting after connection loss.

The TCP session must not generate telemetry.

### Runtime layer

Responsible for:

- creating one device runner per IMEI;
- connecting simulation output to AVL mapping and TCP transport;
- handling clean shutdown;
- coordinating concurrent devices.

## Implementation Stack

Use:

- TypeScript;
- Node.js;
- Node.js built-in `net` module for TCP communication;
- Node.js `Buffer` APIs for binary encoding;
- Vitest for unit and integration tests.

Prefer minimal production dependencies.

Do not introduce:

- NestJS;
- Express;
- Fastify;
- a web framework;
- a database;
- a message broker;

unless the PRD is explicitly updated to require one.

## Task Execution

1. Read this file.
2. Read the complete PRD.
3. Read the task plan.
4. Select the first task with status `ready`.
5. Verify that every task dependency has status `done`.
6. Read every file listed under the task's `Relevant Files`.
7. Implement exactly one task.
8. If the task conflicts with the PRD or this file, stop and record the conflict instead of implementing it.
9. Do not silently expand the task scope.
10. Run every verification command listed in the task.
11. Mark the task `done` only when all acceptance criteria pass.
12. Change blocked tasks to `ready` only when every dependency is `done`.
13. Commit the completed task separately.
14. Stop after completing one task.

Do not include unrelated formatting or refactors in a task commit.
Do not modify generated or reference files unless the active task explicitly requires it.

## Task Status Rules

Allowed execution statuses:

- `blocked`
- `ready`
- `in_progress`
- `done`
- `failed`

Before implementation:

- change the active task from `ready` to `in_progress`.

After successful verification:

- change it to `done`;
- unblock newly available tasks.

After failed verification that cannot be fixed within the task scope:

- change it to `failed`;
- record the reason;
- do not mark dependent tasks as ready.

## Behavioral Decisions

Use these MVP decisions unless the PRD is updated:

- Route format: JSON.
- End-of-route behavior: loop to the first route point.
- IMEI rejection with `0x00`: stop that device session without reconnecting.
- AVL acknowledgement count mismatch: fail that device session explicitly.
- TCP connection loss: reconnect after the configured fixed delay.
- One independent device runner and TCP session per IMEI.
- Default runtime behavior: one AVL record per packet.
- Encoder capability: one or more AVL records per packet.
- Generated telemetry and route playback must be deterministic.
- Files under `references/` are read-only.

## Testing Rules

Tests should focus on observable behavior.

Prefer:

- deterministic unit tests for simulation;
- known coordinate conversion tests;
- CRC test vectors;
- binary packet structure tests;
- local TCP parser integration tests;
- parser-visible assertions;
- fixed seeds and fixed routes.

Do not:

- weaken tests to make them pass;
- remove failing protocol assertions without justification;
- rely on sleep-heavy timing tests when deterministic clocks or explicit stop
  controls can be used;
- copy Traccar behavior blindly without independent validation.

## External References

Files under `references/traccar/` are read-only.

Use them to understand:

- IMEI framing;
- AVL packet framing;
- Codec 8 Extended decoding order;
- acknowledgement behavior;
- protocol test payloads.

Do not use them as a source for:

- route simulation;
- driving-style behavior;
- vehicle physics;
- project architecture;
- runtime orchestration.

Do not modify files under `references/`.
