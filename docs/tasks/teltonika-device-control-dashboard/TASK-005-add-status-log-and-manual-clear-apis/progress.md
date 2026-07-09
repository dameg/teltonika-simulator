Status: IMPLEMENTATION_COMPLETE

Summary:
- Added polling-friendly status APIs for per-device status lists, per-device status detail, and aggregate status counts.
- Added log read and clear APIs with IMEI, severity, type, and limit filtering.
- Added guarded dashboard state clear behavior for in-memory devices, runtime state, and logs.
- Added integration coverage for the new status, log, and clear endpoints.
- Removed runtime-only orphan records from status list and overview composition to address `REV-001`.

Changed Files:
- `src/dashboard/app.module.ts`
- `src/dashboard/logging/logging.controller.ts`
- `src/dashboard/logging/logging.module.ts`
- `src/dashboard/logging/logging.service.ts`
- `src/dashboard/status/status.controller.ts`
- `src/dashboard/status/status.module.ts`
- `src/dashboard/status/status.service.ts`
- `tests/dashboard-runtime.test.ts`

Verification:
- `npm run build` ✅
- `npm run typecheck` ✅
- `npm test` ✅
- `npm test -- tests/dashboard-runtime.test.ts` ✅

Notes:
- Addressed review finding `REV-001` by scoping `/api/status/devices` and `/api/status/overview` to configured devices only.
- Full verification was rerun after the `REV-001` follow-up patch and passed.
