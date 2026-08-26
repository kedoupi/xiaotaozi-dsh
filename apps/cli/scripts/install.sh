#!/bin/sh
# Install the Xiaotaozi CLI (`xtz`).
# Runtime is exactly Node.js 22.19.0. npm / bun / pnpm only fetch the package.
set -eu

PACKAGE_NAME="xiaotaozi-dsh-cli"
BIN_NAME="xtz"
NEED_NODE="22.19.0"

usage() {
  cat <<'EOF'
Install the Xiaotaozi CLI (xtz).

Usage:
  curl -fsSL https://raw.githubusercontent.com/kedoupi/xiaotaozi-dsh/main/apps/cli/scripts/install.sh | sh
  curl -fsSL .../install.sh | sh -s -- --bun
  sh install.sh [--npm | --bun | --pnpm] [--dry-run]

Requires Node.js 22.19.0 exactly. npm, bun, and pnpm are installers only;
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

check_node() {
  command -v node >/dev/null 2>&1 || die "xtz 需要精确的 Node.js ${NEED_NODE}。请先安装该版本后再运行本脚本。"
  actual=$(node -p "process.versions.node")
  [ "$actual" = "$NEED_NODE" ] || die "当前 Node 是 ${actual}，xtz 要求精确版本 ${NEED_NODE}。"
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
printf '使用 %s 安装 %s（运行时仍是 Node %s）\n' "$installer" "$PACKAGE_NAME" "$NEED_NODE"
install_pkg "$installer"

if [ "$DRY_RUN" -eq 1 ]; then
  exit 0
fi

command -v "$BIN_NAME" >/dev/null 2>&1 || die "已安装，但 PATH 里还没有 ${BIN_NAME}。把包管理器的全局 bin 目录加入 PATH 后再运行 ${BIN_NAME} --help。"
"$BIN_NAME" --version
printf '%s 安装完成。\n' "$BIN_NAME"
