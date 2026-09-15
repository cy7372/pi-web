# AgentSession host-process isolation: stay in-process behind layered defenses

**Status**: Accepted (2026-09-12); "stay in-process" verdict superseded by
[ADR 0005](0005-frontend-agent-split.md) (2026-09-15) — defense layers 1–4
below remain in force. · **Review trigger**: any third incident of
extension-driven process-state corruption, or an upstream `pi --mode rpc`
protocol parity milestone.

## Background

Pi Web runs `AgentSession` **in-process** inside the production Next.js server
(`startRpcSession()` → `createAgentSessionFromServices()`), and the SDK loads
the user's global extensions (`~/.pi/agent/extensions/`) into that same server
process. Extensions therefore execute in **two hosts**:

- the `pi` TUI (dedicated process; process ≡ session),
- Pi Web's Next server (shared process: server + every session + Next itself).

Process-global state (`process.chdir`, `process.exit`, `process.env` mutation,
signal handlers) is harmless in the first host and catastrophic in the second.
On 2026-09-12 a freshly written `cwd_sync.ts` extension called
`process.chdir(sessionCwd)` on `session_start`; a Pi Web user opened a session
whose cwd was on `C:` while the server lived on `D:`, and Next 16's per-request
`path.relative(process.cwd(), projectDir)` returned an absolute cross-drive path
that `join()` folded into `C:\Users\CyYu\.pi\D:\Programs\pi-web\.next\...`,
ENOENT-ing every route manifest — all API routes 500'd for hours while the
process stayed RUNNING and static assets still served.

The incident was fixed with four layers (all shipped):

1. **Knowledge** — `~/.pi/agent/AGENTS.md` red-line section: dual-host facts
   and the ban on process-global mutation in extension code.
2. **Static detection** — `~/.pi/rules/ast-grep-rules/rules/no-chdir-in-pi-extensions.yml`
   (pi-lens project rule; warns on `process.chdir` in extension files,
   structurally suppressed when a host guard encloses the call; verified 5/5
   against the real napi engine including a mutation-guard fixture).
3. **Runtime backstop** — `lib/rpc-manager.ts` `getHostCwd()`/`restoreHostCwd()`
   (commit c728293): anchor captured synchronously at `startRpcSession` entry,
   restored after every session start and every `wrapper.send()`.
4. **Memory** — yinor global-partition episodes retrievable from any project
   ("cwd 劫持").

## Decision

**Keep AgentSession in-process.** Do not move sessions to worker threads or
`pi --mode rpc` subprocesses now. The dual-host class of bugs is contained by
the layered defenses above; isolation would cost feature parity and a rewrite
of `rpc-manager`'s 2,800-line core while the incident record shows a single
occurrence with a fully closed loop.

## Considered alternatives

| | Isolation | Verified facts (2026-09-12) | Blocking costs |
| --- | --- | --- | --- |
| **B. worker_threads per session** | Platform-level for cwd (Node 22 throws `process.chdir() is not supported in workers` — confirmed empirically); separate heaps | SDK compatibility with workers is **unproven**: `initTheme`, custom-UI registries, and `globalThis.__piSessions` assume a shared main-thread realm that workers deliberately do not share | Message-passing rewrite of `AgentSessionWrapper`; subagent controller and cross-session state all change shape |
| **C. subprocess `pi --mode rpc`** | Total (process ≡ session, CLI-identical semantics for extensions) | Official JSONL-over-stdio protocol covers prompting, steering, forks, compaction, bash streaming, extension-UI dialogs | Protocol is a **strict subset** of in-process: no `navigate_tree`, no tool-preset switching, no Chat-only mode — Pi Web features would regress until upstream `pi` grows those commands. Per-session spawn cost (Windows `pi`→bun shim→node chain), SSE bridge and lifecycle (idle reap, crash restart) all rewritten |

C's latent upside: a session process could run on **another machine** — the
road toward remote compute (d01/ai2) if session execution is ever offloaded.

## Consequences

- **Positive**: zero regression today; incident loop closed with evidence;
  the four layers defend the known failure mode at write-time, dispatch-time,
  runtime, and retrieval-time.
- **Negative**: process-global misbehavior outside the `chdir` family (env
  mutation, event-loop blocking, memory leaks) is only partially covered by
  layer 3; a second incident of a *new* family reopens this decision.
- **Neutral**: layer 3 makes Pi Web's server cwd a defended invariant — any
  future subsystem that legitimately wants a different cwd must opt in
  explicitly rather than inherit one from an accident.

## Roadmap (prerequisites before either alternative is viable)

1. **B**: a half-day POC proving the SDK + one real extension run inside a
   `worker_threads` Worker (theme init, session file IO, extension load).
2. **C**: upstream RPC parity list — `navigate_tree`, `set_tools`/tool
   presets, Chat-only resource-loader options, session resource snapshots.
   Track at the fork (github.com/cy7372/pi-web ↔ agegr/pi-web).
3. **Optional now** (cheap, independent): upgrade layer 3 from
   restore-after-the-fact to **refuse-to-load** — scan extension sources with
   the same ast-grep rule before the SDK loads them, and reject flagged
   extensions with a clear log line. Extension code then never executes.
