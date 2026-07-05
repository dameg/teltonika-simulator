## Findings

### REV-001

- Severity: medium
- Affected file: `tests/live-session.test.ts`
- Description: The prior reconnect-timing gap is now covered. The reconnect test asserts no second IMEI arrives before half of the configured delay and that the second connection is only observed after at least the configured delay elapses.
- Expected behavior: Keep the fixed-delay reconnect behavior parser-visible in the test suite.
- Status: resolved

### REV-002

- Severity: high
- Affected file: `src/live-session.ts`
- Description: The prior dropped-record regression is now addressed. The reconnect loop retains the in-flight AVL record in `pendingRecord` until `sendAvlPacket(...)` completes successfully, and the reconnect test now verifies the parser still receives the baseline first three records in order across a forced disconnect.
- Expected behavior: Preserve the deterministic emitted telemetry sequence across reconnects by resending the in-flight record instead of advancing to a later simulator state.
- Status: resolved

## Result

PASS
