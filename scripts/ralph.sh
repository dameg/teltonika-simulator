#!/usr/bin/env bash

set -Eeuo pipefail

# -----------------------------------------------------------------------------
# Configuration
# -----------------------------------------------------------------------------

RALPH_DIR="${RALPH_DIR:-.ralph}"
TASK_WORKSPACE="${TASK_WORKSPACE:-docs/tasks/teltonika-gps-device-simulator}"
MANIFEST_FILE="${MANIFEST_FILE:-${TASK_WORKSPACE}/manifest.json}"

PLANNER_PROMPT="${PLANNER_PROMPT:-${RALPH_DIR}/prompts/planner.md}"
IMPLEMENTER_PROMPT="${IMPLEMENTER_PROMPT:-${RALPH_DIR}/prompts/implementer.md}"
REVIEWER_PROMPT="${REVIEWER_PROMPT:-${RALPH_DIR}/prompts/reviewer.md}"

MAX_ITERATIONS="${MAX_ITERATIONS:-20}"

RUNTIME_DIR="${RALPH_DIR}/runtime"
LAST_MESSAGE_FILE="${RUNTIME_DIR}/last-message.md"
QUALITY_GATE_FILE="${RUNTIME_DIR}/quality-gates.md"

PRD_FILE="${PRD_FILE:-docs/teltonika-gps-device-simulator-prd.md}"

mkdir -p "$RUNTIME_DIR"

# Keep Ralph runtime files out of the task commit without modifying .gitignore.
if [[ -d .git ]]; then
  mkdir -p .git/info
  touch .git/info/exclude

  if ! grep -qxF "/${RUNTIME_DIR}/" .git/info/exclude; then
    printf '/%s/\n' "$RUNTIME_DIR" >> .git/info/exclude
  fi
fi

# -----------------------------------------------------------------------------
# Logging and validation
# -----------------------------------------------------------------------------

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
require_command jq
require_command awk
require_command grep
require_command sed
require_command sort
require_command sha256sum

[[ -f "$MANIFEST_FILE" ]] \
  || fail "Manifest not found: $MANIFEST_FILE"

[[ -f "AGENTS.md" ]] \
  || fail "AGENTS.md not found"

[[ -f "$PRD_FILE" ]] \
  || fail "PRD not found: $PRD_FILE"

[[ -f "$PLANNER_PROMPT" ]] \
  || fail "Planner prompt not found: $PLANNER_PROMPT"

[[ -f "$IMPLEMENTER_PROMPT" ]] \
  || fail "Implementer prompt not found: $IMPLEMENTER_PROMPT"

[[ -f "$REVIEWER_PROMPT" ]] \
  || fail "Reviewer prompt not found: $REVIEWER_PROMPT"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 \
  || fail "Run Ralph from the root of a Git repository"

jq -e '
  .version == 2
  and .workflow == "planner-implementer-reviewer"
  and (.tasks | type == "array")
' "$MANIFEST_FILE" >/dev/null \
  || fail "Unsupported or invalid manifest format"

# -----------------------------------------------------------------------------
# Manifest helpers
# -----------------------------------------------------------------------------

manifest_tmp_file() {
  printf '%s.tmp\n' "$MANIFEST_FILE"
}

write_manifest_with_filter() {
  local tmp
  tmp="$(manifest_tmp_file)"

  jq "$@" "$MANIFEST_FILE" > "$tmp"
  mv "$tmp" "$MANIFEST_FILE"
}

get_task_field() {
  local task_id="$1"
  local field="$2"

  jq -r \
    --arg task_id "$task_id" \
    --arg field "$field" \
    '.tasks[] | select(.id == $task_id) | .[$field]' \
    "$MANIFEST_FILE"
}

set_task_status() {
  local task_id="$1"
  local status="$2"

  write_manifest_with_filter \
    --arg task_id "$task_id" \
    --arg status "$status" \
    '
      .tasks |= map(
        if .id == $task_id
        then .status = $status
        else .
        end
      )
    '
}

