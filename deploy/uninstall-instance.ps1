<#
.SYNOPSIS
  注销一个 pi-web 实例服务(默认保留数据)。
.EXAMPLE
  .\uninstall-instance.ps1 -Instance alice
  .\uninstall-instance.ps1 -Instance alice -RemoveData   # 连 ~/.pi 一起删
#>
param(
    [Parameter(Mandatory)][string]$Instance,
    [switch]$RemoveData,
    [string]$PiHome = ""
)
$ErrorActionPreference = "Stop"

if (-not $PiHome) { $PiHome = "C:\pi-instances\$Instance" }
$Name = "pi-web-$Instance"

try { servy-cli stop --name=$Name } catch {}
servy-cli uninstall --name=$Name

Write-Host "OK 已注销服务 $Name" -ForegroundColor Green

if ($RemoveData) {
    Write-Host "  删除数据 $PiHome ..." -ForegroundColor Yellow
    Remove-Item -Recurse -Force $PiHome
} else {
    Write-Host "  数据保留在 $PiHome(含 ~/.pi session/密钥)。加 -RemoveData 可删除。"
}
