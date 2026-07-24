#!/usr/bin/env bash
# 以"仅监听本机"的方式启动 pi-web 生产服务。
# 配合 Caddy 反代上公网:所有外部访问必须先过 Caddy 的认证。
#
# 安全关键: 下面的 -H 127.0.0.1 绝不能去掉或改成 0.0.0.0。
#   `next start` 默认绑定 0.0.0.0,会让 30141 端口直接暴露到公网,
#   绕过 Caddy 的认证 = 公开 RCE + 公开你的所有文件和 API key。
set -euo pipefail

# repo 根目录(本脚本位于 deploy/)
cd "$(dirname "$0")/.."

# 首次部署或每次 git pull 更新代码后,先构建一次:
#   npm run build
# 注意: 不要在公网服务器上跑 `npm run dev`,那是开发模式。

# 绑定 loopback + 固定端口,交给 Caddy 处理 TLS 和认证
exec npx next start -H 127.0.0.1 -p 30141
