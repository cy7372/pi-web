# 本地验证 `/pi/` 子路径(dev 模式)

> 目的:在 localhost 上验证 `basePath: /pi` + 客户端 fetch/EventSource patch 是否真的端到端工作。
> 这是部署到 `pub.cyyu.me:8443/pi` 之前的最后一道验证。

## 为什么需要这一步

`next.config.ts` 的 `basePath` 只给 `<Link>`/`<Image>` 等内置组件自动加前缀,
**不影响业务代码里的原生 `fetch("/api/...")` / `new EventSource("/api/...")`**。
我们用 `lib/base-path.ts` 统一 monkey-patch,业务代码零改动。

静态层面已验证(无需浏览器):

- `tsc --noEmit` 通过
- patch 单元测试 10/10
- 全代码审计:客户端所有 `fetch()` / `EventSource()` 共 ~50 处,
  **每一处的运行时字符串都以 `/api/` 开头** → patch 全覆盖;唯一的非 `/api/`
  fetch 在 `app/api/skills/search/route.ts`(服务端 Node fetch,本就不该 patch)

本步骤是把上面这些放到真实浏览器里再确认一次。

---

## 前置:这套改动只新增 4 个文件、改动 2 个文件

| 文件 | 类型 | 作用 |
| --- | --- | --- |
| `next.config.ts` | 改 | `basePath: process.env.PI_WEB_BASE_PATH \|\| undefined` + 暴露 `NEXT_PUBLIC_BASE_PATH` |
| `lib/base-path.ts` | 新增 | 客户端 fetch/EventSource monkey-patch |
| `components/BasePathPatch.tsx` | 新增 | 客户端触发器(确保 patch 早于业务 import 执行) |
| `app/layout.tsx` | 改 | import + render `<BasePathPatch />` |

**关键:不设 `PI_WEB_BASE_PATH` = 根路径,patch 不激活,行为完全不变。**
所以这套改动对当前跑在 `:30141` 的根路径实例零影响。

---

## 执行步骤

### 1. 暂停当前 dev server(就是承载 pi agent TUI 的那个)

basePath 是应用级开关:设了 `/pi` 之后,应用只在 `/pi/` 下可访问,
根路径 `/` 会 404。所以测试期间需要临时重启 dev server。

会话数据**不会丢**——全部持久化在 `~/.pi/agent/sessions/*.jsonl`,
重启后照常能打开。

### 2. 带 env 重启 dev(Git Bash)

```bash
cd /d/Programs/pi-web     # 用真实路径!符号链接路径 C:\Users\CyYu\D-Programs 触发 EPERM(仅 build,dev 无碍,但养成习惯)
MSYS_NO_PATHCONV=1 \
NO_PROXY=localhost,127.0.0.1 \
PI_WEB_BASE_PATH=/pi \
bun run dev
```

> - `MSYS_NO_PATHCONV=1`:防止 Git Bash 把 `/pi` 转成 Windows 路径
> - `NO_PROXY=localhost,127.0.0.1`:`instrumentation.ts` 的 undici 代理会破坏本地 API 调用,**必须设**
> - `PI_WEB_BASE_PATH=/pi`:激活 basePath + 客户端 patch

### 3. 浏览器访问 `http://localhost:30141/pi/`

注意结尾的 `/`,basePath 模式下根入口在 `/pi/`。

---

## 成功标准

打开浏览器 DevTools → Network 标签,刷新页面,确认:

| 检查项 | 期望 |
| --- | --- |
| 页面本身 | `http://localhost:30141/pi/` 返回 200,UI 正常渲染 |
| 静态资源 | `_next/static/*` 请求都带 `/pi` 前缀(Next 自动加) |
| API 调用 | 所有 XHR/Fetch 请求是 `/pi/api/sessions`、`/pi/api/agent/...` 等(**带 `/pi` 前缀**),且 200 |
| SSE 流 | `/pi/api/agent/<id>/events`、`/pi/api/agent/running/events` 连接成功(EventSource 被 patch) |
| 发消息 | 在聊天框发一条消息,能看到 `/pi/api/agent/new` → SSE 事件流 → 回复出现 |

**失败征兆**(说明 patch 漏了某处):Network 里出现 `/api/...`(不带 `/pi`)的请求 → 404。
若发现,记下调用点,那是个 patch 没覆盖到的边角(理论上审计已排除,但浏览器实测为准)。

---

## 回退

```bash
# 不带 PI_WEB_BASE_PATH 重启即可,恢复根路径模式
cd /d/Programs/pi-web
MSYS_NO_PATHCONV=1 NO_PROXY=localhost,127.0.0.1 bun run dev
```

---

## 常见问题

**Q: 测试期间 pi agent TUI 的链接指向哪?**
A: basePath 生效后是 `http://localhost:30141/pi/`。回退后恢复 `http://localhost:30141/`。

**Q: 能不能不重启、另起一个端口测?**
A: 可以试 `PORT=30142 PI_WEB_BASE_PATH=/pi bun run dev`,但会和当前 dev server
**共用 `.next/` 缓存**,可能互相破坏(AGENTS.md 也警告 build 会污染 .next)。
推荐还是用上面的"暂停→重启"方式,最干净。

**Q: `next build` 报 `EPERM: scandir 'C:\Users\CyYu\Application Data'`?**
A: 那是另一回事——从**符号链接路径**跑 webpack 生产构建时,glob 扫到了用户主目录里
受限的 `Application Data` junction。**dev 模式不受影响**(本指南就是 dev)。
要跑生产构建,务必从**真实路径** `D:\Programs\pi-web` 跑。
详见项目记忆里的 tool-quirk 记录。
