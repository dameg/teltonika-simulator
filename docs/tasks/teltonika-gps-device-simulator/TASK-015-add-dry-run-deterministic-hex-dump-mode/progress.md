Status: IMPLEMENTATION_COMPLETE

# Completed Work

- Added `src/dry-run.ts` to compose route resolution, deterministic vehicle simulation, device-profile mapping, and Codec 8 Extended framing into dry-run packet hex output.
- Replaced the placeholder CLI behavior in `src/index.ts` with `runCli`, keeping `--help` on stdout, routing dry-run hex lines to stdout, routing context lines to stderr, and failing clearly when live runtime is requested.
- Added dry-run coverage in `tests/dry-run.test.ts` for deterministic output, driving-style variation, packet framing validity, stdout/stderr separation, and independence from `net` or session imports.
- Updated `tests/config.test.ts` to cover `--count` parsing in the dry-run path.

# Changed Files

- `src/dry-run.ts`
- `src/index.ts`
- `tests/dry-run.test.ts`
- `tests/config.test.ts`

# Verification

- `npm run build` -> PASS
- `npm run typecheck` -> PASS
- `npm test` -> PASS
- `npm run cli -- --dry-run --host 127.0.0.1 --port 5027 --imei 123456789012345 --count 2` -> PASS

# Verification Notes

- The CLI command emitted two lowercase Codec 8 Extended packet hex lines on stdout and dry-run context lines on stderr.
- Dry-run uses a fixed internal start timestamp and does not import `node:net` or any session module.

# Review Findings Addressed

- None. `review.md` does not exist for this task.

# Unresolved Issues

- Live TCP runtime remains intentionally unimplemented and now fails explicitly unless `--dry-run` is used. That is outside TASK-015 scope.
