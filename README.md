# Teltonika GPS Device Simulator

A deterministic, multi-device Teltonika simulator with a local control dashboard, live OpenStreetMap tracking, reusable European road routes, and FMC650 FMS/J1939 telemetry.

The simulator models a virtual vehicle first, maps its state to Teltonika AVL elements, encodes Codec 8 Extended packets, and sends them to an external TCP parser.

## Highlights

- Teltonika IMEI handshake over TCP
- Codec 8 Extended (`0x8E`) encoding and decoding
- CRC-16/IBM and AVL acknowledgement validation
- deterministic vehicle simulation driven by route, style, seed, and interval
- `eco`, `normal`, and `aggressive` driving profiles
- Teltonika FMC650 FMS/J1939 profile
- multiple independent devices and reconnect handling
- React dashboard for configuration and runtime control
- live OpenStreetMap positions and multi-device tracks
- expandable JSON and raw hexadecimal packet previews
- reusable Kraków–Berlin and Munich–Rome road routes
- CLI and dry-run packet generation

## Quick Start

```bash
npm install
npm run build
npm run dashboard
```

Open:

```text
http://localhost:3000
```

The dashboard controls simulator devices, but the target TCP parser must run separately at the host and port configured for each device. The default parser address is `127.0.0.1:5027`.

## Dashboard

The dashboard supports:

- creating, editing, and deleting devices;
- generating a random 15-digit IMEI;
- bulk IMEI import;
- selecting predefined routes and device profiles;
- configuring parser address, packet interval, retry delay, packet limit, seed, and driving style;
- scaling simulation time from `0.1×` to `10×`;
- starting one device, selected devices, or all enabled devices;
- stopping sessions and monitoring lifecycle status;
- viewing multiple live device tracks in different colors;
- filtering logs and inspecting sent packets as JSON and `rawHex`.

Default form values:

| Setting | Default |
|---|---|
| Parser | `127.0.0.1:5027` |
| Packet interval | `1000 ms` |
| Reconnect delay | `3000 ms` |
| Route | Kraków → Berlin |
| Device profile | `fmc650-fms` |
| Driving style | `normal` |
| Seed | `1` |
| Simulation speed | `0` — real time |
| Packet limit | `1000` |

Dashboard devices, runtime state, logs, and position history are stored in process memory and are cleared when the application restarts.

## How It Works

```text
route + driving style + seed + simulation speed
                       |
                       v
           vehicle simulation engine
                       |
                       v
             device profile mapping
                       |
                       v
                  AVL record
                       |
                       v
          Codec 8E + CRC + TCP frame
                       |
                       v
             external parser + ACK
                       |
                       v
              dashboard logs and map
```

Simulation, device mapping, protocol encoding, networking, and dashboard storage remain separate modules.

## Vehicle Simulation

The engine generates:

- interpolated GPS position and heading;
- speed, acceleration, and braking;
- ignition and movement state;
- stops and idling;
- harsh acceleration and braking events;
- trip distance and total odometer progression;
- voltage and FMC650 vehicle telemetry.

### Driving Styles

- `eco` — gentler acceleration and less aggressive behavior
- `normal` — balanced default behavior
- `aggressive` — faster acceleration, more variation, and more harsh events

### Seed

The seed controls deterministic pseudo-random behavior such as speed variation, idling, and driving events.

The same route, driving style, seed, and interval produce the same telemetry sequence. Changing only the seed creates another repeatable variation of the same trip.

### Simulation Speed

The dashboard slider accepts values from `-10` to `10`:

- `-10` means `0.1×` real time;
- `0` means `1×`;
- `10` means `10×`.

The transmission cadence remains unchanged. The simulation clock and physics step are scaled together, keeping position, mileage, speed, and timestamps consistent.

## Teltonika FMC650

Select the `fmc650-fms` profile to generate FMS/J1939 data using FMC650 AVL identifiers published by Teltonika.

Included telemetry:

- brake switch;
- wheel-based speed;
- cruise control;
- clutch switch;
- PTO state;
- accelerator pedal position;
- engine load;
- total fuel used;
- fuel level;
- engine RPM;
- axle weights;
- total odometer and trip distance.

The profile enforces the FMC650-defined 1-, 2-, and 4-byte element sizes even when the current value would fit in a smaller field.

## Predefined Routes

| Route | File | Distance | GPS points |
|---|---|---:|---:|
| Small city loop | `tests/fixtures/city-loop.route.json` | local | 3 |
| Kraków → Berlin | `routes/krakow-berlin.route.json` | 605.6 km | 1,383 |
| Munich → Rome | `routes/munich-rome.route.json` | 915.7 km | 2,206 |

