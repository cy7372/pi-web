import { registerAgentEventStreamCloser } from "./agent-event-stream";

/**
 * 会话运行态全局广播 —— SSE `/api/agent/state-stream` 的数据源与传输层。
 *
 * 为什么需要它：手机端会话列表与浏览器端 SessionSidebar 原先各自以 2.5s 轮询
 * `/api/agent/running` 感知「运行中 / 等你回答」。任务结束后黄点最坏要 3s+ 才灭
 * （轮询间隔 + 一次完整 listSessions 往返），用户体感就是「刷新太慢」。这里把
 * 状态变更改成事件驱动推送，延迟降到亚秒级，同时把轮询降频为断线兜底。
 *
 * 设计要点：
 * - 推**全量快照**（running / awaiting / sessionListVersion）而非增量 diff：
 *   体积极小（几个 id），幂等，客户端直接替换本地状态，不存在丢更新问题。
 * - 变更检测 + 150ms 节流 + **尾沿补发**：流式期间 emit 频率极高，但快照不变
 *   就不推；节流窗口内的最后一次变更必定补发 —— 「任务结束」那一帧绝不能被吞。
 * - 无订阅者时零成本：publish 第一行就返回，不计算快照。
 * - 订阅表 / provider / 节流状态全部挂 `Symbol.for + globalThis`：Next 16 下
 *   instrumentation.ts 与各 route handler 会被打进**互相独立的模块图**，模块级
 *   变量会变成两套互不相通的注册表（agent-event-stream.ts 已因此踩过僵尸流
 *   事故：关机钩子关了一个空 Set，而路由那份 SSE 还在心跳）。沿用同一套写法。
 * - 流的 closer 注册进 agent-event-stream 的共享注册表，让 instrumentation.ts
 *   既有的 SIGINT/SIGTERM 钩子能一并关掉本流（否则重现关机僵尸进程事故）。
 */

export interface SessionStateSnapshot {
  /** 正在跑 agent 的会话 id（含压缩中、bash 执行中、排队续跑）。 */
  running: string[];
  /** 阻塞在扩展 ui_request（如 ask_user_question）等用户输入的会话 id。 */
  awaiting: string[];
  /** 会话列表结构版本号；变化说明有新会话/改名/删除，客户端应重拉全列表。 */
  sessionListVersion: number;
}

export type SessionStateListener = (snapshot: SessionStateSnapshot) => void;

const EMPTY_SNAPSHOT: SessionStateSnapshot = {
  running: [],
  awaiting: [],
  sessionListVersion: 0,
};

/** 与 agent-event-stream 的心跳一致：30s 一个 SSE 注释帧，防代理掐空闲连接。 */
const HEARTBEAT_INTERVAL_MS = 30_000;
/** 快照计算/推送的最小间隔；尾沿定时器保证窗口内最后一次变更不丢。 */
const MIN_PUBLISH_INTERVAL_MS = 150;
/**
 * 单进程状态流连接上限。每条 SSE 常驻一个 socket 在生产 Next 进程里，
 * 不设上限的话异常客户端（重连风暴）能耗尽连接。超限返回 503，客户端退避重试。
 */
export const MAX_SESSION_STATE_STREAMS = 64;

const STATE_REGISTRY: symbol = Symbol.for("pi-web.sessionStateBroadcast");

interface BroadcastState {
  listeners: Set<SessionStateListener>;
  provider: (() => SessionStateSnapshot) | null;
  lastKey: string | null;
  lastPublishedAt: number;
  trailingTimer: ReturnType<typeof setTimeout> | null;
  streamCount: number;
}

function getState(): BroadcastState {
  const host = globalThis as Record<symbol, BroadcastState | undefined>;
  return (host[STATE_REGISTRY] ??= {
    listeners: new Set<SessionStateListener>(),
    provider: null,
    lastKey: null,
    lastPublishedAt: 0,
    trailingTimer: null,
    streamCount: 0,
  });
}

/**
 * 注册快照数据源。由 rpc-manager 在模块加载时调用（它掌握 registry 与
 * isRunning/hasPendingUiRequests 的真值）。广播器自身不 import rpc-manager，
 * 避免循环依赖；未注册时 publish 静默跳过、快照取空值。
 */
export function registerSessionStateProvider(
  provider: () => SessionStateSnapshot,
): void {
  getState().provider = provider;
}

export function getSessionStateSnapshot(): SessionStateSnapshot {
  const state = getState();
  if (!state.provider) return EMPTY_SNAPSHOT;
  try {
    return state.provider();
  } catch {
    return EMPTY_SNAPSHOT;
  }
}

