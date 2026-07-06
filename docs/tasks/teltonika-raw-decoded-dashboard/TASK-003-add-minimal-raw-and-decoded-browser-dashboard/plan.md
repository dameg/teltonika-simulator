# TASK-003 Plan

Status: READY

## Current Repository Findings

- `TASK-002` is already implemented and reviewed, but the repository has moved beyond that original plan: `src/dashboard-backend.ts` already accepts IMEI handshakes, buffers AVL frames, decodes valid packets, retains decode errors, exposes `GET /messages`, and is wired into `src/index.ts` startup.
- No nested `AGENTS.md` files apply under `src/`, `tests/`, or this task directory. The repository-root `AGENTS.md` is the governing instruction set.
- `src/index.ts` already starts the dashboard backend in `dashboard` mode and prints both the Teltonika TCP listener and the dashboard URL. The gap for this task is browser rendering, not launcher wiring.
- `src/dashboard-backend.ts` currently serves only a plain-text placeholder at `GET /`; it does not yet render a browser dashboard or any empty/error/populated UI states.
- The retained message model in `src/dashboard-backend.ts` already contains the fields this task needs for rendering: `sessionId`, `timestamp`, `imei`, `rawHex`, plus either decoded AVL JSON or structured decode errors.
- `tests/dashboard-backend.test.ts` already covers transport-facing behavior: accepted and rejected IMEI handshakes, valid AVL retention, fragmented frame parsing, retained decode errors, and the JSON `/messages` surface.
- The task PRD explicitly prefers Node built-ins, in-memory storage, and a lightweight local UI over a SPA. Given the existing backend shape, the smallest fitting implementation is a server-served HTML page with a tiny client script that polls `/messages`.
- There is no existing static-asset pipeline in `package.json` or `tsconfig.json`. Introducing one for this task would be unnecessary scope unless inline HTML becomes unmaintainable.

## Files To Create Or Modify

- Modify `src/dashboard-backend.ts`
- Modify `tests/dashboard-backend.test.ts`
- Optionally create a small `src/` helper for HTML generation only if that keeps `dashboard-backend.ts` readable without introducing a new asset pipeline

## Ordered Implementation Steps

1. Replace the placeholder root route with a minimal browser dashboard.
   - Serve `GET /` as `text/html` from the existing HTTP server rather than adding a second web layer.
   - Keep the page self-contained: structural HTML, minimal CSS, and a tiny client script built with browser primitives only.
   - Preserve `GET /messages` unchanged as the machine-readable data source unless a tiny compatibility adjustment is required for rendering.

2. Render the retained dashboard messages in a task-scoped browser layout.
   - Show the current in-memory message list from the backend with stable ordering that matches retention order.
   - Include the task-required metadata for each entry: session/connection identifier, IMEI, message type, receive timestamp, raw hex, and decoded JSON or decode error payload.
   - Present raw hex and decoded/error content adjacent to each other in the same message row/card so the side-by-side requirement is satisfied without building a complex inspector.

3. Implement the minimal live-refresh behavior.
   - Use simple polling from the browser page against `/messages`; do not add SSE, websockets, or a framework.
   - Refresh often enough for local debugging while keeping the code straightforward.
   - Keep all state client-local and derived from `/messages`; do not add persistence, filters, or server mutation endpoints.

4. Cover required empty and decode-error states explicitly in the UI.
   - Render a clear empty state before any messages arrive.
   - Render decode failures using the existing structured error message entries instead of hiding them or forcing them into the decoded AVL view.
   - Ensure IMEI-only handshake events still remain visible as first-class message entries so session setup is inspectable.

5. Add focused browser-surface tests without expanding into end-to-end browser automation.
   - Extend `tests/dashboard-backend.test.ts` to assert `GET /` returns HTML rather than the current plain-text heartbeat.
   - Assert the root HTML contains the expected page shell and client-side hooks for empty and populated rendering.
   - Keep transport/parser assertions in the existing backend test file; this task does not need a separate browser automation stack.

## Validation And Error-Handling Strategy

- Keep simulation/network parsing responsibilities where they already live. This task should only layer browser presentation onto the existing backend surface.
- Prefer inline HTML and a tiny polling script over a new static directory, bundler, or frontend framework to stay inside the PRD’s “minimal local UI” boundary.
- Treat `/messages` as the single source of truth for browser state so the dashboard cannot drift from the backend’s retained data model.
- Preserve decode-error visibility end to end: malformed AVL packets should still render their raw hex alongside structured error JSON.
- Keep the HTML route resilient when no messages exist by rendering a deterministic empty state rather than an empty container.
- Avoid introducing configuration, filtering, pagination, or export features; those are outside this task’s acceptance criteria.

## Tests To Add Or Update

- Update `tests/dashboard-backend.test.ts` to cover:
  - `GET /` returns `200` with `text/html`
  - the page shell includes a dashboard title and a container for message rendering
  - the page includes an explicit empty-state marker/message before data is loaded
  - the existing retained message data can still be fetched from `/messages` for populated and decode-error cases
- Keep existing valid/rejected/fragmented/decode-error transport assertions intact; this task should build on them rather than replace them.

## Verification Commands

```bash
npm run build
npm run typecheck
npm test
```

## Risks

- The main scope risk is overbuilding the browser surface into a small SPA or adding an asset pipeline the repository does not currently need.
- Another risk is accidentally changing the `/messages` contract while wiring the UI, which would blur the boundary between `TASK-002` and `TASK-003`.
- Side-by-side rendering can become unreadable if implemented as a monolithic text dump; the UI should stay minimal but still structure each message clearly.
- If the empty and decode-error states are only implied in client code and not asserted in tests, regressions back to the placeholder root route will be easy to miss.

## Unresolved Blockers

- None.
- Planning assumption: polling `/messages` from a server-served HTML page is sufficient for the “minimal local browser dashboard” requirement. The PRD’s SSE-vs-polling question does not block implementation because polling is the smaller acceptable option here.
