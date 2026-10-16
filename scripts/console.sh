#!/usr/bin/env bash
# Interactive operations console. Bash 3.2+; Node 20.19+/22.12+.
set +x  # Never trace secret-bearing prompts or stdin pipes.
set -uo pipefail
umask 077
OPS_CALLER_DIR=$(pwd -P)
OPS_ROOT=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P) || exit 1
OPS_KIND=backend
OPS_ENV_FILE="$OPS_ROOT/.env"
OPS_MANAGER=npm
OPS_DRY_RUN=0
OPS_SINGLE_ACTION=''
ops_help() {
  cat <<'HELP'
ChurchOS Backend interactive operations console
Usage: bash scripts/console.sh [--env FILE] [--manager npm|pnpm] [--dry-run]
       bash scripts/console.sh [options] --action ACTION
       bash scripts/console.sh --list
Options:
  --env FILE       Select dotenv file; it overrides inherited values, never executes shell code.
  --manager NAME   Choose npm (default) or pnpm; installation requires its existing lockfile.
  --dry-run        Print the selected action plan without any commands/network/writes.
  --action ACTION  Run one menu action; confirmations and hidden passwords still apply.
  --list           List all action IDs.
  --help           Show this help.
Database reset is limited to local dev/test databases. Destructive DB actions back up first.
Database/auth operations belong to the backend console. No --yes bypass is provided.
HELP
}
OPS_LIST=0
while (($#)); do
  case "$1" in
    --help|-h) ops_help; exit 0 ;;
    --env|--manager|--action)
      [[ $# -ge 2 && -n "$2" ]] || { printf 'Missing value for %s\n' "$1" >&2; exit 2; }
      case "$1" in
        --env) case "$2" in /*) OPS_ENV_FILE=$2 ;; *) OPS_ENV_FILE="$OPS_CALLER_DIR/$2" ;; esac ;;
        --manager) [[ "$2" == npm || "$2" == pnpm ]] || { printf 'Choose npm or pnpm.\n' >&2; exit 2; }; OPS_MANAGER=$2 ;;
        --action) OPS_SINGLE_ACTION=$2 ;;
      esac
      shift 2 ;;
    --dry-run) OPS_DRY_RUN=1; shift ;;
    --list) OPS_LIST=1; shift ;;
    *) printf 'Unknown argument: %s\n' "$1" >&2; exit 2 ;;
  esac
done
command -v node >/dev/null 2>&1 || { printf 'Install Node.js 20.19+ or 22.12+ first.\n' >&2; exit 1; }
cd -- "$OPS_ROOT" || exit 1
ops_helper() { node "$OPS_ROOT/scripts/ops/cli.cjs" "$OPS_ENV_FILE" "$OPS_MANAGER" "$@"; }
ops_read() {
  printf '%s' "$1" >&2
  IFS= read -r OPS_ANSWER || return 130
}
ops_confirm() {
  printf '\nType exactly: %s\n' "$1" >&2
  ops_read '> ' || return 130
  if [[ "$OPS_ANSWER" != "$1" ]]; then printf 'Cancelled; confirmation did not match.\n' >&2; return 130; fi
  OPS_CONFIRM=$OPS_ANSWER
}
ops_admin() {
  local action=$1 email password='' repeated='' first last phone church_mode church_id='' church_name='' auth_mode auth_id='' token role
  ops_helper preview "$action" || return $?
  printf '\nAccount mode: 1) NEW login (default)  2) Link ORPHAN auth UUID (no existing profile)\n'
  ops_read 'Choice [1]: ' || return 130
  case "$OPS_ANSWER" in ''|1) auth_mode=new ;; 2) auth_mode=existing ;; *) printf 'Invalid account mode.\n' >&2; return 2 ;; esac
  ops_read 'Email: ' || return 130; email=$OPS_ANSWER
  if [[ "$auth_mode" == new ]]; then
    printf 'Password (12+ chars; upper/lower/number/symbol; hidden): ' >&2
    IFS= read -r -s password || { printf '\n' >&2; return 130; }; printf '\n' >&2
    printf 'Repeat password (hidden): ' >&2
    IFS= read -r -s repeated || { printf '\n' >&2; return 130; }; printf '\n' >&2
    [[ "$password" == "$repeated" ]] || { printf 'Passwords do not match.\n' >&2; return 2; }
  else
    ops_read 'Existing Supabase auth user UUID: ' || return 130; auth_id=$OPS_ANSWER
  fi
  ops_read 'First name: ' || return 130; first=$OPS_ANSWER
  ops_read 'Last name: ' || return 130; last=$OPS_ANSWER
  ops_read 'Phone (optional): ' || return 130; phone=$OPS_ANSWER
  printf '\nChurch: 1) Existing church  2) Create a new church\n'
  ops_read 'Choice: ' || return 130
  case "$OPS_ANSWER" in
    1) church_mode=existing; ops_helper run church-list || return $?; ops_read 'Church UUID: ' || return 130; church_id=$OPS_ANSWER ;;
    2) church_mode=new; ops_read 'New church name: ' || return 130; church_name=$OPS_ANSWER ;;
    *) printf 'Invalid church mode.\n' >&2; return 2 ;;
  esac
  role=church_admin; [[ "$action" != admin-super ]] || role=super_admin
  printf '\nReview: role=%s, email=%s, church=%s %s, auth=%s\nHQ scope: all branches WITHIN this church, subject to role permissions.\n' "$role" "$email" "$church_id" "$church_name" "$auth_mode"
  token=$(ops_helper token "$action") || return $?
  ops_confirm "$token" || return $?
  printf '%s\0' "$OPS_CONFIRM" "$email" "$password" "$first" "$last" "$phone" "$church_mode" "$church_id" "$church_name" "$auth_mode" "$auth_id" | ops_helper run "$action"
}
ops_dispatch() {
  local action=$1 input token value status
  input=$(ops_helper input "$action") || return $?
  if ((OPS_DRY_RUN)); then ops_helper plan "$action"; return $?; fi
  case "$action" in
    open-backend)
      if [[ ! -f "$OPS_ROOT/../ChurchOS-Backend/scripts/console.sh" ]]; then printf 'Sibling backend console not found. Open its scripts/console.sh separately.\n' >&2; return 1; fi
      bash "$OPS_ROOT/../ChurchOS-Backend/scripts/console.sh" --manager "$OPS_MANAGER"; return $? ;;
    admin-super|admin-church) ops_admin "$action"; return $? ;;
  esac
  case "$input" in
    confirm|restore|name)
      ops_helper preview "$action" || return $?
      value=''
      if [[ "$input" == restore ]]; then ops_read 'Trusted console .dump backup path (metadata sidecar required): ' || return 130; value=$OPS_ANSWER; printf '%s\0' "$value" | ops_helper backup-info "$action" || return $?; fi
      if [[ "$input" == name ]]; then ops_read 'Migration name (letters, numbers, underscore, hyphen): ' || return 130; value=$OPS_ANSWER; fi
      token=$(ops_helper token "$action") || return $?
      ops_confirm "$token" || return $?
      printf '%s\0' "$OPS_CONFIRM" "$value" | ops_helper run "$action" ;;
    port)
      ops_read 'Port [3000]: ' || return 130
      printf '%s\0' "${OPS_ANSWER:-3000}" | ops_helper run "$action" ;;
    url)
      if [[ "$OPS_KIND" == frontend ]]; then value='http://127.0.0.1:3000'; else value='http://127.0.0.1:3001'; fi
      ops_read "Base URL [$value]: " || return 130
      printf '%s\0' "${OPS_ANSWER:-$value}" | ops_helper run "$action" ;;
    clean)
      ops_confirm 'CLEAN .next' || return $?
      printf '%s\0' "$OPS_CONFIRM" | ops_helper run "$action" ;;
    none) ops_helper run "$action" ;;
    *) printf 'Unsupported input mode.\n' >&2; return 2 ;;
  esac
  status=$?
  return "$status"
}
ops_result() {
  local status=$1
  case "$status" in 0) printf '\nAction completed.\n' ;; 130) printf '\nAction cancelled.\n' ;; *) printf '\nAction failed (exit %s). The menu remains available.\n' "$status" >&2 ;; esac
}
ops_submenu() {
  local group=$1 title=$2 id label choice status index
  local ids=() labels=()
  while IFS=$'\t' read -r id label; do ids+=("$id"); labels+=("$label"); done < <(ops_helper menu "$group")
  while true; do
    printf '\n%s\nEnvironment: %s | Manager: %s\n' "$title" "$OPS_ENV_FILE" "$OPS_MANAGER"
    for ((index=0; index<${#ids[@]}; index++)); do printf ' %2d) %s\n' "$((index+1))" "${labels[$index]}"; done
    printf '  0) Back\n'
    ops_read 'Choice: ' || return 0; choice=$OPS_ANSWER
    [[ "$choice" != 0 ]] || return 0
    if [[ ! "$choice" =~ ^[1-9][0-9]*$ || ${#choice} -gt 3 ]] || ((choice>${#ids[@]})); then printf 'Choose a listed number.\n'; continue; fi
    ops_dispatch "${ids[$((choice-1))]}"; status=$?; ops_result "$status"
  done
}
trap 'printf "\nInterrupted; returning to console when the foreground action exits.\n" >&2' INT
if ((OPS_LIST)); then ops_helper list; exit $?; fi
if [[ -n "$OPS_SINGLE_ACTION" ]]; then ops_dispatch "$OPS_SINGLE_ACTION"; OPS_STATUS=$?; ops_result "$OPS_STATUS"; exit "$OPS_STATUS"; fi
while true; do
  printf '\nChurchOS %s console\nEnvironment: %s | Manager: %s\n 1) Setup and diagnostics\n 2) Development and quality\n' "$OPS_KIND" "$OPS_ENV_FILE" "$OPS_MANAGER"
  if [[ "$OPS_KIND" == backend ]]; then printf ' 3) Database and backups\n 4) Permissions and administrators\n 5) Workers and maintenance\n'; else printf ' 3) Maintenance and backend administration\n'; fi
  printf ' 0) Exit\n'
  ops_read 'Choice: ' || exit 0
  case "$OPS_ANSWER" in
    0) exit 0 ;;
    1) ops_submenu setup 'Setup and diagnostics' ;;
    2) ops_submenu quality 'Development and quality' ;;
    3) if [[ "$OPS_KIND" == backend ]]; then ops_submenu database 'Database and backups'; else ops_submenu maintenance 'Maintenance'; fi ;;
    4) if [[ "$OPS_KIND" == backend ]]; then ops_submenu access 'Permissions and administrators'; else printf 'Choose a listed number.\n'; fi ;;
    5) if [[ "$OPS_KIND" == backend ]]; then ops_submenu maintenance 'Workers and maintenance'; else printf 'Choose a listed number.\n'; fi ;;
    *) printf 'Choose a listed number.\n' ;;
  esac
done
