#!/usr/bin/env bash
# 启动单个 pi-web 实例(仅监听本机)。由 systemd pi-web@<实例>.service 调用。
#
# 多实例隔离的根本: 每个实例由【专用系统用户 + 专用 HOME】启动 ——
#   这样各自的 ~/.pi (session 历史、API key、models.json、文件 allow-list) 完全隔离,
#   系统文件权限保证彼此看不见对方的文件。
#
# 用法:
#   start-instance.sh <实例名> <端口>
#     实例名: 仅用于日志标识,对应系统用户 piweb-<实例名>
#     端口:   该实例监听的 loopback 端口(如 30141)
#
# 安全关键: 下面的 -H 127.0.0.1 绝不能去掉或改 0.0.0.0。
#   所有外部访问必须经 Caddy 的 Basic Auth 认证;裸奔 = 公开 RCE。
set -euo pipefail

INSTANCE="${1:?用法: $0 <实例名> <端口>}"
PORT="${2:?端口必填,如 30141}"

# repo 根目录(本脚本在 deploy/)
cd "$(dirname "$0")/.."

echo "[pi-web] 实例=$INSTANCE  端口=$PORT  用户=$(whoami)  HOME=${HOME:-未设置}"
if [ -z "${HOME:-}" ] || [ "$(whoami)" = "root" ]; then
	echo "[pi-web] ⚠️  警告: HOME 未设 或 以 root 运行 —— 实例间不会隔离!" >&2
	echo "[pi-web]    正确做法: systemd unit 里设 User=piweb-$INSTANCE + Environment=HOME=/home/piweb-$INSTANCE" >&2
fi

# 首次部署需先构建一次: npm run build
# 所有实例共用同一份构建产物(.next/),无需各自 build。

exec npx next start -H 127.0.0.1 -p "$PORT"
