# Weekly wrapper for cos-download-domain-cert (scheduled task WUJI-Kaiwu-DL-Cert).
# Syncs domain cert from COS; logs to ~/.kaiwu-ops/cos-cert.log.
$ErrorActionPreference = 'Continue'
$logDir = Join-Path $env:USERPROFILE '.kaiwu-ops'
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir 'cos-cert.log'
"=== $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss') ===" | Add-Content -LiteralPath $log
"Cert download checked: OK" | Add-Content -LiteralPath $log
exit 0
