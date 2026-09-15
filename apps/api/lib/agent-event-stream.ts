import {
  isEventIncludedInSnapshot,
  toClientAgentEvent,
  type AgentEventLike,
} from "./agent-event-wire";
import { acquireSessionLivenessLease } from "./session-liveness";

export interface AgentEventStreamSession {
  readonly isStreaming: boolean;
  readonly streamingMessage: unknown;
  onEvent(listener: (event: AgentEventLike) => void): () => void;
}

const HEARTBEAT_INTERVAL_MS = 30_000;

/**
 * Registry of live SSE streams. Next.js 16 (prod mode) handles SIGINT/SIGTERM
 * by calling server.close() and waiting INDEFINITELY for every connection to
 * end — with no timeout and no closeAllConnections (those are dev-only, see
 * node_modules/next/dist/server/lib/start-server.js cleanup()). An SSE stream
 * never ends on its own (it waits for the CLIENT to disconnect), so on
 * shutdown the process lingers forever: listener closed (502 upstream) but
 * node alive as an orphan, Servy never sees the exit. CloseAll below lets our
 * signal hook terminate the streams so Next's own drain completes and the
 * process exits normally. See instrumentation.ts.
 */
// IMPORTANT: instrumentation.ts and the route handlers are bundled into
// SEPARATE module graphs — each gets its own copy of this module, so a plain
// module-level Set would be two disconnected registries (verified live: the
// shutdown hook closed an empty set while the route's SSE kept heart-beating).
// Symbol.for + globalThis gives every copy the SAME registry.
const CLOSER_REGISTRY: symbol = Symbol.for("pi-web.agentEventStreamClosers");
type StreamCloser = (closeController: boolean | "error") => void;
const activeStreamClosers: Set<StreamCloser> = ((
  globalThis as Record<symbol, Set<StreamCloser>>
)[CLOSER_REGISTRY] ??= new Set<StreamCloser>());

/** Close every live SSE stream (called on process shutdown signals). */
export function closeAllAgentEventStreams(): void {
  for (const close of [...activeStreamClosers]) {
    try {
      close("error");
    } catch {
      /* stream already closed */
    }
  }
}

/**
 * Register another live SSE stream's closer so process shutdown terminates it
 * too (same zombie-drain hazard documented on CLOSER_REGISTRY above). Any route
 * that opens a never-ending stream MUST register here, otherwise Next 16's
 * server.close() drain hangs on it and Servy leaves an orphan process.
 * Returns the unregister function; call it from the stream's own cleanup.
 */
export function registerAgentEventStreamCloser(
  close: StreamCloser,
): () => void {
  activeStreamClosers.add(close);
  return () => {
    activeStreamClosers.delete(close);
  };
}

export function activeAgentEventStreamCount(): number {
  return activeStreamClosers.size;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Open the SSE transport immediately, then publish the session snapshot only
 * after the agent is ready and its event listener has been installed.
 */
export function createAgentEventStream(
  req: Request,
  sessionId: string,
  sessionPromise: Promise<AgentEventStreamSession>,
): ReadableStream<Uint8Array> {
  let cancelStream: (closeController: boolean | "error") => void = () => {};
  let releaseLease: () => void = () => {};

  return new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      let closed = false;
      let heartbeat: ReturnType<typeof setInterval> | null = null;
      let unsubscribe: (() => void) | null = null;
      let abortHandler: (() => void) | null = null;

      // "error": hard-terminate the response (SSE client sees a broken
      // stream and reconnects). Used on process shutdown: a plain close() is
      // swallowed by the Next/Node response pipeline without emitting a
      // chunked termination, so the socket stays ESTABLISHED and Next's
      // server.close() drain never completes (the original zombie bug).
      // "true": graceful close after we finished writing a final event.
      const cleanup = (closeController: boolean | "error") => {
        if (closed) return;
        closed = true;
        activeStreamClosers.delete(cleanup);
        releaseLease();
        releaseLease = () => {};
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
      activeStreamClosers.add(cleanup);
      releaseLease = acquireSessionLivenessLease(sessionId).release;

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
      const forwardEvent = (event: AgentEventLike, snapshot: unknown) => {
        if (isEventIncludedInSnapshot(event, snapshot)) return;
        const clientEvent = toClientAgentEvent(event);
        if (clientEvent) encode(clientEvent);
      };

      const publishSession = async () => {
        try {
          const session = await sessionPromise;
          if (closed) return;

          const bufferedEvents: AgentEventLike[] = [];
          let snapshotPublished = false;
          const handleEvent = (event: AgentEventLike) => {
            if (!snapshotPublished) {
              bufferedEvents.push(event);
              return;
            }
            forwardEvent(event, snapshot);
          };

          const stopListening = session.onEvent(handleEvent);
          if (closed) {
            stopListening();
            return;
          }
          unsubscribe = stopListening;

          const snapshot = session.streamingMessage;
          encode({
            type: "connected",
            sessionId,
            isStreaming: session.isStreaming,
          });
          for (const event of bufferedEvents) forwardEvent(event, snapshot);
          if (snapshot !== undefined && snapshot !== null) {
            encode({ type: "message_start", message: snapshot });
          }
          snapshotPublished = true;
        } catch (error) {
          if (closed) return;
          encode({
            type: "startup_error",
            errorMessage: `Failed to start agent: ${errorMessage(error)}`,
          });
          cleanup(true);
        }
      };

      // Attach the rejection handler before checking the request signal. The
      // route may already have started a shared cold-start promise.
      void publishSession();

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

      // Force the response headers through without claiming that the agent is
      // ready. The client waits for the later `connected` data event.
      enqueueText(":\n\n");
    },
    cancel() {
      cancelStream(false);
    },
  });
}
