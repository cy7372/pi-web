# pi-web 公网部署(Windows + Caddy + Servy,多实例隔离)

```
                  ┌─ alice.<域> ─▶ basicauth(alice) ─▶ 127.0.0.1:30141  (Servy pi-web-alice)
互联网 ─▶ Caddy(:80/443) ─┤        自动 TLS              .pi = C:/pi-instances/alice/.pi
         Servy: pi-caddy   └─ bob.<域>   ─▶ basicauth(bob)   ─▶ 127.0.0.1:30142  (Servy pi-web-bob)
                                                              .pi = C:/pi-instances/bob/.pi
```

pi-web 设计前提是 **localhost 单用户**:30+ API 全裸奔,`/api/agent/*` 可远程执行 bash,`/api/files/*` 可读文件,`/api/auth/api-key/*` 可读写 LLM key。直接暴露 = 公开 RCE。

本方案在**这台 Windows 本机**上用 Caddy(TLS+Basic Auth)+ Servy 多实例,**代码零改动**(`deploy/` 纯新增,同步上游零冲突)。

## 隔离原理

pi 用 `os.homedir()` 定位 `~/.pi`(见 `pi-coding-agent/dist/config.js`)。Windows 上 `os.homedir()` 取 `USERPROFILE`。
→ **每个 Servy 服务设独立 `HOME`+`USERPROFILE`,各实例的 `~/.pi`(session/密钥/配置/文件白名单)就完全隔离**,无需建多个 Windows 账户。

---

## 前置(一次性)

1. **下载 Caddy** → `C:\caddy\caddy.exe`（<https://caddyserver.com/download>，Windows amd64）
2. **构建 pi-web**:`npm install && npm run build`（所有实例共用同一份 `.next/`）
3. **确认 node 稳定路径**:`C:\nvm4w\nodejs\node.exe`（nvm4w 符号链接，node 升级不会失效）
4. PowerShell 用**管理员**开（Servy 注册服务 + 防火墙要管理员）

## 部署你自己(复用现有 ~/.pi)

你现有的全部 session/密钥在 `C:\Users\CyYu\.pi`。把你自己作为第一个实例，直接指向它:

```powershell
cd C:\Users\CyYu\D-Programs\pi-web\deploy
.\install-instance.ps1 -Instance me -Port 30141 -PiHome C:\Users\CyYu
servy-cli start --name=pi-web-me
servy-cli query --name=pi-web-me      # 验证 env: HOME/USERPROFILE 应是 C:\Users\CyYu，反斜杠没被吞
```

## 部署其他人(独立 ~/.pi)

```powershell
.\install-instance.ps1 -Instance alice -Port 30142
servy-cli start --name=pi-web-alice
# alice 首次需在她的 ~/.pi (C:\pi-instances\alice\.pi) 配 LLM API key
#   最快: 把你现有的 models.json / auth 复制过去(只复制配置,别复制 session 历史)
#   Copy-Item C:\Users\CyYu\.pi\agent\models.json C:\pi-instances\alice\.pi\agent\
```

## 注册 Caddy 前置

```powershell
.\install-caddy.ps1
# 放行防火墙(管理员):
New-NetFirewallRule -DisplayName "Caddy-HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow
New-NetFirewallRule -DisplayName "Caddy-HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow
servy-cli start --name=pi-caddy
```

## 配 Basic Auth

```powershell
caddy hash-password            # 交互输密码 → 输出 $2a$14$...
# 编辑 deploy/Caddyfile: 改域名 + 把 REPLACE_WITH... 换成 hash
servy-cli restart --name=pi-caddy
```

## 加 / 删用户

```powershell
# 加: 注册服务 + Caddyfile 复制一个 block(改域名/用户/hash/端口 4 处)
.\install-instance.ps1 -Instance carol -Port 30143
servy-cli start --name=pi-web-carol
# (改 Caddyfile) → servy-cli restart --name=pi-caddy

# 删:
.\uninstall-instance.ps1 -Instance carol           # 留数据
.\uninstall-instance.ps1 -Instance carol -RemoveData  # 连 ~/.pi 一起删
```

---

## ⚠️ 隔离边界(信任但隔离隐私)

本方案隔离了 `~/.pi`(session 历史、API key、配置、文件白名单缓存)。但所有实例默认以 **LocalSystem** 同账户运行，文件系统权限相同——即 alice 的 agent 若被指示 `cwd` 到 bob 的项目目录，物理上能操作。

- 「信任不攻击 + 不想互看 session/密钥」→ **本方案足够**
- 要连文件系统都强隔离 → 每个实例用独立 Windows 账户跑(servy `--runAs`，需另配 ACL)

## SSE 流式

`/api/agent/*/events` 走 SSE。Caddyfile 两关键:`flush_interval -1`(不缓冲)+ `transport read/write_timeout 24h`(长连接不超时)。Basic Auth 通过后同源 EventSource 自动带凭证。

## 临时调试(不走服务)

`deploy/start.sh`(git bash 里跑 `next start -H 127.0.0.1 -p 30141`),不注册服务、用当前账户的 `~/.pi`。仅供调试。

---

## 公网上线前检查清单

- [ ] 每个 servy 服务 `servy-cli query` 确认 `USERPROFILE` 正确(反斜杠完整，非 root/非空)
- [ ] `npm run build` 已跑(否则 next start 报错)
- [ ] node.exe 用 `C:\nvm4w\nodejs\node.exe`(**不是**带版本号的 nvm 路径)
- [ ] 防火墙只放行 80/443，30141/30142... **不对公网**(它们只绑 127.0.0.1，本就不可达，防火墙是双保险)
- [ ] basicauth hash 已替换占位符
- [ ] 每个实例 `~/.pi\agent\` 下 API key 文件仅 SYSTEM/对应账户可读
- [ ] 域名 A 记录已指向本机公网 IP(Caddy 才能自动签 TLS)

## 升级上游 agegr/pi-web

`deploy/` 纯新增 → `git merge upstream/main` **零冲突**。SDK 升级(`npm update @earendil-works/pi-coding-agent`)与部署无关。node 升级无需改服务配置(用的是 nvm4w 稳定路径)。代码更新后重 `npm run build`，再逐个 `servy-cli restart --name=pi-web-*`。

## 换 Linux 服务器?

Windows 脚本失效，改用 `deploy/linux/` 下的 `pi-web@.service`(systemd 模板)+ `start-instance.sh`，原理相同(不同 User+HOME)。
