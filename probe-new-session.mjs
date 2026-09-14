// probe-new-session.mjs — 模拟 pi-mobile 新建会话全流程，实测事件流时序。
// 验证假说：新会话首条消息的事件（user 回声/assistant 流）是否可能从 SSE 黑洞。
import { randomUUID } from "node:crypto";

const BASE = "http://127.0.0.1:30141";
const t0 = Date.now();
const ts = () => ((Date.now() - t0) / 1000).toFixed(2).padStart(7);

const cwd = process.env.USERPROFILE + "\\AppData\\Local\\Temp\\probe-" + randomUUID().slice(0, 8);
await (await import("node:fs")).promises.mkdir(cwd, { recursive: true });

// 1. ensureSession（手机端 client.ensureSession 同款 body）
const ensRes = await fetch(`${BASE}/api/agent/new`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cwd, type: "ensure_session" }),
});
const ens = await ensRes.json();
const sid = ens.sessionId;
console.log(ts(), "ensure →", ensRes.status, sid?.slice(0, 8));

// 2. SSE（在 prompt 之前连——与手机端 send 相同顺序）
const events = [];
const ctrl = new AbortController();
const sseRes = await fetch(`${BASE}/api/agent/${encodeURIComponent(sid)}/events`, {
  headers: { accept: "text/event-stream" },
  signal: ctrl.signal,
});
console.log(ts(), "sse status", sseRes.status);
const reader = sseRes.body.getReader();
const dec = new TextDecoder();
let buf = "";
const pump = (async () => {
  while (true) {
    const { done, value } = await reader.read();
    if (done) { events.push([ts(), "__stream_end__"]); break; }
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf("\n\n")) >= 0) {
      const frame = buf.slice(0, i); buf = buf.slice(i + 2);
      for (const line of frame.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          const ev = JSON.parse(line.slice(6));
          events.push([ts(), ev.type + (ev.isStreaming !== undefined ? ` isStreaming=${ev.isStreaming}` : "") +
            (ev.message?.role ? ` ${ev.message.role}` : "")]);
        } catch { /* 注释/心跳 */ }
      }
    }
  }
})();

// 3. waitForOpen 模拟：等第一个事件（connected 或任何 data）最多 4s
await Promise.race([
  new Promise(r => { const t = setInterval(() => { if (events.length) { clearInterval(t); r(); } }, 50); }),
  new Promise(r => setTimeout(r, 4000)),
]);
console.log(ts(), "waitOpen done, events so far:", events.length);

// 4. prompt（首条消息）
const prRes = await fetch(`${BASE}/api/agent/${encodeURIComponent(sid)}`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ type: "prompt", message: "回复『收到』两个字即可，不要调用任何工具" }),
});
console.log(ts(), "prompt →", prRes.status);

// 5. 收 15s 事件，观察 turn 全周期
await new Promise(r => setTimeout(r, 15_000));
ctrl.abort();
try { await pump; } catch {}

console.log("--- 事件时间线（相对秒）---");
for (const [t, e] of events) console.log(t, e);
const types = events.map(([, e]) => e.split(" ")[0]);
console.log("--- 汇总:", JSON.stringify(types.reduce((a, t) => (a[t] = (a[t] || 0) + 1, a), {})));
console.log("connected 到达:", types.includes("connected") ? "✓" : "✗ 缺失!");
console.log("user 回声:", types.some(t => t.startsWith("message_end")) ? "✓" : "?");
process.exit(0);
