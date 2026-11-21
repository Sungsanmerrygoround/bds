# Registers the weekly DB backup in Windows Task Scheduler for the current user (no admin needed).
#   powershell -ExecutionPolicy Bypass -File scripts\backup-task-install.ps1
# Runs daily at 12:30; if the PC was off, it runs as soon as it is back on (StartWhenAvailable).
# backup-task.ps1 skips unless the latest backup is 6+ days old, so this is effectively weekly.
# Remove: Unregister-ScheduledTask -TaskName "BDS DB backup" -Confirm:$false
# ASCII only: Windows PowerShell 5.1 reads BOM-less script files as ANSI.
$script = Join-Path $PSScriptRoot "backup-task.ps1"
$repo = Split-Path -Parent $PSScriptRoot
$action = New-ScheduledTaskAction -Execute "powershell.exe" `
  -Argument "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$script`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At "12:30"
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RunOnlyIfNetworkAvailable `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30) -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries
Register-ScheduledTask -TaskName "BDS DB backup" -Action $action -Trigger $trigger -Settings $settings -Force `
  -Description "BDS DB weekly backup to backups\ (skips if latest < 6 days). Log: backups\backup.log" | Out-Null
Get-ScheduledTask -TaskName "BDS DB backup" | Select-Object TaskName, State | Format-Table -AutoSize
Write-Host "Registered. Run now: Start-ScheduledTask -TaskName 'BDS DB backup'"
