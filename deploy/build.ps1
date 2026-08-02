# Build pi-web production bundle (root path) for pi.cyyu.me subdomain deployment.
# Runs ROOT-PATH (no basePath) — identical to upstream, zero source customization.
#
# Windows build fix baked in: isolated USERPROFILE — real profile has legacy
# junctions (Application Data, ...) with Deny-List ACLs. Next.js 16 webpack
# dependency tracing scans them → EPERM → build fails. Pointing USERPROFILE at
# a clean empty dir sidesteps it.
# Usage (from repo root):  powershell -File deploy/build.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$env:NO_PROXY = "localhost,127.0.0.1"

$buildHome = Join-Path $PSScriptRoot "..\.build-home"
New-Item -ItemType Directory -Force $buildHome | Out-Null
$env:USERPROFILE = $buildHome
$env:HOME = $buildHome

Write-Host "Building pi-web (root path) with isolated USERPROFILE=$buildHome" -ForegroundColor Cyan
bun run build
exit $LASTEXITCODE
