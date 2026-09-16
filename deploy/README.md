# pi-web 部署:nginx 子路径 + TOTP 双因素认证

> **废弃文件**:`Caddyfile`、`install-caddy.ps1`、`start.sh`、`linux/` 是早期 Caddy 方案的残留,保留供参考,**非当前方案,不要用**。

## 架构

```
                    公网 HTTPS :8443
                           │
                    ┌──────▼──────────┐
                    │  nginx :8443     │
                    │  pub.cyyu.me     │
                    │                  │
                    │  /pi/ ───────────┼──▶ auth_request /_auth_pi
                    │    │             │         │
                    │    │             │    ┌────▼────────────┐
                    │    │             │    │ auth_server.py   │
                    │    │             │    │ :21081            │
                    │    │             │    │ realm=pi          │
                    │    │             │    │ cookie __Host-pi  │
                    │    │             │    └──────────────────┘
                    │    ▼             │
                    │  proxy_pass ─────┼──▶ pi-web Next.js :30141
                    │  (保留 /pi 前缀)  │    basePath=/pi
                    └─────────────────┘
```

- **认证层次**:TOTP(nginx `auth_request` → auth_server) → 后端 Basic Auth(nginx 注入 `pi-basic.key`)
- **SSO**:`__Host-totp_sso` cookie(14 天,跨 realm 共享) → `/pi/_sso` 内部桥 → 自动签发 `__Host-pi_token`
- **basePath**:pi-web 通过 `PI_WEB_BASE_PATH=/pi` 配合 monkey-patch 在 `/pi` 子路径下运行;nginx `proxy_pass` **不带尾斜杠**,保留 `/pi/` 前缀

## 改动文件清单

### pi-web 项目(`D:\Programs\pi-web`)

| 文件 | 作用 | 类型 |
| --- | --- | --- |
| `next.config.ts` | 读 `PI_WEB_BASE_PATH` env 设 `basePath` + 注入 `NEXT_PUBLIC_BASE_PATH` | 修改 |
| `lib/base-path.ts` | 运行时 patch:拦截 fetch/EventSource,字符串 `/api/` → `/pi/api/` | 新增 |
| `lib/base-path.test.ts` | patch 单元测试(10/10) | 新增 |
| `components/BasePathPatch.tsx` | 客户端 `'use client'` 组件:挂载时调用 `patchBasePath()` | 新增 |
| `app/layout.tsx` | `<head>` 注入 `__basePath` JS var + `<BasePathPatch />` | 修改 |
| `deploy/LOCALHOST-TEST.md` | 本地 dev 模式验证脚本 | 新增 |
| `deploy/README.md` | 本文档 | 重写 |

> 未设 `PI_WEB_BASE_PATH` 时所有 patch 静默跳过,行为与上游完全相同(已 tsc + 单元测试验证)。

### nginx 侧(`C:\Users\CyYu\Run\nginx`)

| 文件 | 作用 | 类型 |
| --- | --- | --- |
| `conf/conf.d/pub.cyyu.me.conf` | + `/pi/` 全套 location 块(+`/_auth_pi`+`/pi/api/auth/`+`/pi/login.html`+`/pi/_sso`+`@pi_handle_unauth`) | 修改 |
| `html/pi/login.html` | pi TOTP 登录页(照搬 opencode 模板,改 5 处:标题→Dancher Agent web,POST `/pi/api/auth/login?realm=pi`,return→`/pi/`) | 新增 |
| `auth/auth_server.py` | REALMS 字典 +`"pi"` realm,共享 `conf/totp.secret` | 修改 |
| `conf/pi-basic.key` | 后端 Basic Auth 凭证:`proxy_set_header Authorization "Basic ..."`(nginx include) | 新增 |

### 不改的文件

- `~/.pi/agent/`(单实例共享,不改)
- pi-web 其余 58 个源文件(basePath 通过 4 个 patch 文件完成,不加散弹式修改)
- nginx 其他 site block(menu/opencode/drop 不受影响)

## 前置条件

- [x] pi-web 项目 `bun install` 已有
- [x] `tsc --noEmit` 通过
- [x] 客户端 patch 单元测试 10/10
- [x] nginx 已有 `connection_upgrade` 映射(`map $http_upgrade $connection_upgrade {...}`)
- [x] `blocked_ips.conf` + `api_limit` zone 已有
- [x] `auth_server.py` 运行在 `:21081`(Servy 服务 `pi-auth-server`)

## 激活步骤(按顺序)

