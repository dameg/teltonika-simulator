# Review

### REV-001

- Severity: medium
- Affected file: `src/dashboard/status/status.service.ts`
- Description: `listDeviceStatuses()` appends synthetic status entries for runtime records that do not have a configured device. That broadens the status surface beyond the task and PRD, which both define the dashboard status list as the current status for configured devices and the plan explicitly scopes the synthesized entries in the other direction: include configured devices even when they have no runtime record. Returning runtime-only orphan entries also inflates `/api/status/devices` and `/api/status/overview` with non-configured devices.
- Expected behavior: Status list and overview responses should be derived from configured devices, merging in runtime data when it exists and synthesizing `configured` when it does not. Runtime records without a matching configured device should not be exposed as additional devices by these endpoints.
- Status: resolved

## Result

PASS
