# AGENTS.md

## Purpose

This repository uses a multi-agent Ralph workflow for planning, implementing,
reviewing, and completing software tasks.

Agents must respect repository architecture, existing conventions, task scope,
and the ownership rules defined in this file.

Do not silently expand scope, rewrite completed work, or bypass verification.

## Instruction Scope

This file applies to the entire repository unless a nested `AGENTS.md` provides
more specific instructions for a directory subtree.

When multiple `AGENTS.md` files apply:

1. Use the repository-root `AGENTS.md` as the global baseline.
2. Apply nested `AGENTS.md` instructions to files within their subtree.
3. Prefer the closest applicable `AGENTS.md` when instructions conflict.
4. Report unresolved conflicts instead of guessing.

## Source Priority

When requirements conflict, use this priority:

1. Current task specification in `task.md`.
2. Applicable `AGENTS.md` files.
3. Current PRD.
4. Architecture documents.
5. Official vendor or protocol documentation.
6. Existing implementation and tests.
7. External implementation references.

External references are implementation evidence, not automatically the
authoritative specification.

## Task Workspace

Task workspaces live under:

```text
docs/tasks/<prd-name>/
```

Each workspace contains:

```text
docs/tasks/<prd-name>/
├── manifest.json
├── TRACEABILITY.md
├── TASK-NNN-kebab-case-title/
│   ├── task.md
│   ├── plan.md
│   ├── progress.md
│   └── review.md
└── ...
```

Not every task directory contains all workflow files immediately.

Expected lifecycle:

```text
task.md
   |
   v
planner -> plan.md
   |
   v
implementer -> code + tests + progress.md
   |
   v
reviewer -> review.md
   |
   +--> PASS -> completed
   |
   +--> FAIL -> implementer fixes -> review again
   |
   +--> NEEDS_REPLAN -> planner updates plan.md
```

## File Ownership

### `task.md`

Owned by:

- `prd-to-tasks` during generation or migration.

Rules:

- treat as immutable after task execution begins;
- do not use as a progress log;
- do not change acceptance criteria to make implementation easier;
- do not alter task scope without explicit instruction;
- do not rewrite completed legacy tasks.

### `plan.md`

Owned by:

- planner.

Rules:

- planner creates or updates it;
- implementer and reviewer may read it;
- implementer must not rewrite it;
- reviewer must not rewrite it;
- replanning must preserve useful history or clearly document replaced
  assumptions.

### `progress.md`

Owned by:

- implementer.

Rules:

- implementer creates and updates it;
- planner and reviewer may read it;
- record completed work, changed files, verification results, blockers, and
  addressed review findings;
- do not use it to modify task scope;
- do not hide failed verification.

### `review.md`

Owned by:

- reviewer.

Rules:

- reviewer creates and updates it;
- planner and implementer may read it;
- implementer must not edit or delete reviewer findings;
- use stable finding IDs such as `REV-001`;
- preserve review history across attempts;
- return exactly one result:
  - `PASS`;
  - `FAIL`;
  - `NEEDS_REPLAN`.

### `manifest.json`

Owned at runtime by:

- orchestrator.

Rules:

- agents must not manually change runtime state unless explicitly acting as the
  orchestrator;
- preserve stable task IDs;
- preserve attempt counts and review state;
- do not infer completion only from file presence;
- do not mark a task completed before all completion conditions pass.

### `TRACEABILITY.md`

Owned by:

- task generator during generation or migration.

Rules:

- keep PRD requirements mapped to tasks;
- distinguish migrated coverage from newly generated coverage;
- record important non-goals and unresolved questions;
- do not use it as runtime state.

## Workflow Versions

Legacy completed tasks may use:

```yaml
workflow_version: 1
```

New or migrated unfinished tasks use:

```yaml
workflow_version: 2
```

Rules:

- do not retroactively create `plan.md`, `progress.md`, or `review.md` for
  completed workflow version 1 tasks;
- do not reopen completed legacy tasks without explicit instruction;
- unfinished legacy tasks may continue through workflow version 2 after
  migration;
- preserve original task IDs whenever possible.

## Task Statuses

Initial generation may use only:

- `ready`;
- `blocked`;
- `completed` for migrated completed legacy tasks.

Runtime statuses are managed by the orchestrator:

- `planning`;
- `planned`;
- `implementing`;
- `in_review`;
- `needs_changes`;
- `needs_replan`;
- `completed`;
- `failed`.

Status rules:

- `ready` means every dependency is completed;
- `blocked` means at least one dependency is incomplete or an unresolved
  blocker exists;
- `completed` means all acceptance criteria, verification, and review gates
  passed;
- do not set runtime statuses in `task.md`;
- do not reopen completed tasks automatically.

## Planner Role

The planner is responsible for understanding the task and preparing an
implementation plan.

Inputs:

- `task.md`;
- applicable `AGENTS.md` files;
- current PRD;
- relevant architecture documents;
- relevant source files and tests;
- unresolved review findings when replanning.

Responsibilities:

