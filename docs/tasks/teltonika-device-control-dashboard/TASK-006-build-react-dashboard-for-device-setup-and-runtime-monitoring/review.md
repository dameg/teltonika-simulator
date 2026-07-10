# TASK-006 Review

## Verification

- `npm run build` — passed.
- `npm run typecheck` — passed.
- `npm test` — passed: 24 test files, 137 tests.
- `git diff --check` — passed.

## Findings

### REV-001

- Severity: high
- Affected file: `src/dashboard/frontend/App.tsx`
- Description: `selectedImei` is used both as the selected device/edit target and as the log-filter value. Clicking a device loads its form, but changing the log filter to “All devices” makes `selectedDevice` false, so submitting the still-populated form sends `POST /api/devices` and reports the existing IMEI as a duplicate. Choosing a different log-filter device can instead make the same form submit a `PATCH` for the wrong device.
- Expected behavior: Keep device-detail/edit selection separate from the log-filter selection, so changing log filters never changes the form’s target or CRUD method.
- Status: resolved

### REV-002

- Severity: high
- Affected file: `src/dashboard/frontend/App.tsx`
- Description: The edit form remains enabled while a device has `starting`, `running`, or `reconnecting` status. The task plan requires edits to be disabled for active runs, and the backend rejects them with a conflict; the UI therefore permits an action it should prevent and only surfaces the failure after submission.
- Expected behavior: Disable the edit controls/save action while the edited device is active, while retaining the active-run safeguard for delete and clear actions.
- Status: resolved

### REV-003

- Severity: high
- Affected file: `src/dashboard/frontend/App.tsx`
- Description: The `New device` action previously retained the edit selection, which kept the IMEI disabled and caused a new submission to use the update path.
- Expected behavior: Starting a new-device form clears the edit/detail selection so the IMEI is editable and submission uses `POST /api/devices`.
- Status: resolved

The current implementation clears `selectedImei` and resets the form from the
`New device` action. The form now uses the create path and enables IMEI input.

## Result

PASS
