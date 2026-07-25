@echo off
REM === pi-web local dev startup (basePath /pi + nginx proxy) ===
REM Starts dev server, pre-warms all API routes to avoid Turbopack hang,
REM then opens browser. Keep this window open while developing.
REM
REM Prerequisites:
REM   - nginx running on 8443 (servy service)
REM   - bun installed
REM   - Run from project root (D:\Programs\pi-web)

cd /d D:\Programs\pi-web
if errorlevel 1 (
    echo [ERROR] Cannot cd to D:\Programs\pi-web
    pause
    exit /b 1
)

echo === Cleaning .next cache ===
if exist .next rmdir /s /q .next

echo === Starting pi-web dev server (basePath=/pi) ===
set PI_WEB_BASE_PATH=/pi
set NO_PROXY=localhost,127.0.0.1
start "pi-web-dev" /MIN bun run dev
echo Waiting for server to be ready...

:wait
timeout /t 2 /nobreak >nul
curl -s -m 3 -o nul http://localhost:30141/pi/api/home 2>nul
if errorlevel 1 goto wait

echo Server ready. Pre-warming API routes...

set BASE=http://localhost:30141/pi

echo   %BASE%/api/home
curl -s -m 15 -o nul %BASE%/api/home
echo   %BASE%/api/sessions
curl -s -m 15 -o nul %BASE%/api/sessions
echo   %BASE%/api/models
curl -s -m 15 -o nul %BASE%/api/models
echo   %BASE%/api/skills
curl -s -m 15 -o nul %BASE%/api/skills
echo   %BASE%/api/plugins
curl -s -m 15 -o nul %BASE%/api/plugins
echo   %BASE%/api/auth/providers
curl -s -m 15 -o nul %BASE%/api/auth/providers
echo   %BASE%/api/auth/all-providers
curl -s -m 15 -o nul %BASE%/api/auth/all-providers
echo   %BASE%/api/models-config
curl -s -m 15 -o nul %BASE%/api/models-config

echo.
echo ============================================
echo   Ready: https://localhost:8443/pi
echo   Direct: http://localhost:30141/pi
echo ============================================
echo.
echo Press Ctrl+C or close this window to stop.
start "" https://localhost:8443/pi
pause >nul