- inspect the existing implementation;
- identify files to create or modify;
- describe implementation steps in dependency order;
- identify risks, edge cases, and architecture constraints;
- define validation and error-handling strategy;
- define tests to add or update;
- define exact verification commands;
- create or update `plan.md`.

Restrictions:

- do not modify production code;
- do not modify tests;
- do not modify `task.md`;
- do not modify `progress.md`;
- do not modify `review.md`;
- do not mark a task completed;
- do not invent unresolved technology decisions;
- do not expand task scope silently.

Planner result must be one of:

- `READY`;
- `BLOCKED`;
- `NEEDS_CLARIFICATION`.

## Implementer Role

The implementer is responsible for implementing the approved task scope.

Inputs:

- `task.md`;
- `plan.md`;
- applicable `AGENTS.md` files;
- unresolved findings from `review.md`;
- relevant source files and tests.

Responsibilities:

- implement only the approved scope;
- preserve repository architecture and conventions;
- add or update tests;
- run required verification commands;
- create or update `progress.md`;
- resolve blocking review findings;
- document remaining blockers honestly.

Restrictions:

- do not modify `task.md`;
- do not modify `review.md`;
- do not expand scope silently;
- do not hide failed checks;
- do not mark a task completed;
- do not include unrelated refactors;
- do not commit before review unless explicitly instructed by the orchestrator.

Implementer status should be one of:

- `IMPLEMENTATION_COMPLETE`;
- `IN_PROGRESS`;
- `BLOCKED`;
- `VERIFICATION_FAILED`.

## Reviewer Role

The reviewer is responsible for independently evaluating the implementation.

Inputs:

- `task.md`;
- `plan.md`;
- `progress.md`;
- applicable `AGENTS.md` files;
- current code diff;
- test, lint, typecheck, and other verification results;
- relevant implementation and tests.

Responsibilities:

- verify every acceptance criterion;
- check implementation against task scope and plan;
- detect bugs, regressions, missing tests, and scope expansion;
- verify architecture boundaries;
- verify error handling and edge cases;
- verify that deterministic quality gates passed;
- create or update `review.md`.

Restrictions:

- do not modify production code;
- do not modify tests;
- do not modify `task.md`;
- do not modify `plan.md`;
- do not modify `progress.md`;
- do not return `PASS` while verification fails;
- do not downgrade blocking issues into optional suggestions.

Every blocking finding must include:

- stable finding ID;
- severity;
- affected file;
- description;
- expected behavior;
- status.

Reviewer result must be exactly one of:

- `PASS`;
- `FAIL`;
- `NEEDS_REPLAN`.

## Orchestrator Role

The orchestrator coordinates workflow state and role execution.

Responsibilities:

- read `manifest.json`;
- select the next executable task;
- verify that dependencies are completed;
- run exactly one workflow stage at a time;
- update runtime status;
- run deterministic quality gates;
- route failed review findings back to the implementer;
- route `NEEDS_REPLAN` back to the planner;
- increment attempt count when appropriate;
- stop when `maxAttempts` is reached;
- promote blocked tasks to ready when dependencies complete;
- commit only after review returns `PASS`, when task-level commits are enabled.

The orchestrator must not trust model claims without checking required
artifacts and command results.

Examples:

- planner returns `READY` -> verify `plan.md` exists;
- implementer returns `IMPLEMENTATION_COMPLETE` -> verify `progress.md` exists;
- reviewer returns `PASS` -> verify `review.md` exists and quality gates pass.

## Task Selection

Work on exactly one task at a time unless the orchestrator explicitly supports
safe parallel execution of dependency-independent tasks.

Select a task only when:

- its status is executable;
- all dependencies are completed;
- its attempt count is below `maxAttempts`;
- no unresolved repository-level blocker prevents execution.

Do not skip earlier ready tasks without a documented reason.

## Completion Rules

A task is complete only when:

- all acceptance criteria pass;
- all required verification commands pass;
- reviewer returns `PASS`;
- no blocking review findings remain;
- required workflow artifacts exist;
- manifest state is consistent with the filesystem.

Do not mark a task completed based only on:

- an agent statement;
- the presence of implementation files;
- partial test success;
- a clean-looking diff;
- completed coding without independent review.

## Verification

Verification must be deterministic and executed by the implementer and/or
orchestrator as required by the task.

Always use repository-defined commands from:

- `package.json`;
- workspace configuration;
- Makefiles;
- CI configuration;
- applicable `AGENTS.md`;
- `task.md`;
- `plan.md`.

Typical checks may include:

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
```

Do not invent commands that do not match the repository stack.

Do not claim a check passed unless it was executed successfully.

When verification fails:

- record the command;
- record the failure;
- do not mark the task complete;
- keep or return the task to implementation.

## Scope Discipline

Never silently expand task scope.

Do not include:

- unrelated refactors;
- speculative architecture changes;
- cleanup unrelated to acceptance criteria;
- dependency upgrades not required by the task;
- formatting changes across unrelated files;
- undocumented behavior changes.

When adjacent work is discovered:

- record it as a follow-up;
- create a separate task only when instructed;
- do not absorb it into the current task automatically.

## Architecture Boundaries

Keep responsibilities separate where applicable:

- configuration;
- domain models;
- route loading;
- route validation;
- route geometry;
- route interpolation;
- simulation state;
- driving-style behavior;
- device-profile mapping;
- protocol models;
- checksum logic;
- binary encoding;
- packet framing;
- transport sessions;
- reconnect behavior;
- runtime orchestration;
- observability;
- integration testing;
- documentation.

Do not combine simulation, encoding, networking, and orchestration into one
broad implementation unit.

For simulation systems, prefer:

```text
route + driving style + seed
            |
            v
