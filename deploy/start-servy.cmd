@echo off
REM ============================================================
REM  PiWeb Servy launcher (called by Servy service, no args).
REM  Wraps bun run start with required environment variables.
REM  Security: package.json start script hardcodes -H 127.0.0.1
REM  so next binds loopback only (never 0.0.0.0).
REM ============================================================
setlocal
cd /d "D:\Programs\pi-web"
set "PI_WEB_BASE_PATH=/pi"
set "NO_PROXY=localhost,127.0.0.1"
"C:\Users\CyYu\AppData\Local\nvm\v22.20.0\bun.exe" run start
endlocal
