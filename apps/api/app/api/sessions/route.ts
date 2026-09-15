import { NextResponse } from "next/server";
import { jsonResponse } from "@/lib/json-response";
import {
  attachSessionProjectInfo,
  getSessionListVersion,
  listAllSessions,
  mergeSessionLists,
} from "@/lib/session-reader";
import {
  getAwaitingInputRpcSessionIds,
  getCompletionNotificationSuppressedRpcSessionIds,
  getRpcSessionInfos,
  getRunningRpcSessionIds,
} from "@/lib/rpc-manager";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const force = new URL(req.url).searchParams.get("force") === "1";
    // ?short=1：移动端列表专用——firstMessage 截断到 300 字符。两端 UI 都只
    // 用它做标题回退（显示前 50 字），而完整首条消息（实测最长 16.7K 字符）
    // 占列表响应的 1/4 以上，手机端白白耗流量。网页端不传 short，保持
    // AgentSessionPanel 过滤/搜索的全文语义不变。
    const short = new URL(req.url).searchParams.get("short") === "1";
    const persistedSessionsPromise = listAllSessions({ force });
    // Capture before awaiting: mutations during the scan still require a later refresh.
    const sessionListVersion = getSessionListVersion();
    const [persistedSessions, runtimeSessions] = await Promise.all([
      persistedSessionsPromise,
      attachSessionProjectInfo(getRpcSessionInfos()),
    ]);
    const sessions = mergeSessionLists(persistedSessions, runtimeSessions);
    const payload = short
      ? sessions.map((s) =>
          s.firstMessage && s.firstMessage.length > 300
            ? { ...s, firstMessage: s.firstMessage.slice(0, 300) }
            : s,
        )
      : sessions;
    return jsonResponse(
      req,
      {
        sessions: payload,
        sessionListVersion,
        runningSessionIds: getRunningRpcSessionIds(),
        // Mobile clients consume this in one shot instead of also polling
        // /api/agent/running; keeps "awaiting your answer" distinct from
        // "running" in session lists.
        awaitingInputSessionIds: getAwaitingInputRpcSessionIds(),
        completionNotificationSuppressedSessionIds:
          getCompletionNotificationSuppressedRpcSessionIds(),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (error) {
    return NextResponse.json(
      { error: String(error) },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
