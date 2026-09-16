# Split Dancher Agent web into static frontend, API service, and agent daemon

**Status**: Accepted (direction, 2026-09-15) · implementation phased — see
"Migration" · **Supersedes** the "keep AgentSession in-process" decision of
[ADR 0004](0004-agent-session-host-isolation.md) (0004's four defense layers
remain in force; only the in-process verdict is revisited).

## Context

Dancher Agent web is one Next.js process doing three jobs: serving the SPA, hosting
23 API route groups, and running `AgentSession` instances in-process
(`lib/rpc-manager.ts`, 2.8k lines) — including the user's global pi
extensions, node-pty terminals, and web-push. Consequences the owner is no
longer willing to accept:

1. **Every deploy restarts everything.** `deploy.cmd` = build + Servy
   restart. Frontend-only changes kill SSE streams and interrupt in-flight
   agent runs.
2. **One fault domain.** A crash or hang in the web/HTTP layer takes down
   running agents (and vice versa — an extension misbehaving degrades the
   HTTP server; the 2026-09-12 cwd incident was this class).
3. **Coupling.** Frontend, API, and agent runtime ship as one artifact; no
   unit can be deployed, rolled back, or restarted independently.

Facts established during investigation (2026-09-15):

- The frontend is already a pure client SPA: 44/109 source files are
  `'use client'`, zero async server components. Next adds no SSR value.
- The agent HTTP surface is thin: `app/api/agent/[id]/route.ts` (90 lines)
  and `events/route.ts` (39 lines) are wrappers over `getRpcSession` /
  `startRpcSession` + `createAgentEventStream`. **They can be moved, not
  rewritten.**
- 14 route files import rpc-manager. Besides `/api/agent/**` these are:
  `sessions/` (list, `[id]`, context, state, auto-name — mostly read-only
  enrichment via `getRpcSessionInfos`), `subagents/[id]`, `project-trust`,
  `agent/running`, `agent/state-stream`. They need daemon *queries*, not
  daemon *logic*.
- Terminals (node-pty) live in `lib/terminal-manager` behind stateless HTTP
  routes; they are independent of agent sessions.
- nginx already fronts everything on :8443 (mTLS + auth subrequest to
  :21090, `proxy_buffering off`), and `location /api/auth/` already routes
  to a separate service — path-based splitting has precedent.
- ADR 0004 rejected worker_threads and `pi --mode rpc` subprocesses on
  2026-09-12. Neither is what this ADR proposes: the daemon keeps the full
  in-process SDK usage (`createAgentSessionFromServices`), just in its own
  process, reached over loopback HTTP. The blocking costs ADR 0004
  identified (worker realm assumptions; RPC protocol subset) do not apply
  to a move-your-own-code split.

## Decision

Three deploy units behind the existing nginx :8443 (mTLS + auth gate
unchanged):

```text
nginx :8443
 ├─ /              → static SPA export  (D:\Programs\pi-web\web-dist)
 ├─ /api/auth/     → 127.0.0.1:21090    (unchanged)
 ├─ /api/agent/*   → 127.0.0.1:30142    (agent daemon, new Servy service PiAgent)
 └─ /api/*         → 127.0.0.1:30141    (API service, Next.js API-only, Servy PiWeb)
```

### Unit 1 — static frontend (`apps/web`)

Next.js `output: 'export'` build (same router/components — no Vite rewrite
in phase 1; Vite remains a later option if export friction appears).
Deployed by atomically swapping `web-dist/`; **no process restart, SSE
untouched**. `next.config.ts` `headers()` (CSP relaxation note, SW headers,
manifest caching) moves to the nginx `location /` block. PWA bits
(`public/sw.js`, `offline.html`, icons) are static already.

Same-origin is preserved by nginx path routing — zero CORS work.

### Unit 2 — API service (`apps/api`)

Today's Next.js app minus `app/(pages)` minus `app/api/agent/**`, serving
everything stateless or file-backed: sessions read-only routes (via
`lib/session-reader`), files, worktrees, git, models-config, skills,
plugins, auth storage, terminal (node-pty stays here — accepted trade-off:
terminals die on API deploys; they are ephemeral UI, agents are not).

Deploy = build + restart PiWeb. Running agents are unaffected (their HTTP
paths terminate on the daemon).

### Unit 3 — agent daemon (`apps/agent`)

A plain Node process (same runtime as today's `next start` child — no bun
runtime switch; bun daemon is an optional POC later) hosting, essentially
unmodified:

- `lib/rpc-manager.ts` core (wrapper registry, idle timeout, extension
  loading, fork semantics, subagent controller)
- today's `app/api/agent/**` route handlers (they are Web-standard
  `Request`/`Response` — small adapter onto a node http server)
- an internal query endpoint for the API layer's cross-boundary calls:
  running ids, `getRpcSessionInfos`, `hasBusyRpcSessionForCwd`,
  `destroyRpcSessionsForCwd`, awaiting-input / notification-suppression
  lists.

Daemon deploys are rare (only when the pi SDK or rpc-manager core changes)
and are the only deploys that interrupt agents — parity with today's every
deploy.

### Security

- Daemon binds **127.0.0.1 only** and requires an `X-Daemon-Token` header.
- nginx injects the token (`proxy_set_header`) on `/api/agent/*`; the SPA
  never sees it. Direct browser hits to :30142 fail the token check
  (mitigates localhost CSRF from arbitrary web pages).