vehicle simulation engine
            |
            v
device profile mapping
            |
            v
protocol domain record
            |
            v
binary encoder
            |
            v
transport session
```

## Protocol Work

Separate protocol responsibilities when practical:

- protocol domain models;
- checksum or CRC;
- record encoding;
- packet framing;
- handshake framing;
- acknowledgement parsing;
- session lifecycle.

Checksum implementations must define:

- algorithm variant;
- polynomial;
- initial value;
- input reflection;
- output reflection;
- final XOR;
- byte range;
- byte order;
- protocol field representation.

Do not validate a copied checksum implementation only against itself.

Use at least one independent known test vector or valid packet fixture.

## Simulation Work

Simulation logic must remain independent from networking.

Simulation tasks should explicitly consider:

- deterministic seed behavior;
- simulation clock or interval;
- route geometry;
- interpolation;
- heading;
- speed;
- acceleration;
- braking;
- stopping;
- idling;
- ignition;
- movement state;
- driving events;
- end-of-route behavior;
- mapping into protocol values.

Tests should verify:

- identical inputs produce identical outputs;
- different profiles produce observably different behavior;
- positions progress smoothly;
- known coordinates produce expected encoded values;
- end-of-route behavior is deterministic.

## Integration Testing

Create reusable parser, server, or protocol fixtures before multiple networking
tasks depend on them.

Do not postpone all external behavior testing until the final task.

Each networking task should add focused parser-visible tests.

Final end-to-end tests should compose existing fixtures instead of rebuilding
all test infrastructure.

## Existing Workspace Protection

When a task workspace already exists:

- preserve task directories containing `plan.md`, `progress.md`, or `review.md`;
- do not overwrite `task.md` for started tasks;
- preserve runtime state in `manifest.json`;
- do not renumber existing task IDs;
- do not delete tasks silently;
- preserve manually added files;
- append new tasks using the next available task ID;
- report conflicts instead of silently rewriting active work.

A task is considered started when:

- its manifest status is not `ready`, `blocked`, or `completed`;
- or its directory contains `plan.md`;
- or its directory contains `progress.md`;
- or its directory contains `review.md`.

## Git and Commits

Do not include unrelated changes in a task commit.

When task-level commits are enabled:

- implementation remains uncommitted during review;
- reviewer inspects the current task diff;
- orchestrator commits only after `PASS`;
- commit message should include the task ID;
- one completed task should normally produce one focused commit.

Example:

```text
TASK-014: add device registration
```

Do not rewrite unrelated history.

Do not force push unless explicitly instructed.

## Legacy Task Migration

When migrating legacy tasks:

- preserve existing task IDs whenever possible;
- preserve completion state;
- map `done`, `completed`, checked items, or explicitly finished work to
  `completed`;
- map unfinished dependency-free tasks to `ready`;
- map unfinished tasks with incomplete dependencies to `blocked`;
- do not retroactively create workflow artifacts for completed tasks;
- do not reopen completed tasks;
- use workflow version 1 for completed legacy tasks;
- use workflow version 2 for unfinished tasks continuing under the new
  workflow;
- report ambiguous statuses or dependencies instead of guessing.

Do not generate duplicate tasks for work already completed.

## Open Questions and Blockers

Do not write `Open Questions: None` unless all meaningful decisions are
resolved.

Report unresolved questions when they affect:

- technology choices;
- architecture boundaries;
- protocol behavior;
- retry semantics;
- acknowledgement handling;
- route completion behavior;
- device-profile mappings;
- configuration precedence;
- verification strategy.

When a blocker prevents safe implementation:

- document it;
- return the appropriate blocked or clarification status;
- do not invent a decision.

## Restricted Files

Do not modify files under:

```text
references/
```

unless explicitly instructed.

Do not modify generated external fixtures, vendor snapshots, or protocol
reference files unless the task explicitly requires it.

## General Quality Rules

- Prefer small, reviewable changes.
- Reuse existing patterns where appropriate.
- Preserve public behavior unless the task requires a change.
- Keep domain logic independent from transport and infrastructure.
- Add tests for observable behavior.
- Avoid tests coupled only to private helper implementation.
- Keep errors explicit and actionable.
- Preserve backward compatibility unless explicitly out of scope.
- Be honest about failed checks, incomplete work, and uncertainty.

## Tooling conventions

When inspecting or displaying source-code files in the terminal, prefer:

```bash
bat --style=numbers --color=always --line-range START:END FILE
```

Avoid cat, sed, and nl for source-code display when bat is available.

For logs, JSON payloads, generated files, or command output, use the most appropriate standard tool.
