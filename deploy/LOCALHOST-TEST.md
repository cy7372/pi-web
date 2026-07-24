# 本地验证 `/pi` 子路径(dev 模式)

> **状态:环境已就绪,服务端 + 静态层面全部验证通过。** 只剩浏览器实测客户端 patch。

## 已证明(无需浏览器)

| 验证项 | 结果 |
|---|---|
| `/pi` 服务应用 | 200,29KB HTML,`<title>Pi Web</title>` |
| 静态资源前缀 | 全部 `/pi/_next/...`(Next basePath 自动) |
| API 路由 | `/pi/api/sessions`→200 JSON,`/pi/api/home`→200 JSON |
| 根路径拒绝 | `/`→404,`/api/sessions`(无前缀)→404 ✓ |
| BasePathPatch 注入 | 客户端组件在页面 HTML 中(count=1) |
| 尾斜杠 | `/pi/`→308→`/pi`(归一化,浏览器自动跟) |
| TypeScript | `tsc --noEmit` 通过 |
| patch 单元测试 | 10/10 |
| 客户端代码审计 | ~50 处 fetch/EventSource **全部** `/api/` 前缀字符串 → patch 全覆盖 |

## 你要做的:浏览器实测客户端 patch

服务器我起不来保活(sandbox 跨调用会回收)。worktree 已搭好,你**在自己的终端**跑一条命令即可:

```bash
cd /d/Programs/pi-web-pitest
MSYS_NO_PATHCONV=1 NO_PROXY=localhost,127.0.0.1 PI_WEB_BASE_PATH=/pi bun run dev -- --port 30150
```

> - `-- --port 30150`:`dev` 脚本硬编码了 `-p 30141`(被 agent 实例占用),必须这样覆盖端口
> - `NO_PROXY=localhost,127.0.0.1`:`instrumentation.ts` 的 undici 代理会破坏本地 API 调用,**必须设**
> - `MSYS_NO_PATHCONV=1`:防 Git Bash 把 `/pi` 转成 Windows 路径
> - 这个 worktree 有**真实 node_modules**(已 `bun install`),独立 `.next`,和 agent 实例零冲突

浏览器打开 **`http://localhost:30150/pi`**(无尾斜杠)。

### 成功标准(Network 面板,不是 Console)

F12 → Network → 刷新 → 看 API 请求路径:
- ✅ 期望:`/pi/api/sessions`、`/pi/api/home`、`/pi/api/agent/running/events` 等(**每个带 `/pi`**,200)
- ❌ 失败征兆:出现 `/api/...`(不带 `/pi`)→ 404,说明 patch 漏了某处

**最直接验证**:在聊天框发一条消息,看是否出现 `/pi/api/agent/new`(POST)→ `/pi/api/agent/<id>/events`(SSE 挂起)→ 收到回复。能收到回复 = fetch + EventSource patch 同时验证通过。

## 测完清理

```bash
# 关 dev server(Ctrl+C),然后移除 worktree
cd /d/Programs/pi-web
git worktree remove D:/Programs/pi-web-pitest --force
```

## 已知踩坑(已规避)

1. **`dev` 脚本硬编码 `-p 30141`**:直接 `bun run dev` 会和 agent 实例抢端口失败。必须 `-- --port <其他>`。
2. **Turbopack 拒绝 `node_modules` 是指向项目根外的 symlink/junction**:不能用 junction 复用主仓库 node_modules,必须 worktree 内真 `bun install`。
3. **`next build`(生产)从符号链接路径 `C:\Users\CyYu\D-Programs` 跑会 EPERM**:从真实路径 `D:\Programs` 跑可解。dev 模式(Turbopack)不受影响。
