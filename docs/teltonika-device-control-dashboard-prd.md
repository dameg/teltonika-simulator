# PRD: Teltonika Device Control Dashboard

## Problem Statement

The repository can already simulate one or more Teltonika TCP devices from the
CLI and expose a minimal raw/decoded dashboard backend, but there is no usable
operator-facing control plane for setting up devices, starting and stopping
simulations, tracking device state, or reviewing simulator logs in one place.

The next iteration needs a real Node.js dashboard, implemented with NestJS,
where an operator can register the IMEIs they want to simulate, configure the
runtime inputs for those devices, launch `n` simulated devices concurrently,
and observe their status and logs without relying on CLI-only workflows.

## Solution

Build a NestJS-based local dashboard application that reuses the existing
simulator core as its engine and adds a web control plane for device setup,
simulation lifecycle management, and logging.

The first working version should focus on the smallest complete operator loop:

1. create or import devices with user-provided IMEIs;
2. configure simulator settings needed to run them;
3. start and stop one or many simulated devices from the dashboard;
4. monitor per-device and global runtime state;
5. inspect logs for setup, connection, handshake, packet send, acknowledgement,
   reconnect, and failure events.

This iteration stops at dashboard-based simulation control and observability.
Forwarding data into another telemetry host owned by the user application is a
later integration and is explicitly out of scope here.

## Goals

- Provide a fully working NestJS dashboard for local or internal use.
- Allow an operator to register one or more devices using explicit IMEIs.
- Allow an operator to configure and run `n` simulated devices concurrently.
- Reuse the existing simulation, protocol, and TCP session logic instead of
  rebuilding the simulator in a separate service.
- Show clear device lifecycle state such as configured, starting, running,
  stopped, rejected, and failed.
- Show per-device logs and global system logs in the dashboard.
- Keep the first version operationally simple by using in-memory repositories
  and storage with manual clearing.
- Keep simulation logic independent from the NestJS web layer.
- Keep downstream telemetry forwarding out of scope for this iteration.

## Non-Goals

- Sending simulator output into the future external telemetry host.
- Multi-tenant accounts, user management, or authentication in the first
  version.
- Fleet analytics, trip history, reports, alerts, or map-heavy visualization.
- Device command sending, firmware updates, SMS workflows, or CAN bus
  simulation.
- Additional Teltonika codecs beyond the existing Codec 8 Extended scope.
- Cloud deployment automation or production-grade horizontal scaling.

## Current Repository Fit

- Existing simulator runtime already supports:
  - multi-IMEI execution;
  - deterministic route-based simulation;
  - IMEI handshake;
  - AVL packet send and acknowledgement handling;
  - reconnect behavior;
  - parser-visible logging.
- Existing dashboard work already supports:
  - a parser/backend mode;
  - raw frame capture;
  - decoded message inspection.
- Missing for this iteration:
  - a NestJS application shell;
  - in-memory device configuration management;
  - dashboard-driven simulator lifecycle control;
  - structured dashboard log views tied to device runs;
  - a browser UI for setup and monitoring.

## User Stories

1. As an operator, I want to add devices by IMEI, so that I can simulate the
   exact trackers I care about.
2. As an operator, I want to import many IMEIs at once, so that I can set up a
   larger simulation quickly.
3. As an operator, I want to configure parser host, parser port, route,
   driving style, seed, interval, and device profile per device or per batch,
   so that I can run realistic scenarios without the CLI.
4. As an operator, I want to start one device or all configured devices, so
   that I can test single-device and multi-device flows.
5. As an operator, I want to stop one device or all running devices, so that I
   can control active simulations cleanly.
6. As an operator, I want to see whether each device is configured, running,
   rejected, reconnecting, stopped, or failed, so that I know what is
   happening without reading raw terminal output.
7. As an operator, I want to view logs per device, so that I can diagnose IMEI
   rejection, TCP failures, or AVL acknowledgement mismatches.
8. As a developer, I want the dashboard to reuse the current simulator modules,
   so that protocol and simulation behavior stay consistent across CLI and UI.
9. As a developer, I want device configuration and recent logs persisted
   in memory for the current process, so that the first version stays simple
   while still being usable during an active session.
10. As a future integrator, I want simulator control separated from telemetry
   forwarding, so that the next integration step can add output routing without
   rewriting the dashboard.

## Functional Requirements

### Device Management

- Create a device record with:
  - IMEI;
  - display name or label;
  - enabled/disabled flag;
  - parser host;
  - parser port;
  - route source;
  - driving style;
  - deterministic seed;
  - send interval;
  - reconnect delay;
  - device profile;
  - optional packet-count limit for bounded test runs.
- Validate IMEI input and reject empty, malformed, or duplicate IMEIs.
- Support bulk IMEI import from pasted text or a simple newline/comma-separated
  list.
- Allow editing and deleting configured devices when they are not running.
- Each device owns its own simulator settings; shared templates and batch
  profile systems are out of scope for this iteration.

### Simulation Control

- Start a single configured device simulation from the dashboard.
- Start multiple selected devices concurrently from the dashboard.
- Start all enabled devices with one action.
- Stop a single running device cleanly.
- Stop all running devices cleanly.
- Prevent duplicate starts for the same IMEI while a run is already active.
- Reflect final outcomes such as completed, stopped, rejected, or failed.

