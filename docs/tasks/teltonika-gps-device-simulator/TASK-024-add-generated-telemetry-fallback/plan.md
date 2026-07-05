# TASK-024 Plan: Add Generated Telemetry Fallback

## Status

READY

## Current Repository Findings

- `src/config.ts` already parses optional `routeFile`, `drivingStyle`, `seed`, and `intervalMs`; `routeFile` is intentionally optional.
- `src/route.ts` already owns route loading, schema validation, geometry, interpolation, and has no Codec or TCP imports.
- `src/simulation.ts` already requires a `RouteDefinition` and produces deterministic vehicle states from route, driving style, seed, start timestamp, and interval.
- `src/index.ts` re-exports route and simulation helpers for tests and future runtime wiring.
- There is no dry-run or TCP runtime wiring yet; `src/index.ts` currently only prints parsed config. TASK-024 should therefore provide a reusable route-resolution seam instead of implementing dry-run packet printing or live sending.
- Existing tests already check route/simulation determinism and module-boundary import independence.
- `loadRouteFromFile` is only used directly by tests today, so adding one shared resolver in the route layer is the smallest root-cause seam for future dry-run and runtime callers.
- `progress.md` and `review.md` do not exist for this task yet, so this is a first-pass plan rather than a replan against review findings.
- No nested `AGENTS.md` files exist; root `AGENTS.md` applies.
- `docs/tasks/teltonika-gps-device-simulator/manifest.json` is already modified in the worktree and must not be touched by this task.

## Files To Create Or Modify

- Modify `src/route.ts`
  - Add a small exported fallback `RouteDefinition`.
  - Add a resolver that returns `loadRouteFromFile(routeFile)` when `routeFile` is supplied, otherwise returns the fallback route.
- Modify `src/index.ts`
  - Re-export the fallback route and resolver.
- Modify `tests/route.test.ts`
  - Cover explicit route-file precedence over fallback.
  - Extend the existing route-layer import-boundary check if needed.
- Modify `tests/simulation.test.ts`
  - Cover deterministic vehicle-state output from the fallback route with same seed, driving style, start timestamp, and interval.

No new fixture is required; `tests/fixtures/city-loop.route.json` can prove explicit route-file precedence.

## Ordered Implementation Steps

1. In `src/route.ts`, define an exported `generatedTelemetryFallbackRoute` with stable metadata ID and at least three nearby route points, including altitude and speed limits.
2. In `src/route.ts`, add `resolveSimulationRoute(routeFile?: string): RouteDefinition`.
   - Return `loadRouteFromFile(routeFile)` when `routeFile` is provided.
   - Return `generatedTelemetryFallbackRoute` only when `routeFile === undefined`.
   - Do not treat `""` or other invalid path strings as a fallback case.
3. Re-export both symbols from `src/index.ts`.
4. Add a route test that `resolveSimulationRoute(undefined)` returns the fallback route.
5. Add a route test that `resolveSimulationRoute(pathToCityLoop)` returns the file route, proving explicit route files bypass fallback.
6. Add a simulation test that creates two simulators from `resolveSimulationRoute(undefined)` with identical options and asserts equal state sequences.
7. Keep all fallback code in route/simulation-facing modules only; do not import Codec, encoder, packet, TCP, or session modules.

## Validation And Error Handling Strategy

- Preserve existing route-file errors by delegating supplied paths to `loadRouteFromFile`.
- Do not add fallback validation at runtime unless needed; the fallback route is a typed in-source constant and should use the existing `RouteDefinition` shape.
- Do not change config parsing semantics. Missing `routeFile` remains valid.
- Preserve the distinction between “no route file supplied” and “bad route file supplied”; an empty string from environment configuration should still fail through file loading instead of silently selecting the fallback route.
- Do not add dry-run or TCP behavior in this task; future callers should pass `config.routeFile` into `resolveSimulationRoute`.

## Tests To Add Or Update

- `tests/route.test.ts`
  - Assert fallback route metadata and non-empty point set when no route file is supplied.
  - Assert the explicit city-loop fixture is returned when a route file is supplied.
- `tests/simulation.test.ts`
  - Assert two fallback-route simulators with the same driving style, seed, start timestamp, and interval produce identical sequences.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- Returning a shared fallback object is the smallest implementation, but callers could mutate it. Existing route objects are also mutable at runtime, so avoid adding cloning unless a test or caller exposes a real mutation problem.
- A truthy/falsy route-file check would be wrong here because `""` should behave like an invalid explicit path, not like “no route file”; tests should lock that down indirectly by checking precedence semantics.
- TASK-015 and runtime tasks are not implemented yet, so this task can only expose route resolution for those later paths; it should not implement dry-run or live sending.

## Unresolved Blockers

No implementation-blocking questions remain.
