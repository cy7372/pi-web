$ErrorActionPreference = 'Stop'

# 1. Register PiWebLogon task (mirror of the proven TmuxKeepalive pattern)
$action    = New-ScheduledTaskAction -Execute 'powershell.exe' `
             -Argument '-NoProfile -ExecutionPolicy Bypass -File C:\Users\CyYu\bin\piweb-keepalive.ps1'
$principal = New-ScheduledTaskPrincipal -UserId 'DANCHER-WORKSTA\CyYu' -LogonType Interactive -RunLevel Limited
$trigger   = New-ScheduledTaskTrigger -AtLogOn -User 'DANCHER-WORKSTA\CyYu'
# PT0S = no execution time limit: the keepalive loop must run forever
# (default PT72H would silently kill the panel after 3 days)
$settings  = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
             -MultipleInstances IgnoreNew -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName 'PiWebLogon' -Action $action -Principal $principal `
    -Trigger $trigger -Settings $settings -Force | Out-Null
"registered: PiWebLogon"

# 2. Smoke test: can SYSTEM start an Interactive task as CyYu right now?
$probe = 'C:\Users\CyYu\Run\piweb-selftest.out'
Remove-Item $probe -ErrorAction SilentlyContinue
$testAction = New-ScheduledTaskAction -Execute 'powershell.exe' `
    -Argument "-NoProfile -Command `"whoami | Out-File -Encoding ascii '$probe'`""
Register-ScheduledTask -TaskName 'PiWebSelfTest' -Action $testAction -Principal $principal `
    -Settings (New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 2)) -Force | Out-Null
Start-ScheduledTask -TaskName 'PiWebSelfTest'
$deadline = (Get-Date).AddSeconds(30)
while (-not (Test-Path $probe) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 500 }
if (Test-Path $probe) {
    'selftest owner: ' + (Get-Content $probe | Select-Object -First 1).Trim()
} else {
    'selftest: FILE NOT CREATED - interactive task as user FAILED'
}
Unregister-ScheduledTask -TaskName 'PiWebSelfTest' -Confirm:$false
Remove-Item $probe -ErrorAction SilentlyContinue
"state PiWebLogon: " + (Get-ScheduledTask -TaskName 'PiWebLogon').State
