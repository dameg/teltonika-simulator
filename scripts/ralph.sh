#!/usr/bin/env bash

set -Eeuo pipefail

TASK_FILE="${TASK_FILE:-docs/tasks/teltonika-gps-device-simulator-tasks.md}"
MAX_ITERATIONS=3
RALPH_DIR="${RALPH_DIR:-.ralph}"
LAST_MESSAGE_FILE="${RALPH_DIR}/last-message.md"

mkdir -p "$RALPH_DIR"

log() {
  printf '[ralph] %s\n' "$*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 \
    || fail "Required command not found: $1"
}

require_command codex
require_command git
require_command awk
require_command grep

[[ -f "$TASK_FILE" ]] || fail "Task file not found: $TASK_FILE"
[[ -f "AGENTS.md" ]] || fail "AGENTS.md not found"
[[ -f "docs/teltonika-gps-device-simulator-prd.md" ]] \
  || fail "PRD not found"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "Run Ralph from the root of a Git repository"

# Ralph powinien startować ze znanego, czystego stanu.
if [[ -n "$(git status --porcelain)" ]]; then
  fail "Working tree is not clean. Commit or stash existing changes first."
fi

find_first_ready_task() {
  awk '
    /^## TASK-[0-9]+:/ {
      task_id = $2
      sub(/:$/, "", task_id)

      title = $0
      sub(/^## TASK-[0-9]+: /, "", title)
    }

    /^\*\*Status:\*\* ready$/ {
      print task_id "|" title
      exit
    }
  ' "$TASK_FILE"
}

get_task_status() {
  local wanted_task="$1"

  awk -v wanted="$wanted_task" '
    /^## TASK-[0-9]+:/ {
      current = $2
      sub(/:$/, "", current)
    }

    current == wanted && /^\*\*Status:\*\*/ {
      status = $0
      sub(/^\*\*Status:\*\* /, "", status)
      print status
      exit
    }
  ' "$TASK_FILE"
}

count_tasks_with_status() {
  local status="$1"
  grep -c "^\*\*Status:\*\* ${status}$" "$TASK_FILE" || true
}

for ((iteration = 1; iteration <= MAX_ITERATIONS; iteration++)); do
  ready_task="$(find_first_ready_task)"

  if [[ -z "$ready_task" ]]; then
    blocked_count="$(count_tasks_with_status blocked)"
    failed_count="$(count_tasks_with_status failed)"

    if (( failed_count > 0 )); then
      fail "No ready tasks remain, but ${failed_count} task(s) are failed."
    fi

    if (( blocked_count > 0 )); then
      fail "No ready tasks remain, but ${blocked_count} task(s) are still blocked. Check dependencies."
    fi

    log "All tasks are complete."
    exit 0
  fi

  task_id="${ready_task%%|*}"
  task_title="${ready_task#*|}"

  log "Iteration ${iteration}/${MAX_ITERATIONS}"
  log "Starting ${task_id}: ${task_title}"

  head_before="$(git rev-parse HEAD)"

  set +e
  codex exec \
    --ephemeral \
    --sandbox workspace-write \
    --config 'sandbox_workspace_write.network_access=true' \
    --output-last-message "$LAST_MESSAGE_FILE" \
    - <<EOF
Follow AGENTS.md.

Execute exactly one task:

${task_id}: ${task_title}

Instructions:

1. Read AGENTS.md, the complete PRD, and the complete task definition.
2. Verify that every dependency of ${task_id} has status done.
3. Change only ${task_id} from ready to in_progress.
4. Implement only the scope of ${task_id}.
5. Read every file listed under Relevant Files for ${task_id}.
6. Run every verification command listed in ${task_id}.
7. Mark ${task_id} done only when every acceptance criterion passes.
8. Change newly unblocked tasks to ready only when all their dependencies are done.
9. If verification cannot be completed successfully, mark ${task_id} failed and record the reason.
10. Do not work on another task.
11. Do not modify anything under references/.
12. Commit the completed task as one isolated Git commit.
13. Stop immediately after finishing ${task_id}.
EOF

  codex_exit_code=$?
  set -e

  if (( codex_exit_code != 0 )); then
    log "Codex exited with code ${codex_exit_code}."
    log "Last message: ${LAST_MESSAGE_FILE}"
    exit "$codex_exit_code"
  fi

  task_status="$(get_task_status "$task_id")"

  if [[ "$task_status" != "done" ]]; then
    log "${task_id} ended with status: ${task_status:-unknown}"
    log "Ralph is stopping instead of moving to another task."
    log "Last message: ${LAST_MESSAGE_FILE}"
    exit 1
  fi

  head_after="$(git rev-parse HEAD)"

  # Fallback, gdy agent poprawnie skończył task, ale nie utworzył commita.
  if [[ "$head_before" == "$head_after" ]]; then
    if [[ -z "$(git status --porcelain)" ]]; then
      fail "${task_id} is marked done, but there are no changes and no commit."
    fi

    log "Agent did not create a commit. Creating fallback commit."

    git add -A
    git commit -m "${task_id}: ${task_title}"
  fi

  if [[ -n "$(git status --porcelain)" ]]; then
    fail "Working tree is dirty after ${task_id}. Review changes before continuing."
  fi

  log "Completed ${task_id}."
  log
done

fail "Reached MAX_ITERATIONS=${MAX_ITERATIONS} before finishing all tasks."
