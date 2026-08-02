@echo off
REM ============================================================
REM  PiWeb Servy launcher (called by Servy service, no args).
REM  Root-path mode for pi.cyyu.me subdomain. next binds loopback
REM  only (-H 127.0.0.1 in package.json start script).
REM ============================================================
setlocal
cd /d "D:\Programs\pi-web"
set "NO_PROXY=localhost,127.0.0.1"
REM pi-web request-security: trust the public hostname (DNS rebinding guard).
set "PI_WEB_HOSTNAME=pi.cyyu.me"
set "PI_WEB_ALLOWED_HOSTS=pi.cyyu.me,localhost,127.0.0.1"
"C:\Users\CyYu\AppData\Local\nvm\v22.20.0\bun.exe" run start
endlocal
