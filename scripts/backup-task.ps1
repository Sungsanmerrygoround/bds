# Windows Task Scheduler entry point for the weekly DB backup (install: scripts\backup-task-install.ps1).
# The task runs daily and whenever the PC comes back on after a missed run; the backup itself is
# skipped when the latest one is less than 6 days old. A new backup is then verified by restoring it
# into an in-memory Postgres. Output goes to backups\backup.log (UTF-8).
# ASCII only: Windows PowerShell 5.1 reads BOM-less script files as ANSI.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8  # node prints UTF-8
$repo = Split-Path -Parent $PSScriptRoot
Set-Location $repo
$dir = if ($env:BACKUP_DIR) { $env:BACKUP_DIR } else { Join-Path $repo "backups" }  # same rule as db-backup.ts
New-Item -ItemType Directory -Force $dir | Out-Null
$log = Join-Path $dir "backup.log"

function Log([string]$s) { $s | Out-File -Append -Encoding utf8 $log }
function Newest { (Get-ChildItem $dir -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1).Name }
function Run([string[]]$npmArgs) {
  $ErrorActionPreference = "Continue"  # npm writes notices to stderr
  & npm.cmd @npmArgs 2>&1 | ForEach-Object { "$_" } | Out-File -Append -Encoding utf8 $log
  return $LASTEXITCODE
}

Log "=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
$before = Newest
$code = Run @("run", "db:backup", "--", "--if-older-than", "6")
if ($code -ne 0) { Log "backup failed: exit $code"; exit $code }
if ((Newest) -ne $before) {
  $code = Run @("run", "db:verify-backup")
  if ($code -ne 0) { Log "verify failed: exit $code"; exit $code }
}
