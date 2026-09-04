@echo off
REM ============================================================
REM  PiWeb one-shot production deploy:
REM    1. bun install   (preinstall guard blocks npm/pnpm/yarn)
REM    2. bun run build (isolated HOME via deploy/build.mjs)
REM    3. servy-cli restart PiWeb
REM
REM  2026-09-04 RULE: keep this file ASCII-only with CRLF endings.
REM  Run from an ADMIN console so step 3 can restart the service;
REM  otherwise finish manually:  sudo servy-cli restart --name=PiWeb
REM ============================================================
setlocal
cd /d "D:\Programs\pi-web"
set "BUN=C:\Users\CyYu\AppData\Local\nvm\v22.20.0\bun.exe"

echo [deploy] 1/3 bun install ...
"%BUN%" install
if errorlevel 1 goto :fail

echo [deploy] 2/3 production build ...
"%BUN%" run build
if errorlevel 1 goto :fail

echo [deploy] 3/3 restart PiWeb service ...
servy-cli restart --name=PiWeb
if errorlevel 1 (
    echo [deploy] servy-cli needs elevation. Run:  sudo servy-cli restart --name=PiWeb
    exit /b 1
)

echo [deploy] done. Verify: https://pi.cyyu.me:8443/
exit /b 0

:fail
echo [deploy] FAILED - PiWeb service left running the previous build.
exit /b 1
