<#
.SYNOPSIS
  注册一个 pi-web 实例为 Windows 服务(Servy)。
  每个实例通过独立 HOME/USERPROFILE 隔离 ~/.pi(session/密钥/配置/文件白名单)。
.PARAMETER Instance
  实例名，用作服务名 pi-web-<Instance>。
.PARAMETER Port
  loopback 端口，各实例必须不同。
.PARAMETER PiHome
  该实例的 .pi 根目录。默认 C:\pi-instances\<Instance>。
  复用现有数据(如你自己)时传 C:\Users\CyYu。
.EXAMPLE
  .\install-instance.ps1 -Instance alice -Port 30141
  .\install-instance.ps1 -Instance me -Port 30141 -PiHome C:\Users\CyYu
#>
param(
    [Parameter(Mandatory)][string]$Instance,
    [Parameter(Mandatory)][int]$Port,
    [string]$PiHome = "",
    [string]$Repo = "C:\Users\CyYu\D-Programs\pi-web"
)
$ErrorActionPreference = "Stop"

if (-not $PiHome) { $PiHome = "C:\pi-instances\$Instance" }

# 独立目录 = 独立 ~/.pi(隔离的根本)
New-Item -ItemType Directory -Force -Path $PiHome | Out-Null
New-Item -ItemType Directory -Force -Path "$PiHome\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\pi-instances\logs" | Out-Null

# nvm4w 稳定路径：node 切版本不影响它。切勿用带版本号的 nvm\v22.x 路径，否则升级后服务失效。
$NodeExe = "C:\nvm4w\nodejs\node.exe"
if (-not (Test-Path $NodeExe)) { throw "找不到 $NodeExe，请确认 nvm4w 路径" }

# next 的 JS 入口，供 node.exe 直接调用（避开 .cmd shim，servy 要求 path 是 exe）
$Params = "node_modules\next\dist\bin\next start -H 127.0.0.1 -p $Port"

# 关键：HOME + USERPROFILE 同时设，确保 pi 所有代码路径都用这个隔离目录
$EnvVars = "HOME=$PiHome; USERPROFILE=$PiHome"

# 敏感值(参数/env)走 SERVY_*，不进命令行（防进程列表/历史泄露）
$env:SERVY_PROCESS_PARAMETERS = $Params
$env:SERVY_ENVIRONMENT_VARIABLES = $EnvVars

servy-cli install `
    --name="pi-web-$Instance" `
    --path="$NodeExe" `
    --startupDir="$Repo" `
    --startupType=Automatic `
    --stdout="$PiHome\logs\out.log" `
    --stderr="$PiHome\logs\err.log" `
    --enableSizeRotation --rotationSize=10 `
    --enableHealth --heartbeatInterval=30 --maxFailedChecks=3 `
    --recoveryAction=RestartService --maxRestartAttempts=5

Remove-Item Env:SERVY_PROCESS_PARAMETERS, SERVY_ENVIRONMENT_VARIABLES

Write-Host ""
Write-Host "OK 已注册服务 pi-web-$Instance" -ForegroundColor Green
Write-Host "  端口    : 127.0.0.1:$Port"
Write-Host "  .pi 目录: $PiHome\.pi"
Write-Host "  日志    : $PiHome\logs\"
Write-Host ""
Write-Host "下一步:"
Write-Host "  servy-cli start --name=pi-web-$Instance"
Write-Host "  验证 env 正确(路径反斜杠没被吞):"
Write-Host "    servy-cli query --name=pi-web-$Instance"
Write-Host "  首次需在该实例 ~/.pi 配好 LLM API key(见 README)"
