# Traccar Teltonika Reference

## Source

Repository:

`https://github.com/traccar/traccar`

Pinned revision:

`<TRACCAR_COMMIT_SHA>`

License:

Apache License 2.0. See `LICENSE`.

## Purpose

The files in this directory are read-only research material for implementing a
Teltonika GPS device simulator.

Traccar represents the server/parser side of the protocol. The simulator
implements the opposite side of the TCP exchange.

## Included Files

### `TeltonikaProtocolDecoder.java`

Primary reference for:

- IMEI handshake handling.
- Codec 8 Extended decoding.
- AVL record layout.
- GPS element decoding.
- IO element decoding.
- Parser acknowledgements.

### `TeltonikaFrameDecoder.java`

Reference for:

- IMEI message framing.
- AVL packet framing.
- Length field handling.
- TCP packet boundary detection.

### `TeltonikaProtocolDecoderTest.java`

Reference for:

- Hexadecimal Teltonika payloads.
- Example AVL packets.
- Protocol edge cases.
- Deterministic test fixtures.

### `TeltonikaProtocol.java`

Reference for the Traccar Teltonika protocol pipeline.

### `TeltonikaProtocolEncoder.java`

Reference for server-to-device command encoding.

This file is secondary and is not required for the first simulator version.

## Interpretation

The Traccar implementation must be interpreted from the opposite side of the
connection:

| Traccar server behavior     | Simulator device behavior       |
| --------------------------- | ------------------------------- |
| Reads IMEI                  | Sends IMEI                      |
| Sends IMEI acceptance byte  | Reads acceptance byte           |
| Decodes AVL packet          | Encodes AVL packet              |
| Sends accepted record count | Reads accepted record count     |
| Sends device command        | Optionally reads device command |

## Rules

- Do not modify files in this directory.
- Do not copy Traccar application architecture into the simulator.
- Treat this code as implementation evidence, not as the protocol
  specification.
- Prefer official Teltonika documentation where available.
- Document any differences between Traccar behavior and official Teltonika
  documentation.
