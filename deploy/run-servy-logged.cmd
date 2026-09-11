@echo off
REM PiWeb launcher wrapper with output capture (2026-09-11).
REM Called by piweb-keepalive.ps1 so bun/next errors are visible
REM in logs\last-run.log instead of dying silently in a hidden window.
call "D:\Programs\pi-web\deploy\start-servy.cmd" >> "D:\Programs\pi-web\logs\last-run.log" 2>&1
echo [wrapper] exit code %errorlevel% >> "D:\Programs\pi-web\logs\last-run.log"
exit /b %errorlevel%
