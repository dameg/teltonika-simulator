---
id: TASK-001
title: Bootstrap NestJS Dashboard And React App Shell
initial_status: ready
depends_on: []
source_prd: docs/teltonika-device-control-dashboard-prd.md
workflow_version: 2
---

# TASK-001: Bootstrap NestJS Dashboard And React App Shell

## Goal

Create the NestJS application shell, React frontend entrypoint, and project
tooling needed to run the new dashboard iteration locally.

## Scope

- Add the minimum NestJS application structure needed for a dashboard backend.
- Add the minimum React application structure needed for the browser UI.
- Wire build, typecheck, and test flows so NestJS and React code can coexist in
  this repository without breaking the existing simulator modules.
- Keep the bootstrap narrow: application shell, module structure, startup
  wiring, and placeholder routes/views only.

## Relevant Files

### Read

- AGENTS.md
- docs/teltonika-device-control-dashboard-prd.md
- package.json
- tsconfig.json
- src/index.ts
- scripts/ralph.sh

### Expected to Create or Modify

- package.json
- tsconfig.json
- src/dashboard/
- src/index.ts
- tests/

## Acceptance Criteria

- The repository contains a NestJS application entrypoint for the dashboard.
- The repository contains a React frontend entrypoint served by the dashboard
  application.
- Build and typecheck commands cover both the simulator code and the new
  dashboard code.
- Existing simulator CLI wiring remains available.
- The bootstrap does not yet implement device CRUD, simulator control, or log
  persistence beyond placeholders needed to start the app.

## Verification

```bash
npm run build
npm run typecheck
npm test
```

## Out of Scope

- Device CRUD behavior.
- Simulator lifecycle control.
- Polling UI behavior.
- Parser-visible end-to-end integration.
