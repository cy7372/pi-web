# Build pi-web production bundle (root path) for pi.cyyu.me subdomain deployment.
#
# 2026-09-04: the USERPROFILE isolation logic moved INTO the build pipeline —
# package.json "build" now runs deploy/build.mjs, which points HOME/USERPROFILE
# at a clean .build-home before spawning `next build --webpack`. Every entrypoint
# (bun run build / npm run build / CI) gets the isolation automatically.
# This file remains as a thin alias for muscle memory; it adds nothing.
#
# Why isolation exists (2026-09-04 incident): Next 16 webpack dependency
# tracing walks USERPROFILE; the real profile has legacy junctions with
# Deny-List ACLs → EPERM or 8 GB OOM after ~400 s of scanning.
#
# Usage (from repo root):  powershell -File deploy/build.ps1
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$env:NO_PROXY = "localhost,127.0.0.1"

bun run build
exit $LASTEXITCODE
