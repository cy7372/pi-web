Get-CimInstance Win32_Process -Filter "Name='node.exe' or Name='bun.exe'" |
  Where-Object { $_.CommandLine -match 'next|build|pi-web' } |
  Select-Object ProcessId, CreationDate, @{N='Cmd';E={$_.CommandLine.Substring(0, [Math]::Min(160, $_.CommandLine.Length))}} |
  Format-List
