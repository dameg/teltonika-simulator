---
name: prd-to-tasks
description: Convert a software PRD into an ordered, dependency-aware task workspace with one directory per task, suitable for multi-agent autonomous coding loops such as Ralph.
---

# PRD to Tasks

Convert the supplied PRD into a deterministic, dependency-aware task workspace
suitable for multi-agent autonomous coding iterations.

Do not implement production code.

## Inputs

Required:

- Path to the PRD.
- Repository structure and existing files.

Optional:

- Repository-level instructions such as `AGENTS.md`.
- External reference files.
- Architecture documents.
- Existing implementation.
- Existing task workspace.
- Preferred task output path.

Default output:

`docs/tasks/<prd-name>/`

The generated workspace must contain:

```text
docs/tasks/<prd-name>/
├── manifest.json
├── TRACEABILITY.md
├── TASK-001-kebab-case-title/
│   └── task.md
└── TASK-002-kebab-case-title/
    └── task.md
```

The generator must not create:

- `plan.md`
- `progress.md`
- `review.md`

These files belong to later workflow stages:

- planner creates `plan.md`;
- implementer creates and updates `progress.md`;
- reviewer creates and updates `review.md`.

The existence of these files represents actual workflow progress. Do not create
empty placeholders.

## Source Priority

When requirements conflict, use this priority:

1. Current PRD.
2. Repository-level instructions such as `AGENTS.md`.
3. Current architecture documents.
4. Official vendor or protocol documentation.
5. External implementation references.
6. Existing implementation details.

External implementation references are implementation evidence, not necessarily
the authoritative specification.

## File Ownership

The generator owns during initial generation:

- `manifest.json`;
- `TRACEABILITY.md`;
- every `task.md`.

After generation:

- the orchestrator owns runtime fields in `manifest.json`;
- the planner owns `plan.md`;
- the implementer owns `progress.md`;
- the reviewer owns `review.md`.

Treat `task.md` as immutable after execution of that task begins.

The generator must not modify runtime artifacts created by later workflow
stages.

## Process

### 1. Read Project Context

Read:

1. The complete PRD.
2. Repository-level instructions such as `AGENTS.md`.
3. Files listed in the PRD's `Relevant Files` section.
4. Existing architecture documents.
5. Existing source code and tests when present.
6. The existing task workspace when revising one.

Do not begin implementation.

### 2. Identify Deliverables

Extract:

- Functional requirements.
- Simulation requirements.
- Protocol requirements.
- Domain requirements.
- Architecture boundaries.
- Explicit implementation decisions.
- Behavioral decisions.
- Testing requirements.
- Acceptance criteria.
- Non-goals and out-of-scope behavior.
- Remaining unresolved questions.

Every acceptance criterion from the PRD must be covered by at least one task.

Every major protocol and simulation requirement must also be covered by at
least one task.

### 3. Respect Technology Decisions

Do not invent the implementation stack.

Use only technology decisions explicitly defined in:

- the PRD;
- `AGENTS.md`;
- architecture documents;
- existing repository configuration.

Do not arbitrarily choose:

- programming language;
- framework;
- test runner;
- package manager;
- database;
- message broker;
- deployment platform.

When a major technology decision is unresolved, add it under `Open Questions`
instead of selecting one.

### 4. Separate Architectural Responsibilities

When the PRD describes a simulation system, separate:

1. configuration;
2. simulation inputs;
3. route loading;
4. route validation;
5. route geometry;
6. route interpolation;
7. driving-style profiles;
8. simulation state evolution;
9. device-profile mapping;
10. protocol domain models;
11. checksum and binary encoding;
12. packet framing;
13. transport and session behavior;
14. runtime orchestration;
15. observability;
16. integration testing.

Do not combine:

- route logic with packet serialization;
- driving-style logic with TCP sessions;
- vehicle simulation with codec encoding;
- device-specific IO mapping with route movement;
- networking with telemetry generation;
- reconnect logic with binary serialization.