set_task_blocked() {
  local task_id="$1"
  local reason="$2"

  write_manifest_with_filter \
    --arg task_id "$task_id" \
    --arg reason "$reason" \
    '
      .tasks |= map(
        if .id == $task_id
        then .status = "blocked" | .blockReason = $reason
        else .
        end
      )
    '
}

clear_task_block_reason() {
  local task_id="$1"

  write_manifest_with_filter \
    --arg task_id "$task_id" \
    '
      .tasks |= map(
        if .id == $task_id
        then del(.blockReason)
        else .
        end
      )
    '
}

increment_task_attempt() {
  local task_id="$1"

  write_manifest_with_filter \
    --arg task_id "$task_id" \
    '
      .tasks |= map(
        if .id == $task_id
        then .attempt = ((.attempt // 0) + 1)
        else .
        end
      )
    '
}

promote_blocked_tasks() {
  write_manifest_with_filter '
    . as $manifest
    |
    .tasks |= map(
      if .status == "blocked"
        and ((.blockReason // "dependencies") == "dependencies")
        and all(
          .dependsOn[]?;
          . as $dependency_id
          |
          any(
            $manifest.tasks[];
            .id == $dependency_id and .status == "completed"
          )
        )
      then
        .status = "ready"
        | del(.blockReason)
      else
        .
      end
    )
  '
}

find_next_executable_task() {
  jq -r '
    . as $manifest
    |
    first(
      .tasks[]
      |
      select(
        .status == "ready"
        or .status == "planning"
        or .status == "planned"
        or .status == "implementing"
        or .status == "needs_changes"
        or .status == "needs_replan"
        or .status == "in_review"
      )
      |
      select(
        (.attempt // 0) < (.maxAttempts // 5)
      )
      |
      select(
        all(
          .dependsOn[]?;
          . as $dependency_id
          |
          any(
            $manifest.tasks[];
            .id == $dependency_id and .status == "completed"
          )
        )
      )
      |
      .id
    ) // empty
  ' "$MANIFEST_FILE"
}

get_task_directory() {
  local task_id="$1"
  local relative_path

  relative_path="$(get_task_field "$task_id" "path")"

  [[ -n "$relative_path" && "$relative_path" != "null" ]] \
    || fail "Missing path for task: $task_id"

  printf '%s/%s\n' "$TASK_WORKSPACE" "$relative_path"
}

check_attempt_limit() {
  local task_id="$1"
  local attempt
  local max_attempts

  attempt="$(get_task_field "$task_id" "attempt")"
  max_attempts="$(get_task_field "$task_id" "maxAttempts")"

  if (( attempt >= max_attempts )); then
    set_task_status "$task_id" "failed"
    fail "${task_id} reached maxAttempts=${max_attempts}"
  fi
}

# -----------------------------------------------------------------------------
# Workspace safety and recovery
# -----------------------------------------------------------------------------

active_task_count() {
  jq '
    [
      .tasks[]
      | select(
          .status == "planning"
          or .status == "planned"
          or .status == "implementing"
          or .status == "in_review"
          or .status == "needs_changes"
          or .status == "needs_replan"
        )
    ]
    | length
  ' "$MANIFEST_FILE"
}

validate_starting_worktree() {
  if [[ -z "$(git status --porcelain)" ]]; then
    return
  fi

  local active_count
  active_count="$(active_task_count)"

  if (( active_count == 1 )); then
    log "Working tree is dirty, but one task is active. Resuming workflow."
    return
  fi

  fail "Working tree is dirty without exactly one resumable active task. Commit, stash, or inspect existing changes."
}

validate_starting_worktree

# -----------------------------------------------------------------------------
# General helpers
# -----------------------------------------------------------------------------

assert_file_exists() {
  local path="$1"
  [[ -f "$path" ]] || fail "Required file not found: $path"
}

extract_result_field() {
  local file="$1"

  awk '
    {
      line = $0
      lower = tolower(line)

      if (lower ~ /^[[:space:]]*(status|result)[[:space:]]*:/) {
        sub(/^[^:]*:[[:space:]]*/, "", line)
        gsub(/[[:space:]]/, "", line)
        print toupper(line)
        exit
      }
    }
  ' "$file"
}

changed_paths_snapshot() {
  {
    git diff --name-only
    git diff --cached --name-only
    git ls-files --others --exclude-standard
  } | sed '/^[[:space:]]*$/d' | sort -u
}

workspace_checksum_excluding() {
  local excluded_path="$1"

  {
    git diff --binary -- . ":(exclude)${excluded_path}"
    git diff --cached --binary -- . ":(exclude)${excluded_path}"

    while IFS= read -r file; do
      [[ "$file" == "$excluded_path" ]] && continue
      [[ -f "$file" ]] || continue
      printf 'UNTRACKED %s\n' "$file"
      sha256sum "$file"
    done < <(git ls-files --others --exclude-standard | sort)
  } | sha256sum | awk '{print $1}'
}

# -----------------------------------------------------------------------------
# Codex role execution
# -----------------------------------------------------------------------------

run_codex_role() {
  local role="$1"
  local role_prompt="$2"
  local task_id="$3"
  local task_title="$4"
  local task_directory="$5"
  local extra_context="${6:-}"

  log "Running ${role} for ${task_id}: ${task_title}"

  set +e

  codex exec \
    --ephemeral \
    --sandbox workspace-write \
    --config 'sandbox_workspace_write.network_access=true' \
    --output-last-message "$LAST_MESSAGE_FILE" \
    - <<EOF
Follow all applicable AGENTS.md files.

You are acting as the ${role} role for exactly one task.

Task:
${task_id}: ${task_title}

Task directory:
${task_directory}

Role contract:
${role_prompt}

Required instructions:

1. Read the complete role contract from ${role_prompt}.
2. Read ${task_directory}/task.md.
3. Read AGENTS.md and every nested AGENTS.md applicable to affected files.
4. Read the PRD referenced by task.md.
5. Read all relevant files listed in task.md.
6. Read plan.md, progress.md, and review.md when they exist and are relevant to your role.
7. Work only on ${task_id}.
8. Do not modify ${MANIFEST_FILE}.
9. Do not change runtime task status.
10. Do not create Git commits.
11. Do not work on another task.
12. Do not modify anything under references/.
13. Stop immediately after finishing your role output.

${extra_context}
EOF

  local exit_code=$?
  set -e

  if (( exit_code != 0 )); then
    log "Codex ${role} exited with code ${exit_code}."
    log "Last message: ${LAST_MESSAGE_FILE}"
    return "$exit_code"
  fi
}

# -----------------------------------------------------------------------------
# Planner stage
# -----------------------------------------------------------------------------

run_planner() {
  local task_id="$1"
  local task_title="$2"
  local task_directory="$3"
  local plan_file="${task_directory}/plan.md"

  set_task_status "$task_id" "planning"

  run_codex_role \
    "planner" \
    "$PLANNER_PROMPT" \
    "$task_id" \
    "$task_title" \
    "$task_directory"

  assert_file_exists "$plan_file"

  local result
  result="$(extract_result_field "$plan_file")"

  case "$result" in
    READY)
      clear_task_block_reason "$task_id"
      set_task_status "$task_id" "planned"
      log "${task_id} planning completed."
      ;;

    BLOCKED)
      set_task_blocked "$task_id" "planner"
      log "${task_id} planning is blocked."
      ;;

    NEEDS_CLARIFICATION)
      set_task_blocked "$task_id" "clarification"
      log "${task_id} requires clarification."
      ;;

    *)
      fail "Planner did not record READY, BLOCKED, or NEEDS_CLARIFICATION in ${plan_file}"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Deterministic quality gates
# -----------------------------------------------------------------------------

extract_verification_script() {
  local task_file="$1"

  awk '
    /^## Verification[[:space:]]*$/ {
      in_verification = 1
      next
    }

    in_verification && /^```bash[[:space:]]*$/ {
      in_code = 1
      next
    }

    in_verification && in_code && /^```[[:space:]]*$/ {
      exit
    }

    in_verification && in_code {
      print
    }
  ' "$task_file"
}

run_quality_gates() {
  local task_id="$1"
  local task_directory="$2"
  local task_file="${task_directory}/task.md"
  local verification_script

  verification_script="$(extract_verification_script "$task_file")"

  [[ -n "$verification_script" ]] \
    || fail "No bash verification block found in ${task_file}"

  {
    printf '# Quality Gates\n\n'
    printf -- '- Task: `%s`\n' "$task_id"
    printf -- '- Task directory: `%s`\n\n' "$task_directory"
    printf '## Script\n\n```bash\n%s\n```\n\n' "$verification_script"
    printf '## Output\n\n```text\n'
  } > "$QUALITY_GATE_FILE"

  log "Running quality gates for ${task_id}"

  set +e
  bash -o pipefail -c "$verification_script" \
    >> "$QUALITY_GATE_FILE" 2>&1
  local exit_code=$?
  set -e

  {
    printf '\n```\n\n'
    printf 'Exit code: `%s`\n' "$exit_code"
  } >> "$QUALITY_GATE_FILE"

  if (( exit_code != 0 )); then
    log "Quality gates failed for ${task_id}. See ${QUALITY_GATE_FILE}"
    return 1
  fi

  log "Quality gates passed for ${task_id}."
  return 0
}

# -----------------------------------------------------------------------------
# Implementer stage
# -----------------------------------------------------------------------------

run_implementer() {
  local task_id="$1"
  local task_title="$2"
  local task_directory="$3"
  local progress_file="${task_directory}/progress.md"

  set_task_status "$task_id" "implementing"

  run_codex_role \
    "implementer" \
    "$IMPLEMENTER_PROMPT" \
    "$task_id" \
    "$task_title" \
    "$task_directory" \
    "If review.md exists, resolve all unresolved blocking findings and reference their stable finding IDs in progress.md."

  assert_file_exists "$progress_file"

  local result
  result="$(extract_result_field "$progress_file")"

  case "$result" in
    BLOCKED)
      set_task_blocked "$task_id" "implementer"
      log "${task_id} implementation is blocked."
      return
      ;;

    IN_PROGRESS)
      increment_task_attempt "$task_id"
      set_task_status "$task_id" "needs_changes"
      log "${task_id} implementation remains in progress."
      return
      ;;

    VERIFICATION_FAILED)
      increment_task_attempt "$task_id"
      set_task_status "$task_id" "needs_changes"
      log "${task_id} implementer reported verification failure."
      return
      ;;

    IMPLEMENTATION_COMPLETE|"")
      # Empty is tolerated because deterministic gates remain authoritative.
      ;;

    *)
      fail "Unsupported implementer status in ${progress_file}: ${result}"
      ;;
  esac

  if ! run_quality_gates "$task_id" "$task_directory"; then
    increment_task_attempt "$task_id"
    set_task_status "$task_id" "needs_changes"
    return
  fi

  set_task_status "$task_id" "in_review"
  log "${task_id} implementation passed deterministic quality gates."
}

