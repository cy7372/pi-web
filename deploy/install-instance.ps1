<#
.SYNOPSIS
  注册 pi-web 为 Windows 服务(Servy)。单实例多用户场景只调用一次。
  通过 HOME/USERPROFILE 指定 .pi 根目录。
.PARAMETER Instance
  实例名，用作服务名 pi-web-<Instance>。单实例用 "shared" 即可。
.PARAMETER Port
  loopback 端口。
.PARAMETER PiHome
  该实例的 .pi 根目录。默认 C:\pi-instances\<Instance>。
.PARAMETER HttpProxy
  可选。服务器若需代理访问 LLM(如国内访问 OpenAI)，传代理地址如 http://127.0.0.1:19718。
  会同时设 HTTP_PROXY/HTTPS_PROXY。不传则不设代理变量。
  ⚠️ 不管传不传代理，都会强制设 NO_PROXY=localhost,127.0.0.1 —— 否则
     instrumentation.ts 的 undici dispatcher 会让所有本地 API 路由 30s 超时挂死。
.EXAMPLE
  .\install-instance.ps1 -Instance shared -Port 30141 -PiHome C:\pi-web-data
  .\install-instance.ps1 -Instance shared -Port 30141 -PiHome C:\pi-web-data -HttpProxy http://127.0.0.1:19718
#>
param(
    [Parameter(Mandatory)][string]$Instance,
    [Parameter(Mandatory)][int]$Port,
    [string]$PiHome = "",
    [string]$HttpProxy = "",
    [string]$Repo = "C:\Users\CyYu\D-Programs\pi-web"
)
$ErrorActionPreference = "Stop"

if (-not $PiHome) { $PiHome = "C:\pi-instances\$Instance" }

New-Item -ItemType Directory -Force -Path $PiHome | Out-Null
New-Item -ItemType Directory -Force -Path "$PiHome\logs" | Out-Null
New-Item -ItemType Directory -Force -Path "C:\pi-instances\logs" | Out-Null

# nvm4w 稳定符号链接：node 切版本不影响它。切勿用带版本号的 nvm\v22.x 路径。
$NodeExe = "C:\nvm4w\nodejs\node.exe"
if (-not (Test-Path $NodeExe)) { throw "找不到 $NodeExe，请确认 nvm4w 路径" }

# next 的 JS 入口，供 node.exe 直接调用（servy 要求 path 是 .exe）
$Params = "node_modules\next\dist\bin\next start -H 127.0.0.1 -p $Port"

# ── 环境变量 ──
# HOME+USERPROFILE 决定 ~/.pi 位置(pi 用 os.homedir()=Windows 的 USERPROFILE)
# NO_PROXY 必设：否则 instrumentation.ts→undici.EnvHttpProxyAgent 会把本地 /api/* 也塞进代理 → 30s 挂死
$EnvVars = "HOME=$PiHome; USERPROFILE=$PiHome; NO_PROXY=localhost,127.0.0.1"
if ($HttpProxy) {
    $EnvVars += "; HTTP_PROXY=$HttpProxy; HTTPS_PROXY=$HttpProxy"
    Write-Host "  代理: $HttpProxy (LLM 出站走代理，本地 API 绕过)" -ForegroundColor Cyan
} else {
    Write-Host "  无代理: 本机直连 LLM。若服务器在国内访问 OpenAI 受限，重装时加 -HttpProxy" -ForegroundColor Yellow
}

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
Write-Host "验证(确认 env 完整，尤其 NO_PROXY 在):"
Write-Host "  servy-cli query --name=pi-web-$Instance"
Write-Host ""
Write-Host "首次启动前先构建(bun):"
Write-Host "  cd $Repo ; bun install ; bun run build"
