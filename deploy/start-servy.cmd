@echo off
REM ============================================================
REM  PiWeb Servy launcher (called by Servy service, no args).
REM  Root-path mode for pi.cyyu.me subdomain. next binds loopback
REM  only (-H 127.0.0.1 in package.json start script).
REM ============================================================
REM 2026-09-04 RULE: keep this file ASCII-only with CRLF endings.
REM  cmd.exe misparses UTF-8 comments under GBK codepage when the
REM  file has LF-only or mixed line endings, silently skipping set
REM  lines (symptom: PI_WEB_HOSTNAME missing -> 403 Untrusted).
REM 2026-09-04a: propagate bun exit code (endlocal & exit /b).
REM  If bun dies non-zero, Servy triggers its RestartService
REM  recovery instead of reading a fake clean exit 0.
REM 2026-09-04b: fail fast on a missing production build. next
REM  start would only log a vague no-build-id error; make the
REM  failure loud and the fix obvious in Servy event log.
setlocal
cd /d "D:\Programs\pi-web"
if not exist ".next\BUILD_ID" (
    >&2 echo [PiWeb] FATAL: production build missing - no .next\BUILD_ID. Rebuild with: deploy\deploy.cmd
    exit /b 1
)
set "NO_PROXY=localhost,127.0.0.1"
REM pi-web request-security: trust the public hostname (DNS rebinding guard).
set "PI_WEB_HOSTNAME=pi.cyyu.me"
set "PI_WEB_ALLOWED_HOSTS=pi.cyyu.me,localhost,127.0.0.1"
REM 2026-09-04: service runs as SYSTEM; os.homedir() resolved to
REM systemprofile so the pi SDK saw an empty session store and
REM /api/sessions was always empty (No session found).
REM Point it at the real user profile: web and CLI share one store.
set "USERPROFILE=C:\Users\CyYu"
set "HOME=C:\Users\CyYu"
REM 2026-09-09 RULE: never point at a versioned nvm path
REM  (nvm\v22.20.0\bun.exe vanished with the nvm upgrade -> child
REM  exit -> 5x restart exhausted -> service STOPPED -> 502).
REM  bun.exe is self-contained; pinned at D:\Programs\bun\bun.exe,
REM  decoupled from nvm. Update that copy manually when upgrading bun.
set "BUN_EXE=D:\Programs\bun\bun.exe"
if not exist "%BUN_EXE%" (
    >&2 echo [PiWeb] FATAL: bun.exe missing at %BUN_EXE%. Restore from nvm\*\node_modules\bun\bin\bun.exe.
    exit /b 1
)
"%BUN_EXE%" run start
endlocal & exit /b %errorlevel%