The long routes were generated from OSRM/OpenStreetMap road geometry. Every fifth source geometry point was retained, keeping the calculated distance error below `0.3%`. Segment speeds are derived from OSRM annotations.

Routes currently loop from the last point back to the first point.

### Route File Format

```json
{
  "metadata": {
    "id": "example-route",
    "name": "Example route",
    "description": "Reusable simulator route"
  },
  "points": [
    {
      "latitude": 50.049649,
      "longitude": 19.944352,
      "altitudeMeters": 220,
      "speedLimitKph": 50
    },
    {
      "latitude": 50.0501,
      "longitude": 19.9435,
      "speedLimitKph": 30,
      "stopDurationMs": 10000
    }
  ]
}
```

Required fields:

- `metadata.id`;
- a non-empty `points` array;
- `latitude` and `longitude` for every point.

Optional point fields:

- `altitudeMeters`;
- `speedLimitKph`;
- `stopDurationMs`.

## CLI

Build the project before running the compiled CLI:

```bash
npm run build
```

Single device:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --route-file routes/krakow-berlin.route.json \
  --device-profile fmc650-fms
```

Multiple devices:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --imei 356307042441014
```

IMEIs may also be comma-separated. Each IMEI receives an independent session and a deterministic per-device seed.

### CLI Options

| Option | Description |
|---|---|
| `--host <host>` | Parser host |
| `--port <port>` | Parser TCP port |
| `--imei <imei>` | Repeatable or comma-separated IMEI |
| `--interval-ms <ms>` | Packet interval, default `1000` |
| `--reconnect-delay-ms <ms>` | Retry delay after transport errors |
| `--route-file <path>` | Route JSON file |
| `--driving-style <name>` | `eco`, `normal`, or `aggressive` |
| `--seed <integer>` | Deterministic simulation seed |
| `--device-profile <name>` | `default-codec8e` or `fmc650-fms` |
| `--count <n>` | Packet limit |
| `--dry-run` | Generate packets without TCP |
| `--help` | Display CLI help |

CLI flags override their corresponding environment variables.

## Dry Run

Dry-run mode generates packets without opening a network connection:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --route-file routes/munich-rome.route.json \
  --device-profile fmc650-fms \
  --driving-style eco \
  --seed 42 \
  --dry-run \
  --count 3
```

Packet hex is written to stdout. Dry-run is useful for fixture generation, parser debugging, and deterministic packet comparison.

## Reconnect Behavior

Live sessions reconnect after recoverable socket failures such as connection refusal, reset, and timeout. They do not reconnect after:

- IMEI rejection;
- protocol failures such as an AVL acknowledgement count mismatch.

## Project Structure

| Area | Files |
|---|---|
| Domain models | `src/domain.ts` |
| Routes and geometry | `src/route.ts` |
| Vehicle simulation | `src/simulation.ts`, `src/driving-style.ts` |
| Device profiles | `src/device-profile.ts`, `src/avl-mapping.ts` |
| Codec and CRC | `src/codec8-extended.ts`, `src/codec8-extended-decoder.ts`, `src/codec-crc.ts` |
| TCP sessions | `src/imei-handshake.ts`, `src/avl-session.ts`, `src/live-session.ts` |
| Multi-device runtime | `src/multi-device-runtime.ts` |
| Dashboard API | `src/dashboard/` |
| React dashboard and map | `src/dashboard/frontend/` |
| Tests | `tests/` |

## Verification

```bash
npm run typecheck
npm run build
npm test
```

The test suite covers CRC, Codec 8E round trips, IMEI handshake, acknowledgements, deterministic simulation, route geometry, FMC650 mapping, reconnect behavior, multi-device sessions, dashboard APIs, map track selection, and parser-visible end-to-end flows.

## Current Limitations

- TCP and Codec 8 Extended only;
- no UDP or TLS;
- no persistent database for devices, logs, or trips;
- no server-to-device command simulation;
- no route generator in the dashboard;
- routes loop instead of completing at the destination;
- FMC650 values are simulated from vehicle state rather than read from a physical CAN bus.

## Sources

- [Teltonika FMC650 Data Sending Parameters ID](https://wiki.teltonika-gps.com/view/FMC650_Teltonika_Data_Sending_Parameters_ID)
- [OSRM Route Service](https://project-osrm.org/docs/v5.24.0/api/#route-service)
- [OpenStreetMap copyright and attribution](https://www.openstreetmap.org/copyright)
