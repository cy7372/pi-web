@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Programs\pi-web\stop-pi-web.ps1"
powershell -NoProfile -ExecutionPolicy Bypass -File "D:\Programs\pi-web\start-pi-web.ps1"
