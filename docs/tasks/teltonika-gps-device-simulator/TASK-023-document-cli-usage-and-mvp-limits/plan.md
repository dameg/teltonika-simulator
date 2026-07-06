# Plan

Status: READY

## Current Repository Findings

- `README.md` is currently empty, so the user-facing CLI documentation for this task does not exist yet.
- The existing CLI surface is implemented in `src/config.ts` and exposed by `src/index.ts`; current supported flags and environment variables already cover the task requirements for host, port, IMEI, route file, driving style, seed, send interval, reconnect delay, dry-run, and packet count.
- Route loading and validation are implemented in `src/route.ts`. The simulator expects a JSON file shaped as `{ "route": { "metadata": ..., "points": [...] } }`, requires at least one point, and loops from the last point back to the first.
- Driving-style behavior is already implemented in `src/driving-style.ts`, and multi-device deterministic seed derivation is implemented in `src/multi-device-runtime.ts`.
- Dry-run behavior is already implemented in `src/dry-run.ts`; it emits deterministic hex packet output without opening a TCP session.
- Live-session behavior is already implemented in `src/live-session.ts`; the simulator reconnects after eligible TCP failures, does not reconnect after IMEI rejection, and treats AVL acknowledgement mismatches as failures instead of retry conditions.
- Device-profile support is currently limited to the built-in Codec 8 Extended profile in `src/device-profile.ts`, which aligns with the MVP constraint in the PRD.
- `references/traccar/README.md` exists as supporting server-side evidence and must remain read-only.

## Files To Create Or Modify

- `README.md`
- `docs/tasks/teltonika-gps-device-simulator/TASK-023-document-cli-usage-and-mvp-limits/plan.md`

Conditional only if implementation finds a mismatch between documentation and runtime behavior:

- `src/config.ts`
- `src/index.ts`

## Ordered Implementation Steps

1. Inspect the current CLI help output with `npm run cli -- --help` and use it as the baseline for the README command reference so the documentation matches the shipped interface exactly.
2. Write `README.md` sections for local setup and execution commands, including install, build, typecheck, test, dry-run, and live parser-targeted usage.
3. Document the supported CLI flags and environment variables, making precedence and repeatable IMEI usage explicit.
4. Document the route JSON format with a concrete example, required and optional point fields, and the end-of-route loop-back behavior.
5. Document the virtual vehicle model rather than only packet generation: driving styles, deterministic seeds, send interval behavior, stop handling, and the fallback generated route when no route file is provided.
6. Add usage examples covering a single IMEI live session, dry-run hex output, alternate driving style and seed, and multiple IMEIs in one invocation.
7. Add an MVP limits and non-goals section covering Codec 8 Extended only, no UDP, no TLS, no web dashboard, no cloud deployment, no historical trip database, and no command-response simulation.
8. Add a short note that files under `references/` are read-only protocol or server evidence and are not part of the editable simulator implementation.
9. If the README draft exposes any discrepancy with the actual `--help` text or runtime terminology, make the smallest source update needed so documentation and CLI output stay aligned.

## Validation And Error-Handling Strategy

- Reuse the existing runtime behavior as the source of truth for argument validation instead of inventing documentation-only rules.
- Document required inputs clearly: host, port, and at least one IMEI are mandatory for live sessions.
- Document the existing validation constraints already enforced by the CLI parser, including valid port range, positive interval and reconnect delay values, and non-negative integer seed requirements.
- Call out behavior that affects operator expectations: dry-run does not connect to the parser, IMEI rejection ends that device session, and reconnects happen only for eligible transport failures.
- Keep the documentation scoped to current behavior; if any behavior is ambiguous during implementation, verify it from source or CLI output before documenting it.

## Tests To Add Or Update

- No new automated tests are required if the task remains documentation-only.
- If source changes are needed to align CLI help text with the implemented behavior, update the smallest relevant CLI-facing test coverage in the existing config or CLI tests.

## Verification Commands

- `npm run build`
- `npm run typecheck`
- `npm test`
- `npm run cli -- --help`

## Risks

- The main risk is documenting behavior too loosely and drifting from the actual CLI or runtime implementation; this is why the help output and source files must be treated as the primary reference.
- Multi-device determinism and reconnect semantics are easy to oversimplify in prose, so the README should describe them carefully and only at the level actually implemented today.
- The PRD includes broader product framing than the CLI implementation exposes directly, so the README must stay within MVP scope and avoid implying unsupported protocol or deployment features.

## Unresolved Blockers

- None identified for planning.
