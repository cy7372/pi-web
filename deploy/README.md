# pi-web 公网部署(Caddy + Basic Auth)

```
互联网 ──HTTPS──▶ Caddy(:443) ──Basic Auth──▶ pi-web(127.0.0.1:30141)
                   自动证书                      仅本机可达
```

pi-web 的设计前提是 **localhost 单用户**:30+ API 全部裸奔,`/api/agent/*` 可远程执行 bash,`/api/files/*` 可读文件,`/api/auth/api-key/*` 可读写你的 LLM key。直接暴露公网 = 公开 RCE。

本方案用 Caddy 做前端,在 TLS + 认证两层把关,pi-web 代码**零改动**(全部是新增文件,同步上游 agegr/pi-web 零冲突)。

---

## 前置条件

- 一台公网 Linux 服务器,已把域名 A 记录指向它
- 已 [安装 Caddy](https://caddyserver.com/docs/install)(Debian/Ubuntu 一行 apt)
- 服务器上已 `git clone` 本仓库并 `npm install && npm run build`
- 80/443 端口对外开放,30141 **不要**对公网开放(见下方检查清单)

## 三步部署

```bash
# 1. 为每个用户生成密码 hash(caddy 自带 bcrypt)
caddy hash-password
# 输出形如 $2a$14$abcdef...  → 填进 deploy/Caddyfile 的 basicauth 块

# 2. 改 Caddyfile 里的域名(两处 pi.yourdomain.com)和用户 hash

# 3. 启动两个服务
./deploy/start.sh &                        # pi-web,绑 127.0.0.1:30141
caddy run --config deploy/Caddyfile &      # Caddy,占 80/443
```

访问 `https://pi.yourdomain.com`,浏览器弹原生 Basic Auth 框,输入用户名密码即可。

## 开机自启(systemd)

```ini
# /etc/systemd/system/pi-web.service
[Unit]
Description=pi-web (loopback only)
After=network.target

[Service]
WorkingDirectory=/opt/pi-web
ExecStart=/opt/pi-web/deploy/start.sh
Restart=on-failure
User=piweb                       # 用非 root 专用账户跑,别用你的开发账号

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl daemon-reload && sudo systemctl enable --now pi-web
```

> Caddy 官方提供 systemd unit,装 apt 包时自动配好。

## 加 / 删用户

```bash
# 加一个用户:生成 hash 后追加到 basicauth 块
caddy hash-password
# 然后 caddy reload --config deploy/Caddyfile  热加载,不断连
```

## SSE 流式输出说明

pi-web 的实时消息(`/api/agent/*/events`)走 SSE。Caddyfile 里两个关键配置:

- `flush_interval -1` — 收到字节立即转发,不缓冲(否则输出卡住)
- `transport read/write_timeout 24h` — SSE 长连接不被超时砍断

浏览器原生 Basic Auth 通过后,同源 EventSource 请求会自动携带凭证,无需前端改动。

---

## ⚠️ 「几个信任的人」共用一个实例的串扰警告

pi-web 是**单用户设计**。多人共用同一实例时,即使不恶意,也会互相干扰:

| 问题 | 后果 |
| ------ | ------ |
| session 历史全局共享 | 所有人能看到彼此的全部对话(在 `~/.pi/agent/sessions/`) |
| 同一 agent 运行池 | `globalThis.__piSessions` 是进程级单例,并发请求可能互相打断 |
| 共享 `~/.pi` 配置 | 共用同一份 API key、models.json、settings.json |
| 文件 allow-list 共享 | A 把某目录加进 cwd 白名单后,B 立刻也能读 |
| 共享 cwd / bash | A 的 agent 执行 bash 会影响整台机器,B 正在跑的项目可能被改 |

**如果用户之间只是"信任不攻击"但不想互相看到内容**,推荐每人独立实例:

```caddyfile
alice.pi.yourdomain.com {
    basicauth { alice $2a$14$... }
    reverse_proxy 127.0.0.1:30141 { flush_interval -1 }
}
bob.pi.yourdomain.com {
    basicauth { bob $2a$14$... }
    reverse_proxy 127.0.0.1:30142 { flush_interval -1 }
}
```

每个实例用**不同的系统用户 + 不同 HOME** 启动,这样各自的 `~/.pi`、session 历史、文件权限完全隔离:

```bash
# alice 实例
sudo -u piweb-alice HOME=/home/piweb-alice ./deploy/start.sh   # 端口 30141
# bob 实例(复制一份 start.sh 改端口)
sudo -u piweb-bob   HOME=/home/piweb-bob   ./deploy/start-bob.sh  # 30142
```

---

## 公网上线前检查清单

- [ ] `next start` 命令含 `-H 127.0.0.1`(否则裸奔)
- [ ] 防火墙只放行 22/80/443,**30141 不对外**

  ```bash
  sudo ufw allow 22,80,443/tcp && sudo ufw enable
  # 验证: 从外部 nmap 你的 IP,不应看到 30141
  ```

- [ ] basicauth 用户 hash 已替换占位符,默认占位符绝不能上生产
- [ ] 跑 pi-web 的是非 root 专用账户(`User=piweb`)
- [ ] `~/.pi/agent/` 里的 API key 文件权限 `600`,属主是跑服务的账户
- [ ] 定期看 Caddy 日志 `/var/log/caddy/pi-web.log` 有无异常 401 暴增(爆破尝试)

## 升级上游时的影响

本目录是纯新增,不改动 agegr/pi-web 任何既有文件。
`git merge upstream/main` 时 `deploy/` 不会产生任何冲突。
唯一需要回归的是:上游若改了启动方式或默认端口,更新 `start.sh` 即可。

## 可选增强

- **OAuth 登录**(比 Basic Auth 体验好):用 `caddy-security` 插件或前置 `oauth2-proxy` 对接 GitHub/Google
- **IP 白名单**:在 basicauth 前加 `@blocked not remote_ip 1.2.3.0/24` + `respond @blocked 403`
- **限流防爆破**:`rate_limit` 插件限制 401 频率