For a virtual-device simulator, prefer this flow:

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

### 5. Build the Dependency Graph

Order work from foundational to integrative.

A typical order is:

1. Project setup and tooling.
2. Configuration parsing and validation.
3. Domain types and pure utilities.
4. Route format and loader.
5. Route geometry and interpolation.
6. Driving-style definitions.
7. Deterministic simulation engine.
8. Device-profile mapping.
9. Protocol domain models.
10. Checksum implementation.
11. Record encoding.
12. Packet framing.
13. Dry-run and inspection tools.
14. Reusable local protocol test fixture.
15. Handshake behavior.
16. Send and acknowledgement handling.
17. Runtime send loop.
18. Reconnect behavior.
19. Multiple-device orchestration.
20. End-to-end tests.
21. Documentation.

Tasks must not depend on work scheduled later.

Dependencies must be acyclic.

### 6. Size Tasks

Each task should:

- Be independently understandable.
- Produce one coherent change.
- Normally fit into one autonomous agent iteration.
- Include tests or explicit verification.
- Avoid mixing unrelated layers.
- Avoid vague goals such as `implement the feature`.
- Avoid broad tasks containing setup, simulation, networking, and
  documentation together.
- Have a clear completion condition.

Split a task when it includes multiple independently testable responsibilities.

Responsibilities that should normally be separate include:

- project bootstrap and configuration parsing;
- route loading and route interpolation;
- domain models and scenario generation;
- CRC and packet encoding;
- record encoding and packet framing;
- handshake and reconnect behavior;
- single-device runtime and multi-device orchestration;
- local parser fixture and final end-to-end tests.

### 7. Create the Task Workspace

Create one directory per task.

Directory naming format:

`TASK-NNN-kebab-case-title`

Examples:

- `TASK-001-bootstrap-project`
- `TASK-002-validate-configuration`
- `TASK-003-load-route-file`

Each task directory initially contains exactly one generated file:

`task.md`

Do not initially create:

- `plan.md`
- `progress.md`
- `review.md`

### 8. Write Each Task

Use this exact structure for every `task.md`:

```markdown
---
id: TASK-NNN
title: Imperative Title
initial_status: ready | blocked
depends_on:
  - TASK-NNN
source_prd: path/to/prd.md
workflow_version: 2
---

# TASK-NNN: Imperative Title

## Goal

One concise, observable outcome.

## Scope

- Exact work included in the task.
- Modules, files, or behavior expected to be created or changed.

## Relevant Files

### Read

- Files that must be read.
- External references only when directly relevant.

### Expected to Create or Modify

- Files expected to be created or modified.

## Acceptance Criteria

- Observable and testable conditions.
- Avoid criteria based only on private helper calls.

## Verification

List exact commands in a shell code block.

## Out of Scope

- Closely related work explicitly excluded from the task.
```

When there are no dependencies, use:

```yaml
depends_on: []
```

Use imperative task titles.

Keep `task.md` focused on the implementation contract. Do not use it as a
runtime progress log.

### 9. Assign Initial Statuses

The generator may assign only:

- `ready`
- `blocked`

Mark dependency-free tasks as `ready`.

Mark tasks with unfinished dependencies as `blocked`.

Runtime statuses are managed exclusively by the orchestrator after generation.

Possible runtime statuses include:

- `planning`
- `planned`
- `implementing`
- `in_review`
- `needs_changes`
- `needs_replan`
- `completed`
- `failed`

Do not write runtime status changes into `task.md`.

### 10. Create the Manifest

Create:

`docs/tasks/<prd-name>/manifest.json`

Use this structure:

```json
{
  "version": 2,
  "workflow": "planner-implementer-reviewer",
  "sourcePrd": "path/to/prd.md",
  "tasks": [
    {
      "id": "TASK-001",
      "title": "Bootstrap the project",
      "path": "TASK-001-bootstrap-project",
      "status": "ready",
      "dependsOn": [],
      "attempt": 0,
      "maxAttempts": 5
    }
  ]
}
```

