#!/usr/bin/env bash
# 以"仅监听本机"的方式启动 pi-web 生产服务(临时调试用，不走 servy)。
# 配合 Caddy 反代上公网:所有外部访问必须先过 Caddy 的认证。
#
# 安全关键: 下面的 -H 127.0.0.1 绝不能去掉或改成 0.0.0.0。
#   `next start` 默认绑定 0.0.0.0,会让 30141 端口直接暴露到公网,
#   绕过 Caddy 的认证 = 公开 RCE + 公开你的所有文件和 API key。
set -euo pipefail

# repo 根目录(本脚本位于 deploy/)
cd "$(dirname "$0")/.."

# ⚠️ 必须设 NO_PROXY: instrumentation.ts→configureHttpDispatcher() 会给全局 fetch
#    装 undici.EnvHttpProxyAgent 读 HTTP(S)_PROXY。若环境有代理变量而没设 NO_PROXY，
#    所有本地 /api/* 会被塞进代理 → 30s 超时挂死(API 全挂，首页正常)。
export NO_PROXY="localhost,127.0.0.1"

# 首次部署或每次 git pull 更新代码后,先构建一次(项目用 bun):
#   bun install && bun run build
# 注意: 不要跑 dev 模式上公网。

# 绑定 loopback + 固定端口,交给 Caddy 处理 TLS 和认证
exec npx next start -H 127.0.0.1 -p 30141
