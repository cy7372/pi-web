# handoff-deploy.ps1 - one-shot pi-web production handoff.
#
# Situation this fixes (2026-09-15): the production Next server runs as an
# ORPHAN process chain (hidden powershell -> bun run start -> next start,
# PID captured live via the 30141 listener), while the Servy service PiWeb
# is Stopped. deploy.cmd alone cannot work here: its `servy-cli restart`
# would start a second server that fails to bind 30141 (held by the orphan)
# and after 5 recovery attempts leaves the service Stopped again.
#
# What this script does, in order:
#   1. Production build via the pinned standalone bun (orphan keeps serving;
#      brief transient chunk-404 risk accepted - documented in AGENTS.md).
#   2. Resolve the CURRENT listener PID on 127.0.0.1:30141 and kill ONLY
#      that PID (no tree kill, so this script itself survives - it is a
#      descendant of the same tree).
#   3. Wait for the port to free, then `servy-cli start --name=PiWeb`
#      (shell is expected to be elevated; sudo fallback included).
#   4. Wait for the new listener + HTTP sanity check.
#   5. Fallback: if the service did not come up, start deploy\start-servy.cmd
#      detached so production stays up (unsupervised, but serving).
#
# Everything is logged to logs\handoff-deploy.log. ASCII-only on purpose.
$ErrorActionPreference = "Continue"
$root = "D:\Programs\pi-web"
$log = Join-Path $root "logs\handoff-deploy.log"
$servyCli = "C:\Program Files\Servy\servy-cli.exe"

function Log($msg) {
  $line = "[{0}] {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $msg
  $line | Tee-Object -FilePath $log -Append
}

function Get-Listener {
  Get-NetTCPConnection -LocalPort 30141 -State Listen -ErrorAction SilentlyContinue |
    Select-Object -First 1
}

Log "=== handoff start (script pid $PID) ==="
Set-Location $root

# -- Step 1: production build -------------------------------------------------
Log "step1: production build (pinned bun)"
& "D:\Programs\bun\bun.exe" run build *>> $log
if ($LASTEXITCODE -ne 0) {
  Log "FATAL: build failed (exit $LASTEXITCODE). Production untouched, orphan still serving."
  exit 1
}
if (-not (Test-Path (Join-Path $root ".next\BUILD_ID"))) {
  Log "FATAL: .next\BUILD_ID missing after build. Production untouched."
  exit 1
}
Log "step1: build ok"

# -- Step 2: kill the orphan listener (single PID, NO tree kill) --------------
Start-Sleep -Seconds 3
$conn = Get-Listener
if (-not $conn) {
  Log "step2: no listener on 30141 (nothing to kill)"
} else {
  $oldPid = $conn.OwningProcess
  Log "step2: killing orphan listener pid $oldPid (single-PID kill, no /T)"
  Stop-Process -Id $oldPid -Force -ErrorAction SilentlyContinue
  # Parent chain (next.exe shim / bun / hidden powershell) exits naturally
  # once its child dies; no tree kill needed and none wanted.
}

# -- Step 3: wait for port free, then start the Servy service ------------------
for ($i = 0; $i -lt 15; $i++) {
  if (-not (Get-Listener)) { break }
  Start-Sleep -Seconds 1
}
if (Get-Listener) {
  Log "WARN: port 30141 still occupied after kill"
} else {
  Log "step3: port free"
}

Log "step3: servy-cli start PiWeb"
& $servyCli start --name=PiWeb *>> $log
if ($LASTEXITCODE -ne 0) {
  Log "servy start exit $LASTEXITCODE; retrying once via sudo"
  sudo $servyCli start --name=PiWeb *>> $log
}

# -- Step 4: wait for the new listener + HTTP sanity ---------------------------
$up = $false
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Seconds 1
  $c = Get-Listener
  if ($c) {
    $up = $true
    Log "step4: listener back, pid $($c.OwningProcess), after $($i+1)s"
    break
  }
}

# -- Step 5: fallback to detached start-servy.cmd ------------------------------
if (-not $up) {
  Log "step5: FALLBACK - service did not come up; starting start-servy.cmd detached"
  Start-Process -FilePath (Join-Path $root "deploy\start-servy.cmd") `
    -WorkingDirectory $root -WindowStyle Hidden
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    $c = Get-Listener
    if ($c) {
      $up = $true
      Log "step5: fallback listener up, pid $($c.OwningProcess) (UNSUPERVISED - fix service later)"
      break
    }
  }
}

if (-not $up) {
  Log "FAILED: no listener after all attempts. Manual recovery: deploy\start-servy.cmd"
  exit 1
}

try {
  $resp = Invoke-WebRequest -Uri "http://127.0.0.1:30141/" -UseBasicParsing -TimeoutSec 20
  Log "step4: HTTP check $($resp.StatusCode) OK"
} catch {
  Log "WARN: HTTP check failed: $($_.Exception.Message)"
}

& $servyCli status --name=PiWeb *>> $log
Log "=== handoff done ==="