### Runtime Status

- Show a device list with:
  - IMEI;
  - label;
  - current status;
  - last start time;
  - last stop time;
  - last error summary where relevant.
- Show aggregate counts such as configured, running, stopped, and failed.
- Refresh status without requiring a full page reload by using client-side
  polling.

### Logging

- Capture structured runtime events for:
  - device created or updated;
  - simulation start request;
  - TCP connect;
  - IMEI send;
  - IMEI accept or reject;
  - AVL packet send;
  - AVL acknowledgement count;
  - reconnect attempt;
  - stop request;
  - failure and error details.
- Expose logs in the dashboard by:
  - device;
  - time order;
  - severity;
  - event type.
- Keep recent logs readily visible in the UI for the current process lifetime.
- Provide a manual clear action for in-memory logs and runtime history.

### Dashboard UI

- Provide at least these screens or views:
  - device list;
  - device create/edit form;
  - device detail with status and logs;
  - run overview with aggregate counts and recent events.
- Use React for the frontend.
- Keep the UI functional on desktop first; mobile polish is secondary.
- Use polling for live status and log refresh instead of introducing
  WebSocket or Server-Sent Events in the first version.

### Storage

- Keep device definitions, run metadata, and logs in memory only.
- Provide explicit manual clear actions for device data and logs where needed.
- Accept that application restart clears configured devices, run metadata, and
  logs.
- Active runs do not resume automatically after restart.

## Architecture Boundaries

- Simulation logic remains in the existing simulator modules.
- Protocol encoding, handshake, acknowledgement, and reconnect behavior remain
  outside the NestJS controller and view layers.
- NestJS owns HTTP routes, application modules, persistence wiring, and the
  dashboard API/UI surface.
- React owns client-side rendering and polling-based refresh behavior.
- A runtime orchestration service should manage active simulator instances per
  IMEI.
- Persistence should store device definitions, run records, and log entries,
  but should not embed protocol logic.
- For this iteration, that storage boundary is still an in-memory repository.
- The future telemetry-host integration must sit behind a separate output
  boundary and not be coupled into the first dashboard control loop.

## Implementation Decisions

- Implement the dashboard in NestJS because this iteration explicitly needs a
  Node.js application framework with clear module boundaries.
- Use React for the frontend and keep live updates on simple polling intervals.
- Reuse the current TypeScript simulator core in-process instead of spawning
  the CLI as a child process for each device.
- Prefer one runtime manager service that owns active sessions keyed by IMEI.
- Use in-memory repositories first instead of adding a database now.
- Reuse existing config shapes and simulator options where possible so CLI and
  dashboard runs stay aligned.
- Treat IMEI rejection and AVL acknowledgement mismatch as explicit visible run
  outcomes, not silent retries.
- Keep logging structured so future export to another telemetry system or log
  sink can be added without changing simulation behavior.
- Use manual toggle controls to start and stop device runs; do not auto-resume
  runs after restart.

## Testing Decisions

- Add unit tests for device configuration validation and duplicate IMEI
  handling.
- Add service tests for simulator start/stop orchestration and active-run
  tracking.
- Add repository tests for in-memory device, run, and log storage behavior.
- Add parser-visible integration tests proving dashboard-triggered runs still
  perform IMEI handshake, AVL send, and acknowledgement handling correctly.
- Add HTTP or end-to-end dashboard tests for:
  - device creation;
  - bulk IMEI import;
  - start/stop actions;
  - status visibility;
  - log visibility;
  - manual clear actions;
  - polling-driven refresh visibility.
- Reuse the existing parser fixture and simulator protocol tests instead of
  rebuilding protocol assertions in the NestJS layer.

## Acceptance Criteria

- A user can start the NestJS dashboard locally.
- A user can create at least one device with a provided IMEI through the
  dashboard.
- A user can bulk import multiple IMEIs through the dashboard.
- A user can configure simulator settings for a device without using the CLI.
- A user can start one configured device from the dashboard.
- A user can start at least two configured devices concurrently from the
  dashboard.
- A user can stop a running device from the dashboard.
- The dashboard shows current status for each configured device.
- The dashboard shows per-device logs for connection lifecycle and simulator
  events.
- The dashboard refreshes status and logs through polling without full page
  reload.
- A user can manually clear in-memory logs or device/runtime data from the
  dashboard.
- Restarting the dashboard clears in-memory devices, run state, and logs.
- Existing simulator protocol behavior remains parser-visible and correct when
  runs are launched from the dashboard.
- No part of this iteration requires sending simulator data into the future
  external telemetry host.

## Out Of Scope

- Routing simulator output into another telemetry backend.
- Real-time map playback.
- Historical analytics dashboards.
- User authentication and permissions.
- Remote multi-node simulator coordination.
- CLI removal. The CLI should remain available as a lower-level interface.

## Resolved Decisions

- Device settings are per-device in the first version.
- Storage uses in-memory repositories only in the first version.
- Operators clear logs and in-memory state manually from the dashboard.
- The frontend uses React.
- Runtime status and logs refresh through polling.
- Active runs do not resume automatically after restart; operators use manual
  start/stop toggle controls.