Requirements:

- Store runtime status in the manifest.
- Store task directory paths relative to the workspace.
- Preserve stable task IDs.
- Use the manifest as the machine-readable task index.
- Do not duplicate full task specifications in the manifest.
- Do not infer task completion only from the presence of markdown files.

The generator sets only initial status values.

The orchestrator later owns:

- `status`;
- `attempt`;
- review-loop state;
- retry state;
- promotion from `blocked` to `ready`.

### 11. Define Workflow Expectations

The generated workspace is intended for this pipeline:

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
   +--> FAIL -> implementer fixes -> reviewer retries
   |
   +--> NEEDS_REPLAN -> planner updates plan.md
```

Role boundaries:

#### Planner

- Reads `task.md`, repository context, and relevant files.
- Creates or updates `plan.md`.
- Does not modify production code.
- Does not modify `review.md`.
- Does not mark the task completed.

#### Implementer

- Reads `task.md`, `plan.md`, unresolved review findings, and relevant files.
- Modifies production code and tests.
- Creates or updates `progress.md`.
- Does not modify `task.md`.
- Does not modify `review.md`.

#### Reviewer

- Reads `task.md`, `plan.md`, `progress.md`, the code diff, and test results.
- Creates or updates `review.md`.
- Does not modify production code.
- Does not modify `task.md`.
- Returns one of:
  - `PASS`;
  - `FAIL`;
  - `NEEDS_REPLAN`.

#### Orchestrator

- Selects the next executable task.
- Updates runtime state in `manifest.json`.
- Runs deterministic quality gates.
- Routes failed review findings back to the implementer.
- Routes `NEEDS_REPLAN` back to the planner.
- Marks a task completed only after all completion conditions pass.

### 12. Completion Rules

A task is complete only when:

- all acceptance criteria pass;
- all verification commands pass;
- reviewer returns `PASS`;
- no blocking review findings remain.

Work on exactly one task at a time unless the orchestrator explicitly supports
safe parallel execution of dependency-independent tasks.

Never silently expand task scope.

Commit each completed task separately when the repository workflow requires
task-level commits.

Do not include unrelated refactors in a task commit.

Stop when no task is eligible for execution.

Never modify files under `references/`.

### 13. Handle Simulation Requirements

When the PRD models a vehicle, tracker, device, or other evolving system,
ensure the task plan explicitly covers:

- input format;
- input validation;
- deterministic seed behavior;
- simulation clock or interval;
- route geometry;
- position interpolation;
- heading calculation;
- speed evolution;
- acceleration;
- braking;
- stopping;
- idling;
- ignition state;
- movement state;
- driving events;
- end-of-route behavior;
- mapping simulation state into protocol values.

Simulation tests should verify:

- identical inputs produce identical output sequences;
- different profiles produce observably different behavior;
- positions progress smoothly between route points;
- known coordinates produce expected encoded values;
- end-of-route behavior is deterministic;
- simulation logic is independent from networking.

### 14. Handle Device Profiles

When the project supports device-specific field or IO mappings, create separate
tasks for:

- defining the device-profile format;
- providing a default profile;
- mapping generic simulation state into device-specific values;
- testing exact IO identifiers and encoded values.

Do not place device-specific mapping inside the route engine or TCP session.

### 15. Handle Protocol Requirements

Separate protocol work into independently testable layers when practical:

- protocol domain models;
- checksum or CRC;
- record encoding;
- packet framing;
- handshake framing;
- acknowledgement parsing;
- session lifecycle.

Checksum tasks must define:

- exact algorithm variant;
- polynomial;
- initial value;
- input reflection behavior;
- output reflection behavior;
- final XOR;
- byte range;
- byte order;
- protocol field representation.

Do not validate a copied checksum implementation only against itself.

Require at least one independent known test vector or valid packet fixture.

### 16. Handle Integration Testing Early

Create reusable parser, server, or protocol fixtures before multiple networking
tasks depend on them.

Do not postpone all external behavior testing until the final task.

Each networking task should add focused parser-visible tests for its behavior.

The final end-to-end task should compose existing fixtures and verify the
complete flow without rewriting all previous test infrastructure.

### 17. Handle Open Questions

Do not write `Open Questions: None` unless all meaningful decisions have been
resolved.

Possible open questions include:

- route-file format;
- route completion behavior;
- simulation timing model;
- retry behavior;
- IMEI rejection behavior;
- acknowledgement mismatch behavior;
- device-profile IO mappings;
- multiple-device route synchronization;
- logging format;
- configuration precedence.

Do not reopen decisions already resolved in the PRD or `AGENTS.md`.

Do not create research-only tasks unless an unresolved decision genuinely
blocks implementation.

When unresolved questions affect the whole workspace, include them in
`TRACEABILITY.md` under an `Open Questions` section.

When a question affects only one task, include it in that task's `task.md`
under an `Open Questions` section after `Out of Scope`.

### 18. Validate Coverage

Before finishing, verify:

- Every PRD acceptance criterion maps to one or more tasks.
- Every major protocol requirement maps to one or more tasks.
- Every major simulation requirement maps to one or more tasks.
- Every task has executable verification.
- Dependencies are acyclic.
- No task depends on work scheduled later.
- No task is excessively broad.
- No task requires an unspecified major design decision.
- Non-goals were not accidentally included.
- Relevant external references are linked only to tasks that need them.
- Verification commands match the selected technology stack.
- Simulation, encoding, and networking remain separate.
- Every manifest entry points to an existing task directory.
- Every task directory contains `task.md`.
- No empty workflow artifact files were generated.
- Task IDs are unique and stable.

### 19. Create the Traceability Matrix

Create:

`docs/tasks/<prd-name>/TRACEABILITY.md`

Use this structure:

```markdown
# Traceability Matrix

