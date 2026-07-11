# Teltonika GPS Device Simulator — Project Summary

Status as of: 2026-07-11

## Project Goal

The project simulates one or more Teltonika devices communicating with an external parser over TCP. A virtual vehicle follows a defined route, generates deterministic telemetry, maps it to AVL records, and sends binary Codec 8 Extended frames.

The system can be controlled through the CLI or a local dashboard available at `http://localhost:3000`.

## Key Features

### Teltonika Protocol

- IMEI handshake;
- TCP transport;
- Codec 8 Extended (`0x8E`);
- AVL record encoding and decoding;
- CRC-16/IBM;
- record-count acknowledgement handling;
- reconnection after transport failures;
- sent-frame preview as `rawHex` and decoded JSON.

### Vehicle Simulation

- smooth position interpolation between GPS points;
- speed, heading, acceleration, and braking;
- stops, idling, ignition, and movement state;
- harsh acceleration and harsh braking events;
- `eco`, `normal`, and `aggressive` driving profiles;
- deterministic scenarios controlled by a `seed`;
- simulation speed control from `-10` to `10`;
- independent sessions for multiple IMEIs.

Simulation speed works as follows:

- `-10` means `0.1×` real time;
- `0` means `1×`;
- `10` means `10×`.

The packet transmission interval remains unchanged. The simulation clock and physics step are scaled together, keeping position, mileage, and timestamps consistent.

### Teltonika FMC650 Profile

The `fmc650-fms` profile generates FMS/J1939 data using AVL identifiers published by Teltonika, including:

- brake, clutch, cruise control, and PTO state;
- wheel-based speed;
- accelerator pedal position;
- engine load;
- engine RPM;
- fuel level and total fuel used;
- axle weights;
- total odometer and trip distance.

The profile enforces the FMC650-defined 1-, 2-, and 4-byte element sizes even when a specific value would fit in a smaller field.

## Dashboard

The dashboard supports:

- creating, editing, and deleting devices;
- generating a random 15-digit IMEI;
- bulk IMEI import;
- selecting a device profile and predefined route;
- configuring host, port, interval, retry delay, driving style, seed, and packet limit;
- controlling simulation speed with a slider;
- starting one device, selected devices, or all enabled devices;
- stopping sessions and monitoring their status;
- viewing positions and completed tracks on an OpenStreetMap map;
- displaying multiple device tracks simultaneously in different colors;
- filtering logs and expanding the sent-package JSON preview.

Dashboard state, devices, logs, and position history are stored in process memory. Restarting the application clears this data.

## Predefined Routes

| Route | File | Distance | Points |
|---|---|---:|---:|
| Small test loop | `tests/fixtures/city-loop.route.json` | local | 3 |
| Kraków → Berlin | `routes/krakow-berlin.route.json` | 605.6 km | 1,383 |
| Munich → Rome | `routes/munich-rome.route.json` | 915.7 km | 2,206 |

The long routes were generated from OSRM/OpenStreetMap road geometry. Every fifth geometry point was retained, keeping the distance error below 0.3%. Segment speeds are derived from OSRM annotations.

The simulation engine treats routes as loops: after the last point, it continues toward the first point.

## Data Flow

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

Simulation logic is separated from device-profile mapping, protocol encoding, and TCP transport.

## Main Modules

| Area | Files |
|---|---|
| Domain models | `src/domain.ts` |
| Routes and geometry | `src/route.ts` |
| Vehicle simulation | `src/simulation.ts`, `src/driving-style.ts` |
| Device profiles | `src/device-profile.ts`, `src/avl-mapping.ts` |
| Codec and CRC | `src/codec8-extended.ts`, `src/codec8-extended-decoder.ts`, `src/codec-crc.ts` |
| TCP session | `src/imei-handshake.ts`, `src/avl-session.ts`, `src/live-session.ts` |
| Multi-device runtime | `src/multi-device-runtime.ts` |
| Dashboard API | `src/dashboard/` |
| React dashboard and map | `src/dashboard/frontend/` |

## Running the Project

```bash
npm install
npm run build
npm run dashboard
```

Dashboard URL:

```text
http://localhost:3000
```

Default device form configuration:

- parser: `127.0.0.1:5027`;
- interval: `1000 ms`;
- retry delay: `3000 ms`;
- route: Kraków → Berlin;
- profile: `fmc650-fms`;
- driving style: `normal`;
- seed: `1`;
- simulation speed: `0`, meaning real time;
- packet limit: `1000`.

The TCP parser must run separately at the host and port configured for the device.

## CLI and Dry Run

Example TCP session:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --route-file routes/krakow-berlin.route.json \
  --device-profile fmc650-fms
```

Generate frames without opening a connection:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5027 \
  --imei 356307042441013 \
  --route-file routes/krakow-berlin.route.json \
  --device-profile fmc650-fms \
  --dry-run \
  --count 3
```

## Verification

```bash
npm run typecheck
npm run build
npm test
```

The test suite covers:

- CRC and Codec 8E round trips;
- handshake and acknowledgements;
- deterministic simulation behavior;
- route geometry and validation;
- driving profiles and FMC650 mapping;
- TCP sessions and reconnection;
- multi-device operation;
- dashboard API, runtime, logs, and map behavior;
- end-to-end parser-visible flows.

## Current Limitations

- TCP and Codec 8 Extended only;
- no UDP or TLS;
- no persistent database for devices, logs, or trips;
- no server-to-device commands;
- no route generator in the dashboard;
- routes loop instead of completing at the destination;
- FMC650 values are simulated from vehicle state rather than read from a physical CAN bus.

## Protocol and Route Sources

- [Teltonika FMC650 Data Sending Parameters ID](https://wiki.teltonika-gps.com/view/FMC650_Teltonika_Data_Sending_Parameters_ID)
- [OSRM Route Service](https://project-osrm.org/docs/v5.24.0/api/#route-service)
- [OpenStreetMap](https://www.openstreetmap.org/copyright)

