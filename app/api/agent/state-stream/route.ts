import {
  createSessionStateStream,
  MAX_SESSION_STATE_STREAMS,
  sessionStateStreamCount,
} from "@/lib/session-state-broadcast";
// 副作用导入：状态快照的 provider 由 rpc-manager 在模块加载时注册。冷启动时若
// 本 route 是第一个被命中的，必须保证 rpc-manager 已加载，否则首帧快照为空。
import "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

/**
 * GET /api/agent/state-stream - 会话运行态 SSE 广播流。
 *
 * 列表页（手机 SessionListScreen / 浏览器 SessionSidebar）订阅本流即时获知
 * 「哪些会话在跑 / 在等用户输入 / 列表结构是否变了」，取代原先 2.5s 一轮的
 * `/api/agent/running` 轮询（轮询保留为断线兜底）。每帧都是全量快照，
 * 客户端直接替换本地状态即可，无需处理增量顺序。
 */
export async function GET(req: Request) {
  if (req.signal.aborted) return new Response(null, { status: 204 });

  // 每条流常驻一个 socket 在生产 Next 进程内；上限防异常客户端重连风暴。
  // 客户端收到 503 应退避重试（并在此期间靠兜底轮询维持正确性）。
  if (sessionStateStreamCount() >= MAX_SESSION_STATE_STREAMS) {
    return new Response("Too many session state streams", {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const stream = createSessionStateStream(req);

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // nginx 反代默认缓冲会攒住 SSE 帧，必须显式关掉（与 events 流一致）。
      "X-Accel-Buffering": "no",
    },
  });
}