## Requirements

| PRD requirement | Covered by |
| --------------- | ---------- |
| Requirement     | TASK-NNN   |

## Architecture Boundaries

| Boundary | Covered by |
| -------- | ---------- |
| Boundary | TASK-NNN   |

## Important Non-Goals

| Non-goal | Protected by |
| -------- | ------------ |
| Non-goal | TASK-NNN     |

## Open Questions

- Question, or `None` only when every meaningful decision is resolved.
```

Include:

- acceptance criteria;
- protocol requirements;
- simulation requirements;
- major functional requirements;
- architecture boundaries;
- important non-goals.

## Existing Workspace

When the output directory already exists:

- preserve every task directory containing `plan.md`, `progress.md`, or
  `review.md`;
- do not renumber existing task IDs;
- do not overwrite `task.md` for tasks whose execution has started;
- preserve runtime status, attempt count, and review state in `manifest.json`;
- append new tasks using the next available task ID;
- do not silently delete tasks for removed requirements;
- report removed or materially changed requirements;
- update dependencies only when doing so does not invalidate started or
  completed work;
- preserve manually added files in task directories.

A task is considered started when any of these conditions is true:

- its manifest status is not `ready` or `blocked`;
- its directory contains `plan.md`;
- its directory contains `progress.md`;
- its directory contains `review.md`.

When a started task conflicts materially with a revised PRD, report the
conflict instead of silently rewriting the task.

## Restrictions

- Do not implement code.
- Do not invent product requirements.
- Do not invent the implementation stack.
- Do not copy external reference architecture unless required by the PRD.
- Do not combine simulation, protocol encoding, and networking into one broad
  task.
- Do not create tasks that only say to investigate something unless a genuine
  unresolved decision blocks implementation.
- Surface unresolved decisions under `Open Questions`.
- Do not create empty workflow artifacts.
- Do not overwrite planner, implementer, reviewer, or orchestrator state.
- Do not treat `task.md` as a mutable progress tracker.
