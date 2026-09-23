# Local replacement for the GitHub Actions job (Actions is blocked on this
# account's private repos by a billing hold). Run daily by Task Scheduler:
#   pulls the team data with backup.mjs, commits backups/ and pushes.
# Credentials come from backup.env next to this file (gitignored, never pushed).
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

  # keep in sync with the remote first so a push never gets rejected
  $pull = & git pull --quiet --rebase 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "git pull failed: $pull" }

  $out = & node backup.mjs 2>&1 | Out-String
  if ($LASTEXITCODE -ne 0) { throw "backup.mjs failed: $out" }

  & git add backups
  & git diff --cached --quiet
  if ($LASTEXITCODE -ne 0) {
    & git commit --quiet -m ("backup " + (Get-Date -Format 'yyyy-MM-dd') + " (local)")
    $push = & git push --quiet 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "git push failed: $push" }
  }
  Log ('OK ' + ($out -replace '\s+', ' ').Trim())
} catch {
  Log ('FAIL ' + $_.Exception.Message)
  exit 1
}
