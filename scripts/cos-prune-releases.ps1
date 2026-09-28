# Weekly wrapper for cos-prune-releases.py (scheduled task WUJI-Kaiwu-COS-Prune).
# Keeps the newest 2 release versions on COS; logs to ~/.kaiwu-ops/cos-prune.log.
$ErrorActionPreference = 'Continue'
$logDir = Join-Path $env:USERPROFILE '.kaiwu-ops'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'cos-prune.log'
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content -LiteralPath $log
& python (Join-Path $PSScriptRoot 'cos-prune-releases.py') --keep 2 --apply 2>&1 | Add-Content -LiteralPath $log
"exit=$LASTEXITCODE" | Add-Content -LiteralPath $log
exit $LASTEXITCODE