# -----------------------------------------------------------------------------
# Reviewer stage
# -----------------------------------------------------------------------------

run_reviewer() {
  local task_id="$1"
  local task_title="$2"
  local task_directory="$3"
  local review_file="${task_directory}/review.md"

  # Reviewer only runs against a verified implementation.
  if ! run_quality_gates "$task_id" "$task_directory"; then
    increment_task_attempt "$task_id"
    set_task_status "$task_id" "needs_changes"
    return
  fi

  local checksum_before
  checksum_before="$(workspace_checksum_excluding "$review_file")"

  run_codex_role \
    "reviewer" \
    "$REVIEWER_PROMPT" \
    "$task_id" \
    "$task_title" \
    "$task_directory" \
    "Deterministic quality-gate output is available at ${QUALITY_GATE_FILE}. Review the current uncommitted task diff. You may create or update only ${review_file}; do not modify production code, tests, plan.md, progress.md, task.md, or manifest.json."

  assert_file_exists "$review_file"

  local checksum_after
  checksum_after="$(workspace_checksum_excluding "$review_file")"

  if [[ "$checksum_before" != "$checksum_after" ]]; then
    fail "Reviewer modified files other than ${review_file}"
  fi

  local result
  result="$(extract_result_field "$review_file")"

  case "$result" in
    PASS)
      # Re-run after review to guarantee the exact committed tree is green.
      if ! run_quality_gates "$task_id" "$task_directory"; then
        increment_task_attempt "$task_id"
        set_task_status "$task_id" "needs_changes"
        return
      fi

      clear_task_block_reason "$task_id"
      set_task_status "$task_id" "completed"
      promote_blocked_tasks

      if [[ -z "$(git status --porcelain)" ]]; then
        fail "${task_id} passed review, but there are no changes to commit"
      fi

      git add -A
      git commit -m "${task_id}: ${task_title}"

      if [[ -n "$(git status --porcelain)" ]]; then
        fail "Working tree is dirty after committing ${task_id}"
      fi

      log "${task_id} completed and committed."
      ;;

    FAIL)
      increment_task_attempt "$task_id"
      set_task_status "$task_id" "needs_changes"
      log "${task_id} requires implementation changes."
      ;;

    NEEDS_REPLAN)
      increment_task_attempt "$task_id"
      set_task_status "$task_id" "needs_replan"
      log "${task_id} requires replanning."
      ;;

    *)
      fail "Reviewer did not record PASS, FAIL, or NEEDS_REPLAN in ${review_file}"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Stage dispatch
