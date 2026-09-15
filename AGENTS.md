# Pi Web — pi.cyyu.me 前端（静态 SPA）

pi coding agent 的 web 前端。**纯静态导出**（`output: 'export'`），nginx 直伺服
`web-dist/`，零 Node 进程。API 后端在独立仓库 **pi-server**
（`D:\Programs\pi-server`，Servy 服务 `PiServer`，loopback :30141）——
2026-09-15 拆仓（ADR 0005，历史经 filter-repo 保留在 pi-server）。

## Repo layout

- **packages/shared/src/** — 前端源码唯一事实源：components/、hooks/、lib/
  （浏览器侧 helper：agent-client、markdown、types…）、public/（fonts/icons/
  theme-init.js/sw.js/offline）、styles/、app-src/（真实 layout/page/login/
  manifest）
- **apps/web/** — 静态导出应用薄壳（next.config `output:'export'`，薄入口
  re-export shared）
- Junction（fresh clone 后重建）：`apps/web/node_modules` → 仓库根
  `node_modules`；`apps/web/public` → `packages/shared/src/public`
- `deploy/deploy-web.cmd` — 导出构建 + staged 拷贝（排除 *.test.mjs）+
  web-dist 原子换目录

上游跟踪：本仓保留 agegr/pi-web 的 origin remote 与完整共同历史，是**上游
集成点**——上游更新 merge 进来，服务端相关 delta（app/api、rpc-manager）
人工移植进 pi-server（ADR 0005"Upstream tracking"节）。

## 常用命令

```bash
bun run dev:web    # 开发服务器（.next-dev/，API 调 /api/* 需后端在跑）
bun run build:web  # 静态导出 → apps/web/out/
bun run test       # shared 源码的 node:test 套件
```

bun-only（preinstall 拦 npm/pnpm/yarn）；registry 钉 npmmirror（bunfig.toml）。

## 生产部署（前端）

```
D:\Programs\pi-web\deploy\deploy-web.cmd
```

= build:web → staged 拷贝 → web-dist 换目录。**零重启、零 SSE 中断**，nginx
按请求读新目录。回滚：`rmdir /s /q web-dist && ren web-dist.old web-dist`。

后端部署在 pi-server 仓（`deploy\deploy.cmd` → Servy PiServer）。

## nginx 侧（只读参考，配置在 C:\Users\CyYu\Run\nginx）

- `/` → web-dist 直伺服（CSP 放宽同旧代理块；per-path 缓存：_next/static
  immutable、fonts/icons 7d、sw.js+manifest must-revalidate）
- `/api/` → 127.0.0.1:30141（PiServer）
- 安全三层不动：mTLS（server 级 423 门）→ basic auth → TOTP
  （auth_request /__auth_pi → gateway :21090，pi realm 48h session cookie）

## Font / theme-init（构建零网络红线）

- 字体自托管：`packages/shared/src/public/fonts/` + styles/app.css 里的
  @font-face（含 unicode-range）——**不要引回 next/font/google**（2026-09-15
  Google Fonts 不可达曾炸导出构建）
- theme-init.js 由 `packages/shared/scripts/gen-theme-init.mjs` 从
  lib/theme.ts 生成，layout 以渲染阻塞 `<script src>` 引入；镜像一致性由
  theme.test.mjs parity 测试锁死（改 theme.ts 后要重新生成）

## Tailwind v4 扫描基准

shared 源码不在 apps/web 下，内容扫描靠 styles/app.css 顶部的 `@source`
指令——**勿删**（删了 shared 组件的样式全消失）。

## Session 文件格式（文件查看器用，速查）

`~/.pi/agent/sessions/<encoded-cwd>/<timestamp>_<uuid>.jsonl`；
toolCall 块 `{type:"toolCall",id,name,arguments}` ↔ UI 类型
`{toolCallId,toolName,input}` 的归一化在 lib/normalize.ts。

## 跨项目记忆规则

cyyu.me 栈运维事实（nginx/Servy/PiServer/网关）写全局 yinor
（group=default），不写本仓分区——别的目录的会话看不到项目分区。