- Browser-facing auth for `/api/agent/*` stays exactly where it is:
  nginx mTLS + `/__auth_pi` gate, unchanged.

### Ownership matrix (single-writer rule)

| State | Writer | Readers |
| --- | --- | --- |
| `~/.pi/agent/sessions/*.jsonl` (live edits) | daemon | api (read-only), static (none) |
| `~/.pi/agent/models.json`, `settings.json` | api | daemon (at session start) |
| `~/.pi/agent/extensions/` | user | daemon only (never the web server — this is the ADR 0004 incident class, now structurally impossible) |
| `web-dist/` | web deploy | nginx |
| PTY state (`lib/terminal-manager`) | api | api |

The pi TUI ↔ daemon "one writer per session file" rule from the global
AGENTS.md is unchanged: pi-web sessions remain owned by exactly one
process (the daemon instead of the web server).

## Migration

Each phase ships independently and has a rollback that does not require
reverting code:

- **Phase 0 — monorepo restructure.** bun workspaces:
  `apps/web`, `apps/api`, `apps/agent`, `packages/shared` (types,
  `normalize.ts`, path helpers). No behavior change; deploy.cmd still works
  end-to-end. *Rollback: git revert.*
- **Phase 1 — L1 static split.** `apps/web` export build + nginx
  `location /` → `web-dist/`; headers/manifest move to nginx;
  `deploy-web.cmd` (build + swap, no restart). *Rollback: nginx conf
  revert to proxy :30141.*
- **Phase 2 — L2 daemon split.** Move rpc-manager core + agent routes +
  their lib deps into `apps/agent`; nginx gains `/api/agent/*` → :30142;
  API's cross-boundary routes switch to the internal query endpoint.
  *Rollback: nginx conf revert (daemon keeps running, unused).*
- **Phase 3 — hardening.** Servy `PiAgent` service (fail-fast launcher,
  RestartProcess recovery like PiWeb), daemon crash semantics (sessions
  reload from file; in-flight prompt lost — same as a server crash today),
  push-notification trigger audit (web-push calls in rpc-manager move with
  it), logs/observability, update `AGENTS.md` architecture + File Map.

## Risks / open items

- **SDK under a bare node process** — same runtime and same call pattern as
  today (`next start` → node child), so risk is low, but Phase 2 starts
  with a smoke POC mirroring ADR 0004's discipline: one real session, one
  extension, SSE end-to-end.
- **resolveSessionPath duplication** — `lib/session-reader` is used by both
  units; it lands in `packages/shared` (read-only path resolution + file
  parsing; the daemon adds write paths).
- **Cross-boundary call inventory** must be re-audited at Phase 2 (grep
  `rpc-manager` in `app/api` — 14 files today) so no route silently keeps
  importing the core.
- **Extension dual-host** becomes dual-host-minus-Next: extensions now run
  in TUI + daemon. ADR 0004's layers 1–4 stay; the daemon simply has no
  Next.js left to poison. The no-chdir ast-grep rule keeps applying to
  extension sources regardless of host.
- **`next dev` parity** — `apps/api` keeps `.next` / `.next-dev` split
  discipline; `apps/web` export build gets its own output dir. Dev story:
  two dev commands (or one `dev` script running both).

## Consequences

- **Positive**: frontend deploys are restart-free and instant; API deploys
  never touch agent HTTP paths; agent crashes no longer take the web UI
  down; the ADR 0004 incident class (extensions corrupting the Next host)
  is structurally eliminated; port/service ownership becomes explicit
  (30141 PiWeb, 30142 PiAgent, 21090 auth — recorded in global memory).
- **Negative**: three deploy units and two Servy services to operate; one
  more loopback hop for `/api/agent/*` (loopback latency negligible); the
  monorepo restructure is a one-time tax on every open PR/branch.
- **Neutral**: ADR 0004 is superseded on its in-process verdict only; its
  defense layers and its worker/`pi --mode rpc` roadmaps remain reference
  material. The "another machine" upside ADR 0004 noted for alternative C
  (remote compute) now has a cleaner path: the daemon's loopback transport
  is the seam a future remote link would replace.

## Upstream tracking after the repo split (2026-09-15, user decision)

Question: after `apps/api` is extracted into pi-server via git filter-repo,
can the server side still track upstream (agegr/pi-web)?

Decision: **A/C — filter-repo extraction + pi-web stays the upstream
integration point.** pi-server hard-forks with our rewritten history;
upstream updates keep landing in pi-web first (it retains full shared
ancestry, so merges stay cheapest there), and server-relevant deltas
(app/api/**, server-side lib changes) are manually ported into pi-server.

Rationale:

- filter-repo rewrites every commit hash, so git-merge against upstream is
  structurally dead in pi-server regardless of anything else.
- ~85% of upstream churn is frontend (components/hooks) — it belongs to
  pi-web anyway and keeps normal mergeability there.
- The server side is our deepest-customized layer (proxy password gate,
  request-security, state-stream, worktree, Servy deployment); even a
  fork-based layout would still need per-merge manual reconciliation.
- The hardest server-side coupling is the pi SDK version, which travels
  through package.json dependency bumps, not git history.

Rejected alternative: pi-server = fresh fork of upstream + one-time
delta transplant (preserves git-merge, but locks pi-server to the
upstream layout and the transplant is large; mergeability buys little
under this level of divergence).
