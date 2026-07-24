<#
.SYNOPSIS
  把 caddy.exe 注册为 Servy 服务(pi-caddy)，占 80/443，自动 TLS。
  前置: 从 https://caddyserver.com/download 下载 Windows 版 caddy.exe 放到 C:\caddy\caddy.exe
#>
param(
    [string]$CaddyExe = "C:\caddy\caddy.exe",
    [string]$Caddyfile = "C:\Users\CyYu\D-Programs\pi-web\deploy\Caddyfile"
)
$ErrorActionPreference = "Stop"

if (-not (Test-Path $CaddyExe)) {
    throw "找不到 $CaddyExe。先下载 Caddy 放到该路径。"
}
New-Item -ItemType Directory -Force -Path "C:\caddy" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\pi-instances\logs" | Out-Null

$Params = "run --config `"$Caddyfile`""
$env:SERVY_PROCESS_PARAMETERS = $Params

servy-cli install `
    --name="pi-caddy" `
    --path="$CaddyExe" `
    --startupDir="C:\caddy" `
    --startupType=Automatic `
    --stdout="C:\pi-instances\logs\caddy-stdout.log" `
    --stderr="C:\pi-instances\logs\caddy-stderr.log" `
    --enableSizeRotation --rotationSize=10 `
    --enableHealth --heartbeatInterval=30 --maxFailedChecks=3 `
    --recoveryAction=RestartService --maxRestartAttempts=5

Remove-Item Env:SERVY_PROCESS_PARAMETERS

Write-Host "OK 已注册服务 pi-caddy" -ForegroundColor Green
Write-Host "  Caddyfile: $Caddyfile"
Write-Host "  启动: servy-cli start --name=pi-caddy"
Write-Host ""
Write-Host "防火墙放行 80/443(管理员 PowerShell):"
Write-Host '  New-NetFirewallRule -DisplayName "Caddy-HTTP"  -Direction Inbound -LocalPort 80  -Protocol TCP -Action Allow'
Write-Host '  New-NetFirewallRule -DisplayName "Caddy-HTTPS" -Direction Inbound -LocalPort 443 -Protocol TCP -Action Allow'