export function subscribeSessionState(
  listener: SessionStateListener,
): () => void {
  const state = getState();
  state.listeners.add(listener);
  return () => {
    state.listeners.delete(listener);
  };
}

/** 当前活跃状态流连接数（route 用来做上限判断）。 */
export function sessionStateStreamCount(): number {
  return getState().streamCount;
}

function snapshotKey(snapshot: SessionStateSnapshot): string {
  return [
    snapshot.sessionListVersion,
    [...snapshot.running].sort().join(","),
    [...snapshot.awaiting].sort().join(","),
  ].join("|");
}

function doPublish(state: BroadcastState): void {
  if (state.listeners.size === 0 || !state.provider) return;
  let snapshot: SessionStateSnapshot;
  try {
    snapshot = state.provider();
  } catch {
    return;
  }
  const key = snapshotKey(snapshot);
  if (key === state.lastKey) return;
  state.lastKey = key;
  for (const listener of [...state.listeners]) {
    try {
      listener(snapshot);
    } catch {
      /* 单个订阅者抛错不影响其余订阅者 */
    }
  }
}

/**
 * 状态可能变了 —— 由 rpc-manager 的事件 choke point、prompt 提交、以及
 * session-reader 的 invalidateSessionListCache 调用。高频调用安全：无订阅者
 * 立即返回，有订阅者则节流 + 变更检测，真正推送的次数等于状态变化次数。
 */
export function publishSessionStateChange(): void {
  const state = getState();
  if (state.listeners.size === 0) return;
  const now = Date.now();
  if (now - state.lastPublishedAt >= MIN_PUBLISH_INTERVAL_MS) {
    state.lastPublishedAt = now;
    doPublish(state);
    return;
  }
  if (state.trailingTimer !== null) return;
  state.trailingTimer = setTimeout(() => {
    state.trailingTimer = null;
    state.lastPublishedAt = Date.now();
    doPublish(state);
  }, MIN_PUBLISH_INTERVAL_MS);
  // 尾沿定时器不该吊住进程退出（测试/关机场景）。
  state.trailingTimer.unref?.();
}

/**
 * 打开一条会话状态 SSE 流。首帧即全量快照（订阅先于首帧安装，订阅期间的变更
 * 也会被后续帧覆盖，客户端始终 last-write-wins，不存在启动窗口丢状态）。
 *
 * 传输细节全部对齐 agent-event-stream.ts 的生产经验：`cleanup(true|\"error\")`
 * 双语义（关机必须走 error 硬终止，否则 Next/Node 管道吞掉 close、socket 留在
 * ESTABLISHED、server.close() 的 drain 永不完成 → 僵尸进程）。
 */
export function createSessionStateStream(req: Request): ReadableStream<Uint8Array> {
  let cancelStream: (closeController: boolean | "error") => void = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let abortHandler: (() => void) | null = null;
      let releaseCloser: () => void = () => {};
      const state = getState();
      state.streamCount += 1;

      const cleanup = (closeController: boolean | "error") => {
        if (closed) return;
        closed = true;
        state.streamCount = Math.max(0, state.streamCount - 1);
        releaseCloser();
        releaseCloser = () => {};
        if (heartbeat !== null) clearInterval(heartbeat);
        unsubscribe?.();
        unsubscribe = null;
        if (abortHandler) req.signal.removeEventListener("abort", abortHandler);
        if (closeController === "error") {
          try {
            controller.error(new Error("pi-web server shutting down"));
          } catch {
            /* already closed */
          }
        } else if (closeController) {
          try {
            controller.close();
          } catch {
            /* stream already closed */
          }
        }
      };
      cancelStream = cleanup;
      releaseCloser = registerAgentEventStreamCloser(cleanup);

      const enqueueText = (text: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(text));
        } catch {
          cleanup(false);
        }
      };
      const encode = (data: unknown) => {
        enqueueText(`data: ${JSON.stringify(data)}\n\n`);
      };

      unsubscribe = subscribeSessionState((snapshot) => {
        encode({ type: "state", ...snapshot });
      });

      abortHandler = () => cleanup(true);
      if (req.signal.aborted) {
        cleanup(true);
        return;
      }
      req.signal.addEventListener("abort", abortHandler, { once: true });

      heartbeat = setInterval(
        () => enqueueText(":\n\n"),
        HEARTBEAT_INTERVAL_MS,
      );

      // 先冲一个注释帧把响应头推出去（与 events 流一致），再发首帧全量快照。
      enqueueText(":\n\n");
      encode({ type: "state", ...getSessionStateSnapshot() });
    },
    cancel() {
      cancelStream(false);
    },
  });
}
