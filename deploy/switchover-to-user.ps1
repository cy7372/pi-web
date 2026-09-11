# PiWeb switchover: LocalSystem service -> user-context keepalive task (2026-09-11)
# Runs as a one-shot SYSTEM scheduled task (PiWebSwitchover), independent of the
# dying panel process tree. Order matters:
#   1. disable PiWeb service BEFORE stopping it (Servy RestartService recovery
#      must not be able to bring it back)
#   2. stop service  -> old SYSTEM next.exe dies (kills any pi sessions inside)
#   3. wait port 30141 free
#   4. schtasks /run PiWebLogon  -> new next.exe as CyYu
#   5. verify panel answers on 127.0.0.1:30141 and next.exe owner is CyYu
# Rollback (from any admin shell):
#   schtasks /change /tn PiWebLogon /disable
#   sc config PiWeb start= auto & sc start PiWeb
$Log = 'D:\Programs\pi-web\logs\switchover.log'
function Log([string]$m) { Add-Content $Log -Value "$(Get-Date -Format 'HH:mm:ss')  $m" }

Log '=== switchover start ==='
Log 'disable PiWeb service ...'
sc.exe config PiWeb start= disabled | Out-Null
Log 'stop PiWeb service (panel + hosted pi sessions die here) ...'
sc.exe stop PiWeb | Out-Null

# wait for service to actually stop and port to free (max 60s)
$deadline = (Get-Date).AddSeconds(60)
do {
    Start-Sleep -Seconds 2
    $svc = Get-CimInstance Win32_Service -Filter "Name='PiWeb'"
    $inUse = (Test-NetConnection 127.0.0.1 -Port 30141 -InformationLevel Quiet -WarningAction SilentlyContinue)
} while (($svc.State -ne 'Stopped' -or $inUse) -and (Get-Date) -lt $deadline)
Log ("service state={0} port30141_in_use={1}" -f $svc.State, $inUse)

Log 'start PiWebLogon task ...'
Start-ScheduledTask -TaskName 'PiWebLogon'

# wait for panel to answer (max 90s)
$ok = $false
$deadline = (Get-Date).AddSeconds(90)
while ((Get-Date) -lt $deadline) {
    Start-Sleep -Seconds 3
    try {
        $r = Invoke-WebRequest -Uri 'http://127.0.0.1:30141/' -UseBasicParsing -TimeoutSec 5
        if ($r.StatusCode) { $ok = $true; break }
    } catch { }
}
Log ("panel http: {0}" -f ($(if ($ok) { 'UP' } else { 'DOWN' })))

$next = Get-CimInstance Win32_Process -Filter "Name='next.exe'" | Select-Object -First 1
if ($next) {
    $o = Invoke-CimMethod -InputObject $next -MethodName GetOwner
    Log ("next.exe pid={0} owner={1}\{2}" -f $next.ProcessId, $o.Domain, $o.User)
} else {
    Log 'next.exe NOT FOUND after switchover'
}
Log '=== switchover done (self-deleting task) ==='
schtasks.exe /delete /tn PiWebSwitchover /f | Out-Null