> ⚠️ **第 2 步 auth_server 重启会踢掉所有在线用户**(令牌在内存中)。选低峰期,或先通知用户。

### 1. 确保 pi-web 在运行

```bash
# dev 模式(调试阶段)
cd D:\Programs\pi-web
MSYS_NO_PATHCONV=1 NO_PROXY=localhost,127.0.0.1 PI_WEB_BASE_PATH=/pi bun run dev

# 生产模式(上线后)
# bun run build  # 从真实路径 D:\Programs\pi-web(符号链接 C:\Users\CyYu\D-Programs\pi-web 有 EPERM)
# servy-cli start --name=pi-web-shared
```

### 2. 重启 auth_server(激活 pi realm)

```bash
servy-cli restart --name=pi-auth-server
servy-cli query --name=pi-auth-server   # 确认 Running
```

### 3. 重载 nginx(激活 /pi/ location)

```bash
cd C:\Users\CyYu\Run\nginx
.\nginx.exe -s reload
```

> nginx `reload` 是热重载,不中断现有连接。若 `reload` 报错,先 `.\nginx.exe -t` 查语法。

### 4. 验证

```bash
# 4a) nginx 登录页直接可达
curl -k https://pub.cyyu.me:8443/pi/login.html
# 应返回 login.html 内容

# 4b) 未认证访问被拒
curl -k -v https://pub.cyyu.me:8443/pi/api/sessions 2>&1 | grep "< HTTP"
# 应 401

# 4c) 完整流程(浏览器)
# 打开 https://pub.cyyu.me:8443/pi/login.html
# → 输 TOTP 码 → redirect 到 /pi/ → pi-web 正常加载
# → Network 面板确认 API 请求带 /pi/api/... 前缀
```

## 回退

```bash
# 1. 注销 /pi/ location:注释掉 pub.cyyu.me.conf 中 pi 相关块,nginx -s reload
# 2. 撤销 pi realm:auth_server.py 删 REALMS["pi"],restart auth_server
# 3. pi-web 切回根路径:unset PI_WEB_BASE_PATH,restart pi-web
```

> nginx 的 `/pi/` location 未激活时(`reload` 前),`/pi/*` 请求落在 `location /` 通配 → 可能 404,不影响其他 site。

## 运维

### pi-web 升级

```bash
cd D:\Programs\pi-web
git merge upstream/main
bun install             # 依赖若变
tsc --noEmit            # 类型检查
# bun run build         # 生产:从真实路径 D:\Programs 跑
servy-cli restart --name=pi-web-shared
```

### Node 升级

servy 服务写死 `C:\nvm4w\nodejs\node.exe`(符号链接),`nvm use` 改指向后 restart 即可,**无需重新注册服务**。

### 环境变量备忘

| 变量 | 值 | 为什么 |
| --- | --- | --- |
| `NO_PROXY` | `localhost,127.0.0.1` | 否则 undici 代理绑架本地 API 请求 |
| `PI_WEB_BASE_PATH` | `/pi` | 激活 basePath monkey-patch |
| `HTTP_PROXY` | `http://127.0.0.1:19718` | LLM 出站(国内需要) |

## 踩坑记录

| 问题 | 症状 | 根因 | 解 |
| --- | --- | --- | --- |
| Turbopack + junction | `EPERM: Symlink ... points out of the filesystem root` | dev 模式(Turbopack)拒绝指向项目外部的 node_modules symlink/junction | worktree 复制必须真 `bun install` |
| `next build` EPERM | `EPERM scandir 'Application Data'` | 符号链接 cwd `C:\Users\CyYu\D-Programs` → webpack glob 扫描祖先撞受限 junction | 从真实路径 `D:\Programs\pi-web` 跑 build |
| `dev` 脚本硬编码 `-p 30141` | `EADDRINUSE`,第二实例起不来 | package.json `"dev": "next dev -p 30141"` | `bun run dev -- --port 30150` |
| 忘设 `NO_PROXY` | 首页正常,所有 API 超时 30s | undici `EnvHttpProxyAgent` 把 `127.0.0.1` 也代理 | 必须设 |
| `proxy_pass` 尾斜杠 | `/pi/api/sessions` 到后端变 `/api/sessions` → 404 | nginx `proxy_pass http://x/`(带尾斜杠)会剥 location 前缀 | pi-web 需要保留前缀,用 `proxy_pass http://x`(**不带**尾斜杠) |
| auth_server 重启踢用户 | 所有 TOTP session 失效 | 令牌存内存,重启清零 | 与 nginx reload 捆绑,低峰期操作 |
