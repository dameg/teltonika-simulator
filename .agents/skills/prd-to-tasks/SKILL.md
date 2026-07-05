---
name: prd-to-tasks
description: Convert a software PRD into an ordered, dependency-aware implementation task file suitable for autonomous coding loops such as Ralph.
---

# PRD to Tasks

Convert the supplied PRD into a deterministic, dependency-aware implementation
task plan suitable for autonomous coding iterations.

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
- Existing task plan.
- Preferred task output path.

Default output:

`docs/tasks/<prd-name>-tasks.md`

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

## Process

### 1. Read Project Context

Read:

1. The complete PRD.
2. Repository-level instructions such as `AGENTS.md`.
3. Files listed in the PRD's `Relevant Files` section.
4. Existing architecture documents.
5. Existing source code and tests when present.
6. The existing task plan when revising one.

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
- vehicle simulation with Codec encoding;
- device-specific IO mapping with route movement;
- networking with telemetry generation;
- reconnect logic with binary serialization.

For a virtual-device simulator, prefer this flow:

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

### 7. Write Each Task

Use this exact structure:

## TASK-NNN: Imperative Title

**Status:** blocked | ready

**Depends on:** task IDs or `none`

**Goal**

One concise, observable outcome.

**Scope**

- Exact work included in the task.
- Modules, files, or behavior expected to be created or changed.

**Relevant Files**

- Files that must be read.
- Files expected to be created or modified.
- External references only when directly relevant.

**Acceptance Criteria**

- Observable and testable conditions.
- Avoid criteria based only on private helper calls.

**Verification**

List exact commands in a shell code block.

**Out of Scope**

- Closely related work explicitly excluded from the task.

### 8. Assign Initial Statuses

Use only:

- `ready`
- `blocked`

Mark dependency-free tasks as `ready`.

Mark tasks with unfinished dependencies as `blocked`.

Do not initially use:

- `in_progress`
- `done`
- `failed`

### 9. Add Execution Rules

At the top of the generated task file include:

- Work on exactly one task at a time.
- Select the first task with status `ready`.
- Verify that all dependencies are `done`.
- Read all relevant files before implementation.
- Do not silently expand scope.
- Run every verification command.
- Mark a task `done` only after all acceptance criteria pass.
- Unblock a task only when every dependency is `done`.
- Commit each completed task separately.
- Do not include unrelated refactors in a task commit.
- Stop when no ready tasks remain.
- Never modify files under `references/`.

### 10. Handle Simulation Requirements

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

### 11. Handle Device Profiles

When the project supports device-specific field or IO mappings, create separate
tasks for:

- defining the device-profile format;
- providing a default profile;
- mapping generic simulation state into device-specific values;
- testing exact IO identifiers and encoded values.

Do not place device-specific mapping inside the route engine or TCP session.

### 12. Handle Protocol Requirements

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

### 13. Handle Integration Testing Early

Create reusable parser, server, or protocol fixtures before multiple networking
tasks depend on them.

Do not postpone all external behavior testing until the final task.

Each networking task should add focused parser-visible tests for its behavior.

The final end-to-end task should compose existing fixtures and verify the
complete flow without rewriting all previous test infrastructure.

### 14. Handle Open Questions

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

### 15. Validate Coverage

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

### 16. Add a Traceability Matrix

Include a final traceability matrix:

| PRD requirement | Covered by |
| --------------- | ---------- |
| Requirement     | TASK-NNN   |

Include:

- acceptance criteria;
- protocol requirements;
- simulation requirements;
- major functional requirements;
- architecture boundaries;
- important non-goals.

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
