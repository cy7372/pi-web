import assert from "node:assert/strict";
import test from "node:test";
import { createJiti } from "jiti";

const jiti = createJiti(import.meta.url, { tsconfigPaths: true });
const {
  registerSessionStateProvider,
  getSessionStateSnapshot,
  subscribeSessionState,
  publishSessionStateChange,
  createSessionStateStream,
} = await jiti.import("./session-state-broadcast.ts");

/**
 * 广播器状态挂在 Symbol.for + globalThis（Next 模块图隔离对策），全测试文件
 * 共享同一份。因此每个用例用互不相同的会话 id / 版本号，避免上一个用例留下的
 * lastKey 把本用例的推送当作「无变化」吞掉。
 */
let providerCalls = 0;
let current = { running: [], awaiting: [], sessionListVersion: 0 };

function useProvider() {
  providerCalls = 0;
  registerSessionStateProvider(() => {
    providerCalls += 1;
    return current;
  });
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * 广播器有 150ms 节流窗口，而上一个用例的尾沿推送会刷新 lastPublishedAt。
 * 计时敏感的用例先 settle，避免跨用例时序耦合导致首推被误节流。
 */
const settle = () => sleep(220);

/** 收集推送帧，返回 { frames, dispose }。 */
function collect() {
  const frames = [];
  const dispose = subscribeSessionState((snapshot) => frames.push(snapshot));
  return { frames, dispose };
}

test("无 provider 时快照为空且不抛错", () => {
  registerSessionStateProvider(null);
  assert.deepEqual(getSessionStateSnapshot(), {
    running: [],
    awaiting: [],
    sessionListVersion: 0,
  });
  // provider 为 null 时 publish 必须静默返回（冷启动窗口不能炸事件链）。
  assert.doesNotThrow(() => publishSessionStateChange());
});

test("provider 抛错时降级为空快照，不影响调用方", () => {
  registerSessionStateProvider(() => {
    throw new Error("registry unavailable");
  });
  assert.deepEqual(getSessionStateSnapshot(), {
    running: [],
    awaiting: [],
    sessionListVersion: 0,
  });
  assert.doesNotThrow(() => publishSessionStateChange());
});

test("无订阅者时不计算快照（零成本早退）", () => {
  useProvider();
  current = { running: ["s-zero-1"], awaiting: [], sessionListVersion: 1 };
  publishSessionStateChange();
  publishSessionStateChange();
  assert.equal(providerCalls, 0);
});

test("状态变化时向订阅者推全量快照", async () => {
  useProvider();
  await settle();
  const { frames, dispose } = collect();
  current = { running: ["s-a"], awaiting: [], sessionListVersion: 10 };
  publishSessionStateChange();
  assert.equal(frames.length, 1);
  assert.deepEqual(frames[0], {
    running: ["s-a"],
    awaiting: [],
    sessionListVersion: 10,
  });

  // 快照未变 → 不重复推送（流式期间 emit 高频调用靠这层挡住）。
  const callsAfterFirst = providerCalls;
  publishSessionStateChange();
  await sleep(200);
  assert.equal(frames.length, 1, "相同快照不应重复推送");
  assert.ok(providerCalls > callsAfterFirst, "变更检测允许读 provider，但不推送");

  // 真变化 → 推第二帧。
  current = { running: [], awaiting: [], sessionListVersion: 10 };
  publishSessionStateChange();
  await sleep(200);
  assert.equal(frames.length, 2);
  assert.deepEqual(frames[1].running, []);
  dispose();
});

test("awaiting（等你回答）与 sessionListVersion 变化同样触发推送", async () => {
  useProvider();
  await settle();
  const { frames, dispose } = collect();
  current = { running: ["s-b"], awaiting: ["s-b"], sessionListVersion: 20 };
  publishSessionStateChange();
  // 节流窗口内连打两次变更：中间态被合并掉，尾沿只推**最新态**。
  // 这是设计意图（last-write-wins）：列表页只关心当前状态，逐帧推中间态
  // 反而会造成黄点闪烁。
  current = { running: ["s-b"], awaiting: [], sessionListVersion: 20 };
  publishSessionStateChange();
  current = { running: ["s-b"], awaiting: [], sessionListVersion: 21 };
  publishSessionStateChange();
  await sleep(300);
  assert.equal(frames.length, 2, "首推 + 尾沿合并帧");
  assert.deepEqual(frames[0].awaiting, ["s-b"]);
  assert.deepEqual(frames[1], {
    running: ["s-b"],
    awaiting: [],
    sessionListVersion: 21,
  });
  dispose();
});

test("节流窗口内的最后一次变更必定补发（任务结束那帧不能被吞）", async () => {
  useProvider();
  await settle();
  const { frames, dispose } = collect();
  current = { running: ["s-c"], awaiting: [], sessionListVersion: 30 };
  publishSessionStateChange();
  assert.equal(frames.length, 1);

  // 立刻连打两次变更：第二次落在 150ms 节流窗口内，靠尾沿定时器补发。
  current = { running: [], awaiting: [], sessionListVersion: 30 };
  publishSessionStateChange();
  current = { running: [], awaiting: [], sessionListVersion: 31 };
  publishSessionStateChange();
  assert.equal(frames.length, 1, "节流窗口内不应立即推送");

  await sleep(300);
  assert.ok(frames.length >= 2, "尾沿必须补发最后一次状态");  const last = frames[frames.length - 1];
  assert.deepEqual(last, {
    running: [],
    awaiting: [],
    sessionListVersion: 31,
  });
  dispose();
});

test("取消订阅后不再收到推送；单个订阅者抛错不影响其余", async () => {
  useProvider();
  await settle();
  const good = [];
  const disposeGood = subscribeSessionState((s) => good.push(s));
  const disposeBad = subscribeSessionState(() => {
    throw new Error("subscriber blew up");
  });

  current = { running: ["s-d"], awaiting: [], sessionListVersion: 40 };
  assert.doesNotThrow(() => publishSessionStateChange());
  assert.equal(good.length, 1);

  disposeBad();
  disposeGood();
  current = { running: [], awaiting: [], sessionListVersion: 41 };
  publishSessionStateChange();
  await sleep(200);
  assert.equal(good.length, 1, "取消订阅后不应再收到");
});

test("SSE 流：首帧即全量快照，后续变更续推，abort 后停止", async () => {
  useProvider();
  await settle();
  current = { running: ["s-e"], awaiting: [], sessionListVersion: 50 };

  const ac = new AbortController();
  const req = new Request("http://localhost/api/agent/state-stream", {
    signal: ac.signal,
  });
  const stream = createSessionStateStream(req);
  const reader = stream.getReader();
  const decoder = new TextDecoder();

  try {
    // 每个 enqueueText 就是一个独立 chunk（注释帧与 data 帧分开），
    // 所以累积读到出现 data 帧为止。
    const readUntilData = async () => {
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) throw new Error(`流提前结束，已收: ${JSON.stringify(buffer)}`);
        buffer += decoder.decode(value, { stream: true });
        const payload = buffer
          .split("\n\n")
          .find((part) => part.startsWith("data: "));
        if (payload) return { raw: buffer, payload: payload.slice(6) };
      }
    };

    const first = await readUntilData();
    assert.ok(
      first.raw.startsWith(":\n\n"),
      `应先发注释帧冲响应头，实际: ${JSON.stringify(first.raw)}`,
    );
    assert.deepEqual(JSON.parse(first.payload), {
      type: "state",
      running: ["s-e"],
      awaiting: [],
      sessionListVersion: 50,
    });

    // 状态变化 → 续推新帧（节流尾沿，等一下）。
    current = { running: [], awaiting: [], sessionListVersion: 50 };
    publishSessionStateChange();
    await sleep(250);
    const second = await readUntilData();
    assert.deepEqual(JSON.parse(second.payload).running, []);

    // 客户端断开 → 清理，流结束（不再吃服务端资源、不泄漏心跳 interval）。
    ac.abort();
    const tail = await reader.read();
    assert.equal(tail.done, true, "abort 后流应结束");
  } finally {
    // 断言失败时也必须收尾：否则 30s 心跳 interval 会吊住整个测试进程
    // （node --test 不会自行退出）—— 生产侧同理，所以 cleanup 必须幂等。
    ac.abort();
    reader.cancel().catch(() => {});
  }
});
