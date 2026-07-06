# TASK-001 Plan

Status: READY

## Current Repository Findings

- `src/codec8-extended.ts` currently contains only Codec 8 Extended encoding and packet framing. It already defines the exact field order the decoder must reverse: zero preamble, 4-byte data length, codec id, first record count, records, repeated record count, and 4-byte CRC field.
- `src/codec-crc.ts` already exposes `crc16Ibm` and `crc16IbmProtocolField`, and `tests/codec-crc.test.ts` includes an independent Traccar-derived Codec 8 Extended packet fixture. The decoder should reuse the CRC helper and validate against packet bytes, not against encoder internals.
- `src/domain.ts` already defines the typed AVL record, GPS, and IO-group shapes the decoder can return. This task should reuse `AvlRecord` rather than create a second record model.
- `src/index.ts` exports the encoder but not any decoder surface yet. If the decoder is meant to be reusable across later dashboard tasks, the public entrypoint should export it and its result/error types.
- `tests/codec8-extended.test.ts` currently covers only encoder behavior and module-boundary independence. It is the natural place to extend coverage for decoder success and malformed-packet cases unless a small decoder-focused test file is cleaner.
- `tests/fixtures/assert-codec8-extended-packet.ts` asserts framed packet structure and CRC over raw bytes. It can stay narrow, but a tiny fixture/helper extraction is acceptable if malformed-packet setup becomes repetitive.
- The read-only Traccar references include multiple valid Codec 8 Extended packets plus an invalid length/checksum example, which gives this task an independent packet source for decoder tests without copying parser architecture.
- No nested `AGENTS.md` files apply under `src/`, `tests/`, or this task directory, so the repository-root instructions govern this task.

## Files To Create Or Modify

- Create `src/codec8-extended-decoder.ts`
- Modify `src/index.ts`
- Modify `tests/codec8-extended.test.ts` or add `tests/codec8-extended-decoder.test.ts`
- Optionally create a small test fixture helper under `tests/fixtures/` only if it removes duplicated raw packet setup without broadening scope

## Ordered Implementation Steps

1. Add a protocol-only decoder module in `src/codec8-extended-decoder.ts`.
   - Export a small discriminated result surface, e.g. decoded packet success plus structured decode error.
   - Reuse `AvlRecord` and existing IO element types from `src/domain.ts`.
   - Keep the module independent from `net`, parser fixture code, dashboard code, and runtime/session modules.

2. Implement frame-level validation before record decoding.
   - Require the 4-byte zero preamble.
   - Read and validate the declared data length against the actual frame length.
   - Reject unsupported codec ids and require `0x8E`.
   - Validate CRC-16/IBM over only the declared data field.
   - Validate that first and repeated record counts match and that the count is consistent with the number of decoded records.

3. Implement deterministic record decoding with strict buffer-bound checks.
   - Decode timestamp, priority, GPS element, event IO id, total IO count, and the 1-byte, 2-byte, 4-byte, 8-byte, and X-byte IO groups in protocol order.
   - Decode numeric IO ids and counts as unsigned 16-bit values, matching the existing encoder and Traccar reference behavior for Codec 8 Extended.
   - Preserve X-byte values as raw `Uint8Array` data so later dashboard tasks can project them to JSON without changing protocol parsing.
   - Fail with structured errors when any field would read past the declared data field or when counts are internally inconsistent.

4. Define the smallest useful error model for later dashboard tasks.
   - Use explicit machine-readable error codes or kinds for malformed framing, unsupported codec, CRC mismatch, record-count mismatch, truncated field data, and unsupported packet shape.
   - Include actionable details needed by callers, such as the failing field or expected versus actual values, without mixing in UI concerns.
   - Return errors as data instead of throwing for malformed input, while reserving thrown exceptions for programmer misuse only if unavoidable.

5. Export the decoder from `src/index.ts`.
   - Re-export the decode function and its public result/error types.
   - Do not move encoder logic or refactor unrelated exports.

6. Add focused tests that prove the decoder works independently from the encoder.
   - Use the existing Traccar packet fixture from `tests/codec-crc.test.ts` or a small shared helper as an independent valid packet source.
   - Add at least one encoder-generated packet test to cover round-trip behavior for the repository's own `AvlRecord` shape, especially X-byte IO handling.
   - Add malformed-packet tests for bad preamble, bad length, unsupported codec, mismatched repeated record count, bad CRC, and truncated IO payloads.
   - Keep tests centered on observable decoded output and structured errors, not private parser offsets.

## Validation And Error-Handling Strategy

- Treat the declared data length as the hard boundary for all parsing. The decoder should never read beyond `8 + dataLength`, even if extra bytes exist in the buffer.
- Parse with a single offset through the data field and check remaining bytes before every fixed-width and variable-width read.
- Validate total IO count against the sum of decoded IO groups so malformed packets cannot silently produce partial data.
- Preserve exact unsigned versus signed interpretations from the existing encoder:
  - timestamp: signed 64-bit on the wire but accepted only when it fits the repository's `number` model safely;
  - longitude/latitude: signed 32-bit;
  - altitude: signed 16-bit;
  - heading, satellites, speed, event IO id, group counts, and IO ids: unsigned.
- Report CRC failures against the declared data field only, matching the existing CRC tests and protocol framing.
- Do not decode TCP chunking, acknowledgements, or IMEI framing here.

## Tests To Add Or Update

- Update `tests/codec8-extended.test.ts` with decoder assertions, or add `tests/codec8-extended-decoder.test.ts` if keeping encoder and decoder coverage separate reads more clearly.
- Reuse the independent Traccar hex packet already present in `tests/codec-crc.test.ts` for at least one success-path decoder test.
- Add one repository-local round-trip test that encodes an `AvlRecord`, decodes the packet, and asserts the decoded record matches the input shape, including 8-byte and X-byte IO groups.
- Add malformed-packet tests that assert structured error kinds and actionable details instead of generic failures.
- Keep `tests/fixtures/assert-codec8-extended-packet.ts` unchanged unless a tiny helper extraction meaningfully reduces duplication.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main correctness risk is offset drift inside the variable-length IO groups, especially X-byte values. One missing bounds check would corrupt the rest of the decode.
- Another risk is collapsing malformed-packet cases into one generic error, which would make later dashboard error rendering much less useful.
- Converting 64-bit timestamps to JavaScript `number` needs an explicit safe-integer check; otherwise valid wire bytes could decode into silently imprecise timestamps.
- Overreusing the encoder in tests would hide decoder mistakes. At least one success path must come from an independent raw packet fixture.

## Unresolved Blockers

- None.
