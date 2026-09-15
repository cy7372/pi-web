@echo off
REM ============================================================
REM  PiWeb WEB (static SPA) deploy - ADR 0005 unit 1:
REM    1. bun run build:web  (Next output:export -> apps/web/out)
REM    2. stage copy        (excludes test files)
REM    3. atomic-ish swap   (web-dist <-> web-dist.old)
REM  NO process restart, NO SSE interruption - nginx serves files
REM  straight from web-dist on the next request.
REM
REM  2026-09-15 RULE: keep this file ASCII-only with CRLF endings.
REM  Rollback: cd /d D:\Programs\pi-web
REM            rmdir /s /q web-dist && ren web-dist.old web-dist
REM ============================================================
setlocal
cd /d "D:\Programs\pi-web"
set "BUN=D:\Programs\bun\bun.exe"

echo [deploy-web] 1/2 static export build ...
"%BUN%" run build:web
if errorlevel 1 goto :fail

echo [deploy-web] 2/2 stage and swap web-dist ...
if exist web-dist.new rmdir /s /q web-dist.new
robocopy "apps\web\out" "web-dist.new" /E /XF *.test.mjs >nul
if errorlevel 8 goto :fail
if exist web-dist.old rmdir /s /q web-dist.old
if exist web-dist ren web-dist web-dist.old
ren web-dist.new web-dist

echo [deploy-web] done. SPA live from web-dist (nginx picks it up per request).
exit /b 0

:fail
echo [deploy-web] FAILED - web-dist untouched (previous SPA still served).
exit /b 1
