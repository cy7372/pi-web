# Build pi-web production bundle with basePath=/pi for nginx /pi deployment.
#
# Two Windows-specific build fixes baked in (see git history 2026-08-01):
#   1. Isolated USERPROFILE — real profile has legacy junctions (Application Data,
#      Local Settings, ...) with Deny-List ACLs. Next.js 16 webpack dependency
#      tracing scans them → EPERM → build fails. Pointing USERPROFILE at a clean
#      empty dir sidesteps it.
#   2. PI_WEB_BASE_PATH=/pi — basePath is a BUILD-TIME Next.js config; must be set
#      when emitting the bundle, not just at `next start`.
# Usage (from repo root):  powershell -File deploy/build.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$env:PI_WEB_BASE_PATH = "/pi"
$env:NO_PROXY = "localhost,127.0.0.1"

# Clean isolated home (no legacy junctions). Reused across builds.
$buildHome = Join-Path $PSScriptRoot "..\.build-home"
New-Item -ItemType Directory -Force $buildHome | Out-Null
$env:USERPROFILE = $buildHome
$env:HOME = $buildHome

Write-Host "Building pi-web (basePath=/pi) with isolated USERPROFILE=$buildHome" -ForegroundColor Cyan
bun run build
exit $LASTEXITCODE
