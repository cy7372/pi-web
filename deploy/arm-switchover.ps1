$t = (Get-Date).AddMinutes(3).ToString('HH:mm')
$action   = New-ScheduledTaskAction -Execute 'powershell.exe' `
            -Argument '-NoProfile -ExecutionPolicy Bypass -File D:\Programs\pi-web\deploy\switchover-to-user.ps1'
$trigger  = New-ScheduledTaskTrigger -Once -At $t
$p        = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest
$s        = New-ScheduledTaskSettingsSet -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
Register-ScheduledTask -TaskName 'PiWebSwitchover' -Action $action -Trigger $trigger -Principal $p -Settings $s -Force | Out-Null
Write-Output ('switchover armed for {0} (now {1})' -f $t, (Get-Date -Format 'HH:mm:ss'))
