# Local replacement for the GitHub Actions job (Actions is blocked on this
# account's private repos by a billing hold). Run daily by Task Scheduler:
#   1. node backup.mjs writes backups/ (and tells the web app when it last succeeded)
#   2. commit + pull --rebase + push, best effort: if git fails the files are still on disk
# Credentials come from backup.env next to this file (gitignored, never pushed).
# Any failure is written to backup.log and shown as a Windows notification.
# 'Continue': Windows PowerShell 5.1 turns any native stderr line (git progress) into a
# terminating error under 'Stop'; failures are checked through $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'
$here = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $here
$log = Join-Path $here 'backup.log'

function Log($msg) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $msg
  Add-Content -Path $log -Value $line -Encoding UTF8
}
function Notify($msg) {
  try {
    Add-Type -AssemblyName System.Windows.Forms, System.Drawing
    $n = New-Object System.Windows.Forms.NotifyIcon
    $n.Icon = [System.Drawing.SystemIcons]::Warning
    $n.Visible = $true
    $n.ShowBalloonTip(15000, 'WEB_teamSec backup', $msg, [System.Windows.Forms.ToolTipIcon]::Warning)
    Start-Sleep -Seconds 15
    $n.Dispose()
  } catch {}
}

# ---- 1) pull data -> files ----
try {
  $envFile = Join-Path $here 'backup.env'
  if (-not (Test-Path $envFile)) { throw 'backup.env not found' }
  foreach ($l in Get-Content $envFile -Encoding UTF8) {
    if ($l -match '^\s*([A-Z_]+)\s*=\s*(.*)$') {
      [Environment]::SetEnvironmentVariable($Matches[1], $Matches[2].Trim(), 'Process')
    }
  }
  foreach ($k in 'SUPABASE_URL','SUPABASE_ANON_KEY','BACKUP_EMAIL','BACKUP_PASSWORD') {
    if (-not [Environment]::GetEnvironmentVariable($k, 'Process')) { throw "$k is empty in backup.env" }
  }
  $out = & node backup.mjs 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "backup.mjs failed: $out" }
} catch {
  Log ('FAIL ' + $_.Exception.Message)
  Notify ('Backup failed: ' + $_.Exception.Message)
  exit 1
}

# ---- 2) push to the private repo (files are already safe on disk) ----
$gitErr = $null
& git add backups
& git diff --cached --quiet
if ($LASTEXITCODE -ne 0) {
  & git commit --quiet -m ("backup " + (Get-Date -Format 'yyyy-MM-dd') + " (local)")
  $pull = & git pull --quiet --rebase --autostash 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) {
    & git rebase --abort 2>&1 | Out-Null
    $gitErr = "git pull failed: $pull"
  } else {
    $push = & git push --quiet 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { $gitErr = "git push failed: $push" }
  }
}
$summary = ($out -replace '\s+', ' ').Trim()
if ($gitErr) {
  Log ('OK-LOCAL ' + $summary + ' | ' + ($gitErr -replace '\s+', ' ').Trim())
  Notify ('Backup saved on this PC but not pushed to GitHub: ' + $gitErr)
  exit 1
}
Log ('OK ' + $summary)
