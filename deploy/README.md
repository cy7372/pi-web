# pi-web 公网部署(Windows + Caddy + Servy,单实例多用户)

```
alice.<域> ┐
bob.<域>   ─┼─HTTPS─▶ Caddy(:80/443) basicauth ─▶ 127.0.0.1:30141 (Servy pi-web-shared)
carol.<域> ┘   自动 TLS   多用户名各输各的密码          .pi = C:/pi-web-data/.pi (共享)
```

pi-web 设计前提是 **localhost 单用户**:30+ API 全裸奔,`/api/agent/*` 可远程执行 bash,`/api/files/*` 可读文件,`/api/auth/api-key/*` 可读写 LLM key。直接暴露 = 公开 RCE。

本方案在**这台 Windows 本机**上用 Caddy(TLS+Basic Auth)+ Servy 服务,**代码零改动**(`deploy/` 纯新增,同步上游零冲突)。

## 单实例的取舍

几个人共享同一个 `~/.pi`:

- ✓ 升级 node / 代码只 restart 1 次
- ✓ LLM key 配一次大家都能用
- ✓ 日志只有一份
- ✗ session 历史互相可见;共用文件白名单;同一运行池高并发可能互相打断

适用:**真信任、不在乎互相看 session/密钥**。要每人独立 `~/.pi` 见底部「多实例隔离」。

---

## 前置(一次性)

1. **下载 Caddy** → `C:\caddy\caddy.exe`(<https://caddyserver.com/download>,Windows amd64)
2. **构建 pi-web**(项目用 bun):`bun install && bun run build`
3. **确认路径**:`C:\nvm4w\nodejs\node.exe`(运行)+ `C:\nvm4w\nodejs\bun.exe`(构建),都在 nvm4w 符号链接下,node 升级不失效
4. PowerShell 用**管理员**开(Servy + 防火墙要管理员)

## ⚠️ 代理配置(关键,先读这节)

`instrumentation.ts` 会给全局 fetch 装 undici 的 `EnvHttpProxyAgent`,读 `HTTP(S)_PROXY` 环境变量。

- **必须设 `NO_PROXY=localhost,127.0.0.1`**:否则所有本地 `/api/*` 请求也被塞进代理 → 30s 超时挂死(现象:首页秒回 200,API 全挂)。`install-instance.ps1` **已自动设好**。
- **LLM 出站代理**按你的服务器位置决定:

| 场景 | -HttpProxy 参数 | 效果 |
| --- | --- | --- |
| 国内服务器,LLM 需代理访问 | `-HttpProxy http://127.0.0.1:19718` | LLM 走代理,本地 API 绕过 |
| 海外服务器,直连 LLM | 不传 | 无代理变量,直连 |

> 本机当前环境有 `HTTP_PROXY=http://127.0.0.1:19718`(User 级)。但 servy 服务以 LocalSystem 跑,**不继承 User 级变量**,所以国内场景必须显式 `-HttpProxy` 传进去,否则 LLM 无法出站。

## 部署(3 步)

```powershell
cd C:\Users\CyYu\D-Programs\pi-web\deploy

# 1. 注册 pi-web 服务(国内服务器加 -HttpProxy,海外不加)
.\install-instance.ps1 -Instance shared -Port 30141 -PiHome C:\pi-web-data -HttpProxy http://127.0.0.1:19718
servy-cli start --name=pi-web-shared
servy-cli query --name=pi-web-shared   # 验证 env: NO_PROXY 在,HOME/USERPROFILE 正确

# 2. 注册 Caddy + 放行防火墙
.\install-caddy.ps1
New-NetFirewallRule -DisplayName "Caddy-HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Caddy-HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
servy-cli start --name=pi-caddy

# 3. 配 Basic Auth 用户
caddy hash-password            # 交互输密码 → $2a$14$...
# 编辑 deploy/Caddyfile: 改域名 + 替换 REPLACE_WITH... hash
servy-cli restart --name=pi-caddy
```

访问 `https://<你的域名>`,浏览器弹 Basic Auth。第一次进 pi-web 后,在 `C:\pi-web-data\.pi\agent\` 配一份 LLM API key(models.json + auth),全员共享。

## 加 / 删用户(日常)

```powershell
caddy hash-password                                  # 生成 hash
# Caddyfile 的 basicauth 块加一行: <名> $2a$14$...
servy-cli restart --name=pi-caddy                    # 热生效,不断连
```

## SSE 流式

`/api/agent/*/events` 走 SSE。Caddyfile 两关键:`flush_interval -1`(不缓冲)+ `transport read/write_timeout 24h`(长连接不超时)。Basic Auth 通过后同源 EventSource 自动带凭证。

---

## 升级 node(运维重点)

servy 服务写死 `C:\nvm4w\nodejs\node.exe` 这个**符号链接**,`nvm use` 只改指向,路径永在 → **服务无需重新注册**。但运行中的进程不会自动换 node,需 restart。

```powershell
servy-cli query --name=pi-web-shared      # 1. 记基线
nvm install 24                             # 2. 装新版本
nvm use 24                                 # 3. 切过去(符号链接已变)

cd C:\Users\CyYu\D-Programs\pi-web
bun install                                # 4. 依赖若变了
bun run build                              # 5. 关键!新 node 重新构建。报错就 nvm use 22.20.0 回退

servy-cli restart --name=pi-web-shared     # 6. 重启(只此一次)
servy-cli query --name=pi-web-shared       # 7. 确认 Running + 日志无报错
```

> bun.exe 也在 `C:\nvm4w\nodejs\` 下,跟随符号链接。但 `nvm use` 切到的 node 目录里若没 bun.exe,bun 会失效——切版本后先 `bun --version` 确认。建议把 `22.20.0` 当锚定版本永久保留,出问题 `nvm use 22.20.0` 一键回退。

## 升级 pi-web 代码

```powershell
cd C:\Users\CyYu\D-Programs\pi-web
git pull                                   # 或 git merge upstream/main
bun install                                # 依赖若变了
bun run build
servy-cli restart --name=pi-web-shared     # 只 restart 1 次
```

---

## 公网上线前检查清单

- [ ] `servy-cli query --name=pi-web-shared` 确认 env: `NO_PROXY=localhost,127.0.0.1` 在、`USERPROFILE=C:\pi-web-data` 反斜杠完整
- [ ] **API 不超时**:浏览器打开 `https://<域>/api/sessions` 应秒回(若 30s 挂死 = NO_PROXY 没生效)
- [ ] `bun run build` 已跑(否则 next start 报错)
- [ ] node.exe 是 `C:\nvm4w\nodejs\node.exe`(**非**带版本号的 nvm 路径)
- [ ] 防火墙只放行 80/443,30141 **不对公网**(它只绑 127.0.0.1,本就不可达)
- [ ] basicauth hash 已替换占位符
- [ ] `C:\pi-web-data\.pi\agent\` 下 API key 文件权限收紧
- [ ] 域名 A 记录指向本机公网 IP(Caddy 才能自动签 TLS)
- [ ] 国内服务器:`-HttpProxy` 已传,LLM 能出站(curl 测 models 接口)

## 临时调试(不走服务)

git bash 里 `./deploy/start.sh`(已内置 `NO_PROXY`),用当前账户的 `~/.pi`。仅供调试。

---

## 多实例隔离(如果以后要每人独立 ~/.pi)

当前单实例够用就忽略。要隐私隔离:每人各跑一次 `install-instance.ps1`(不同 Instance/端口/PiHome),Caddyfile 每人一个 site block。代价是升级时 restart N 次。`deploy/linux/pi-web@.service` 是 Linux 下的等价方案(systemd 模板)。
