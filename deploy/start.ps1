# Windows 版：以仅监听本机的方式启动 pi-web 生产服务。
# 安全关键：package.json 的 start 脚本已硬编码 -H 127.0.0.1，绝不能去掉或改成 0.0.0.0。
#   `next start` 默认绑定 0.0.0.0，会让 30141 端口直接暴露到公网，
#   绕过 nginx 的认证 = 公开 RCE + 公开你的所有文件和 API key。
#
# 配合 nginx 反代上公网：所有外部访问必须先过 nginx 的 auth_basic + allow/deny。
$env:PI_WEB_BASE_PATH = "/pi"
# 必须设 NO_PROXY：instrumentation.ts 的 configureHttpDispatcher() 会给全局 fetch
#   装 undici.EnvHttpProxyAgent 读 HTTP(S)_PROXY。若环境有代理变量而没设 NO_PROXY，
#   所有本地 /api/* 会被塞进代理 → 30s 超时挂死（API 全挂，首页正常）。
$env:NO_PROXY = "localhost,127.0.0.1"
Set-Location "D:\Programs\pi-web"
bun run start
