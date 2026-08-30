#!/bin/sh
# Install the Xiaotaozi CLI (`xtz`).
# Node range matches DeepSeek Harness: ^<floor> || >=24.0.0. npm / bun / pnpm only fetch the package.
set -eu

PACKAGE_NAME="xiaotaozi-dsh-cli"
BIN_NAME="xtz"
NEED_NODE="22.19.0"
NEED_NODE_RANGE="^${NEED_NODE} || >=24.0.0"

usage() {
  cat <<'EOF'
Install the Xiaotaozi CLI (xtz).

Usage:
  curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
  curl -fsSL .../install.sh | sh -s -- --bun
  sh install.sh [--npm | --bun | --pnpm] [--dry-run]

Requires Node.js ^22.19.0 or >=24. npm, bun, and pnpm are installers only;
xtz always runs on Node via its shebang, never on bun.
EOF
}

INSTALLER=""
DRY_RUN=0

while [ $# -gt 0 ]; do
  case "$1" in
    -h|--help)
      usage
      exit 0
      ;;
    --npm) INSTALLER=npm ;;
    --bun) INSTALLER=bun ;;
    --pnpm) INSTALLER=pnpm ;;
    --dry-run) DRY_RUN=1 ;;
    *)
      printf 'unknown option: %s\n' "$1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

run() {
  if [ "$DRY_RUN" -eq 1 ]; then
    printf '+'
    for arg in "$@"; do
      printf ' %s' "$arg"
    done
    printf '\n'
    return 0
  fi
  "$@"
}

die() {
  printf '%s\n' "$1" >&2
  exit 1
}

# Same range as DeepSeek Harness engines.node: ^<floor> || >=24.0.0
node_ok() {
  actual=$1
  floor=$2
  actual_major=${actual%%.*}
  rest=${actual#*.}
  actual_minor=${rest%%.*}
  actual_patch=${rest#*.}
  actual_patch=${actual_patch%%[!0-9]*}
  floor_major=${floor%%.*}
  floor_rest=${floor#*.}
  floor_minor=${floor_rest%%.*}
  floor_patch=${floor_rest#*.}
  case "$actual_major$actual_minor$actual_patch$floor_major$floor_minor$floor_patch" in
    ''|*[!0-9]*) return 1 ;;
  esac
  if [ "$actual_major" -eq "$floor_major" ]; then
    [ "$actual_minor" -gt "$floor_minor" ] && return 0
    [ "$actual_minor" -eq "$floor_minor" ] && [ "$actual_patch" -ge "$floor_patch" ] && return 0
    return 1
  fi
  [ "$actual_major" -ge 24 ]
}

check_node() {
  command -v node >/dev/null 2>&1 || die "xtz 需要 Node.js ${NEED_NODE_RANGE}。请先安装后再运行本脚本。"
  actual=$(node -p "process.versions.node")
  node_ok "$actual" "$NEED_NODE" || die "当前 Node 是 ${actual}，xtz 需要 ${NEED_NODE_RANGE}。"
}

pick_installer() {
  if [ -n "$INSTALLER" ]; then
    command -v "$INSTALLER" >/dev/null 2>&1 || die "未找到 ${INSTALLER}。"
    printf '%s\n' "$INSTALLER"
    return
  fi
  for candidate in npm bun pnpm; do
    if command -v "$candidate" >/dev/null 2>&1; then
      printf '%s\n' "$candidate"
      return
    fi
  done
  die "需要 npm、bun 或 pnpm 之一来安装 ${PACKAGE_NAME}。"
}

install_pkg() {
  installer=$1
  case "$installer" in
    npm) run npm install --global "$PACKAGE_NAME" ;;
    bun) run bun add --global "$PACKAGE_NAME" ;;
    pnpm) run pnpm add --global "$PACKAGE_NAME" ;;
    *) die "不支持的安装器：${installer}" ;;
  esac
}

check_node
installer=$(pick_installer)
printf '使用 %s 安装 %s（运行时仍是 Node %s）\n' "$installer" "$PACKAGE_NAME" "$NEED_NODE_RANGE"
install_pkg "$installer"

if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

command -v "$BIN_NAME" >/dev/null 2>&1 || die "已安装，但 PATH 里还没有 ${BIN_NAME}。把包管理器的全局 bin 目录加入 PATH 后再运行 ${BIN_NAME} --help。"
"$BIN_NAME" --version
printf '%s 安装完成。\n' "$BIN_NAME"
