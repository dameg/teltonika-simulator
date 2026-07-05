---
id: TASK-001
title: Bootstrap TypeScript Node Project
initial_status: completed
depends_on: []
source_prd: docs/teltonika-gps-device-simulator-prd.md
workflow_version: 1
---

# TASK-001: Bootstrap TypeScript Node Project

## Goal

Create the minimal TypeScript, Node.js, and Vitest project skeleton.

## Scope

- Add `package.json` with scripts for `build`, `typecheck`, `test`, and local CLI execution.
- Add TypeScript configuration for Node.js.
- Add Vitest configuration.
- Add a minimal `src/` entry point and a smoke test.
- Add only development dependencies needed for TypeScript and Vitest.
- Do not add production dependencies unless required by a later task.

## Relevant Files

### Read

- AGENTS.md
- .ralph/WORKFLOW.md
- docs/teltonika-gps-device-simulator-prd.md
- docs/tasks/teltonika-gps-device-simulator-tasks.md
- README.md
- package.json
- tsconfig.json
- vitest.config.*
- src/
- tests/

### Expected to Create or Modify

- README.md
- package.json
- tsconfig.json
- vitest.config.*
- src/
- tests/

## Acceptance Criteria

- `npm install` completes successfully.
- `npm run build` compiles TypeScript.
- `npm run typecheck` succeeds.
- `npm test` runs Vitest successfully.
- No web framework or unnecessary production dependency is added.

## Verification

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Out of Scope

- CLI option parsing.
- Simulation logic.
- Binary encoding.
- TCP networking.