# -----------------------------------------------------------------------------

process_task_stage() {
  local task_id="$1"
  local task_title
  local task_status
  local task_directory

  task_title="$(get_task_field "$task_id" "title")"
  task_status="$(get_task_field "$task_id" "status")"
  task_directory="$(get_task_directory "$task_id")"

  assert_file_exists "${task_directory}/task.md"
  check_attempt_limit "$task_id"

  log "Processing ${task_id}: ${task_title}"
  log "Current status: ${task_status}"

  case "$task_status" in
    ready|planning|needs_replan)
      run_planner "$task_id" "$task_title" "$task_directory"
      ;;

    planned|implementing|needs_changes)
      assert_file_exists "${task_directory}/plan.md"
      run_implementer "$task_id" "$task_title" "$task_directory"
      ;;

    in_review)
      assert_file_exists "${task_directory}/plan.md"
      assert_file_exists "${task_directory}/progress.md"
      run_reviewer "$task_id" "$task_title" "$task_directory"
      ;;

    *)
      fail "Task ${task_id} cannot be processed from status ${task_status}"
      ;;
  esac
}

# -----------------------------------------------------------------------------
# Main loop
# -----------------------------------------------------------------------------

for ((iteration = 1; iteration <= MAX_ITERATIONS; iteration++)); do
  promote_blocked_tasks

  task_id="$(find_next_executable_task)"

  if [[ -z "$task_id" ]]; then
    failed_count="$(
      jq '[.tasks[] | select(.status == "failed")] | length' \
        "$MANIFEST_FILE"
    )"

    blocked_count="$(
      jq '[.tasks[] | select(.status == "blocked")] | length' \
        "$MANIFEST_FILE"
    )"

    incomplete_count="$(
      jq '[.tasks[] | select(.status != "completed")] | length' \
        "$MANIFEST_FILE"
    )"

    if (( failed_count > 0 )); then
      fail "No executable tasks remain, but ${failed_count} task(s) failed."
    fi

    if (( incomplete_count == 0 )); then
      log "All tasks are complete."
      exit 0
    fi

    fail "No executable tasks remain. ${blocked_count} task(s) are blocked."
  fi

  log "Iteration ${iteration}/${MAX_ITERATIONS}"
  process_task_stage "$task_id"
  log
done

fail "Reached MAX_ITERATIONS=${MAX_ITERATIONS} before finishing all tasks."
