# Teltonika GPS Device Simulator

This project simulates one or more Teltonika TCP devices speaking Codec 8 Extended (`codec8e`) to a parser-visible server. It models a virtual vehicle moving along a route and then encodes those simulated AVL records into Teltonika packets.

## MVP Scope

The simulator currently supports:

- Teltonika TCP sessions only
- Codec 8 Extended only
- One or more IMEIs in a single process
- Deterministic route-based vehicle simulation
- Dry-run packet generation for inspection

The simulator does not currently support:

- UDP transport
- TLS
- Web dashboard or browser UI
- Cloud deployment automation
- Historical trip database storage
- Server-to-device command/response simulation
- Additional codecs beyond Codec 8 Extended

The `references/` directory contains read-only external protocol and parser evidence. It is not part of the editable implementation surface for normal task work.

## Install And Verify

```bash
npm install
npm run build
npm run typecheck
npm test
```

To inspect the CLI directly:

```bash
npm run cli -- --help
```

## CLI Usage

Basic live session:

```bash
npm run cli -- --host 127.0.0.1 --port 5000 --imei 356307042441013
```

CLI options:

- `--host <host>` parser/server host, required
- `--port <port>` parser/server TCP port, required
- `--imei <imei>` device IMEI, repeatable or comma-separated, at least one required
- `--interval-ms <ms>` telemetry send interval, default `1000`
- `--reconnect-delay-ms <ms>` retry delay after reconnectable transport failures, default `5000`
- `--route-file <path>` route JSON file
- `--driving-style <eco|normal|aggressive>` driving profile, default `normal`
- `--seed <integer>` deterministic simulation seed, default `1`
- `--device-profile <name>` device profile, currently `default-codec8e`
- `--dry-run` generate packets without opening a TCP connection
- `--count <n>` or `--packet-count <n>` packet count limit, mainly for dry-run
- `--help` print usage

Environment variables:

- `TELTONIKA_HOST`
- `TELTONIKA_PORT`
- `TELTONIKA_IMEIS`
- `TELTONIKA_INTERVAL_MS`
- `TELTONIKA_RECONNECT_DELAY_MS`
- `TELTONIKA_ROUTE_FILE`
- `TELTONIKA_DRIVING_STYLE`
- `TELTONIKA_SEED`
- `TELTONIKA_DEVICE_PROFILE`
- `TELTONIKA_DRY_RUN`
- `TELTONIKA_PACKET_COUNT`

CLI flags override environment variables when both are provided.

Environment-based example:

```bash
export TELTONIKA_HOST=127.0.0.1
export TELTONIKA_PORT=5000
export TELTONIKA_IMEIS=356307042441013
npm run cli --
```

## Single And Multi-Device Runs

Single IMEI:

```bash
npm run cli -- --host 127.0.0.1 --port 5000 --imei 356307042441013
```

Multiple IMEIs with repeated flags:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5000 \
  --imei 356307042441013 \
  --imei 356307042441014
```

Multiple IMEIs with a comma-separated value:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5000 \
  --imei 356307042441013,356307042441014
```

Each IMEI gets its own live session. Multi-device runs stay deterministic by deriving a distinct per-device seed from the base seed and IMEI.

## Route Files

If `--route-file` is omitted, the simulator uses a built-in fallback route with three sample points near Vilnius. That fallback is useful for smoke testing, but real parser validation should usually provide an explicit route. This repository includes a small loop at `./tests/fixtures/city-loop.route.json` and reusable road routes at `./routes/krakow-berlin.route.json` and `./routes/munich-rome.route.json`.

Route files use this JSON shape:

```json
{
  "route": {
    "metadata": {
      "id": "vilnius-loop",
      "name": "Vilnius Loop",
      "description": "Simple parser-visible loop for local testing"
    },
    "points": [
      {
        "latitude": 54.6872,
        "longitude": 25.2797,
        "altitudeMeters": 112,
        "speedLimitKph": 50
      },
      {
        "latitude": 54.6895,
        "longitude": 25.2758,
        "speedLimitKph": 40,
        "stopDurationMs": 10000
      },
      {
        "latitude": 54.6841,
        "longitude": 25.2829,
        "altitudeMeters": 118,
        "speedLimitKph": 60
      }
    ]
  }
}
```

Rules:

- `route.metadata.id` and `route.metadata.name` are required
- `route.points` must be a non-empty array
- each point requires `latitude` and `longitude`
- optional point fields are `altitudeMeters`, `speedLimitKph`, and `stopDurationMs`

The simulator loops from the last point back to the first point, so routes behave as continuous loops instead of one-shot trips.

## Vehicle Simulation

This is a virtual vehicle simulator, not only a packet generator. Route geometry, interpolation, speed changes, stopping, idling, heading, and movement state are simulated first, then mapped into Teltonika AVL records.

`--interval-ms` controls the simulation step and packet send cadence. A route, driving style, interval, and seed combination produces deterministic output.

Driving styles:

- `eco` lower acceleration and gentler behavior
- `normal` balanced default behavior
- `aggressive` faster acceleration, more variation, and harsher events

Seeded live example:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5000 \
  --imei 356307042441013 \
  --route-file ./tests/fixtures/city-loop.route.json \
  --driving-style aggressive \
  --seed 42 \
  --interval-ms 1000
```

Identical inputs produce identical telemetry sequences. Changing the seed changes the simulated behavior while preserving the same route definition.

## Dry Run

Dry-run mode generates Teltonika packets without opening a TCP connection:

```bash
npm run cli -- \
  --host 127.0.0.1 \
  --port 5000 \
  --imei 356307042441013 \
  --route-file ./tests/fixtures/city-loop.route.json \
  --driving-style eco \
  --seed 7 \
  --dry-run \
  --count 3
```

Behavior:

- packet hex is written to stdout, one packet per line
- dry-run summary lines are written to stderr
- route resolution and device-profile resolution match live mode
- if `--count` is omitted in dry-run mode, one packet is generated by default

Dry-run is useful for fixture generation, parser debugging, and verifying deterministic output for a known route/style/seed combination.

## Reconnect Behavior

Live TCP sessions reconnect after reconnectable transport failures such as connection refused, connection reset, timeouts, and similar socket-level failures. The retry delay is controlled by `--reconnect-delay-ms`.

The simulator does not reconnect after:

- IMEI rejection during session start
- non-reconnectable protocol failures such as AVL acknowledgement count mismatch

## Device Profile

The current built-in device profile is `default-codec8e`. The MVP intentionally supports only Codec 8 Extended, so parser validation and fixtures should assume `codec8e` packets.
