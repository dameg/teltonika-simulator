Status: READY

# Current Repository Findings

- `src/config.ts` already parses `--dry-run` and `--count` / `--packet-count`, so TASK-015 does not need new CLI flags.
- `src/route.ts`, `src/simulation.ts`, `src/avl-mapping.ts`, `src/device-profile.ts`, and `src/codec8-extended.ts` already provide the full dry-run data path: route loading/fallback, deterministic simulation, vehicle-state to AVL mapping, device-profile lookup, and Codec 8 Extended packet framing.
- `src/index.ts` currently only parses config and prints the parsed config JSON. There is no runtime orchestration layer yet and no TCP/session module in the repository.
- Existing tests already prove determinism of the simulator helpers and validity of Codec 8 Extended framing, but there is no CLI/runtime test that composes them into dry-run packet output.
- `TASK-002`, `TASK-011`, `TASK-014`, and `TASK-024` are completed in `docs/tasks/teltonika-gps-device-simulator/manifest.json`, so this task is unblocked for planning.

# Files To Create Or Modify

- `src/index.ts`
- `src/dry-run.ts`
- `tests/dry-run.test.ts`
- `tests/config.test.ts`

# Ordered Implementation Steps

1. Add a small dry-run orchestration module in `src/dry-run.ts`.
   - Accept parsed `SimulatorConfig`.
   - Resolve the configured route or generated fallback route.
   - Build a deterministic simulator with a fixed internal `startTimestampMs` constant so separate CLI invocations produce identical packet bytes for the same route, driving style, seed, interval, and count.
   - For each configured IMEI in input order, generate `packetCount ?? 1` one-record packets by calling `createVehicleSimulator`, `getDeviceProfile`, `mapVehicleStateToAvlRecord`, and `encodeCodec8ExtendedPacket`.
   - Return or emit lowercase hex strings, one packet per line, without importing `net` or any future session/runtime module.

2. Replace the placeholder CLI behavior in `src/index.ts`.
   - Keep `--help` behavior unchanged.
   - On `config.dryRun === true`, run the dry-run path, print packet hex lines to `stdout`, and write any human-readable context only to `stderr`.
   - On `config.dryRun === false`, keep behavior minimal for now: fail clearly that live runtime is not implemented yet instead of printing config JSON.

3. Add focused dry-run coverage.
   - Add a compositional test that runs the dry-run entry point with a fixed route fixture, seed, style, interval, and count, then asserts identical stdout across repeated runs.
   - Add a test that the same route and seed with different driving styles yields different hex sequences.
   - Add a test that each emitted line is a valid framed Codec 8 Extended packet by decoding the header fields already asserted elsewhere: zero preamble, data length, codec ID `0x8E`, repeated record count, and CRC.
   - Add a test that dry-run output uses stdout only for hex and keeps context/errors off stdout.
   - Add a test that the dry-run module and its CLI path do not import `node:net` or any session/runtime module.

4. Update config expectations where behavior changes.
   - Extend `tests/config.test.ts` only as needed to cover `--count` in the dry-run path or unchanged parsing assumptions.

# Validation And Error-Handling Strategy

- Treat missing or invalid route files, unknown device profiles, and other existing parser/loader failures as hard errors and surface their messages on `stderr` with exit code `1`.
- Use a fixed dry-run start timestamp constant rather than wall-clock time. Without that, the acceptance criterion for identical hex output across separate runs cannot hold.
- Default dry-run packet count to `1` when `packetCount` is omitted so `--dry-run` terminates deterministically instead of hanging behind the live-runtime loop shape planned in later tasks.
- Keep stdout payload-only: packet hex lines with no labels, prefixes, or JSON. Any contextual information such as IMEI or route ID belongs on stderr.
- Keep dry-run orchestration separate from future TCP work so satisfying “does not import or invoke production TCP session startup” remains enforceable once session modules are added later.

# Tests To Add Or Update

- Add `tests/dry-run.test.ts` for end-to-end dry-run composition and CLI-visible behavior.
- Update `tests/config.test.ts` only if the dry-run default-count behavior or CLI handling needs explicit coverage.

# Verification Commands

```bash
npm run build
npm run typecheck
npm test
npm run cli -- --dry-run --host 127.0.0.1 --port 5027 --imei 123456789012345 --count 2
```

# Risks

- The task acceptance says dry-run must not import or invoke production TCP startup, but there is no TCP startup module yet. The implementation should still isolate dry-run now so later live-runtime work does not accidentally introduce eager session imports into `src/index.ts`.
- Multiple IMEIs are already supported by config, but AVL packet bytes do not currently include IMEI data. The implementation should emit packets in stable IMEI order and keep any per-IMEI context on stderr to avoid ambiguous stdout formatting.

# Unresolved Blockers

- None for planning. The task can proceed with the fixed dry-run timestamp decision described above.
