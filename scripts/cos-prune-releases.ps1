# Weekly wrapper for cos-prune-releases.py (scheduled task WUJI-Kaiwu-COS-Prune).
# Structured exit code and preflight contract (P1c9946cc-c3).
# Keeps the newest 2 release versions on COS; logs to ~/.kaiwu-ops/cos-prune.log.
# Receipts written to ~/.kaiwu-ops/cos-prune-receipt.json.
# Exit codes: 0=Success, 10=PathNotFound, 11=DependencyMissing, 12=CredentialInvalid, 13=NetworkUnreachable, 1=GenericError

[CmdletBinding()]
param(
    [switch]$PreflightOnly,
    [int]$Keep = 2,
    [switch]$Apply = $true
)

$ErrorActionPreference = 'Stop'

$logDir = Join-Path $env:USERPROFILE '.kaiwu-ops'
if (-not (Test-Path -LiteralPath $logDir)) {
    New-Item -ItemType Directory -Force -Path $logDir | Out-Null
}
$log = Join-Path $logDir 'cos-prune.log'
$receiptPath = Join-Path $logDir 'cos-prune-receipt.json'

function Write-ReceiptFallback {
    param(
        [int]$Code,
        [string]$Category,
        [string]$Message
    )
    $isoDate = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $jsonObj = [ordered]@{
        timestamp = $isoDate
        task = "WUJI-Kaiwu-COS-Prune"
        mode = if ($PreflightOnly) { "PREFLIGHT" } else { "APPLY" }
        exit_code = $Code
        status = if ($Code -eq 0) { "success" } else { "failure" }
        error_category = $Category
        error_message = $Message
        preflight = [ordered]@{
            ok = ($Code -eq 0)
        }
    }
    $jsonStr = $jsonObj | ConvertTo-Json -Depth 5
    $tmpReceipt = "$receiptPath.tmp"
    Set-Content -LiteralPath $tmpReceipt -Value $jsonStr -Encoding UTF8
    Move-Item -LiteralPath $tmpReceipt -Destination $receiptPath -Force
}

$nowStr = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
"=== $nowStr ===" | Add-Content -LiteralPath $log

# Preflight check 1: Python entrypoint script exists
$pyScript = Join-Path $PSScriptRoot 'cos-prune-releases.py'
if (-not (Test-Path -LiteralPath $pyScript)) {
    $errMsg = "Preflight failed: entrypoint python script not found: $pyScript"
    "[PREFLIGHT-FAIL] code=10 category=path_not_found message=$errMsg" | Add-Content -LiteralPath $log
    Write-ReceiptFallback -Code 10 -Category "path_not_found" -Message $errMsg
    exit 10
}

# Preflight check 2: Python runtime probe
$pyCmd = Get-Command python -ErrorAction Ignore
if (-not $pyCmd) {
    $errMsg = "Preflight failed: python executable not found in PATH"
    "[PREFLIGHT-FAIL] code=11 category=dependency_missing message=$errMsg" | Add-Content -LiteralPath $log
    Write-ReceiptFallback -Code 11 -Category "dependency_missing" -Message $errMsg
    exit 11
}

# Preflight check 3: Credential file probe
$envCandidate = 'D:\Projects\qianyuan-wuji\secrets\kaiwu-server\cos.env'
if (-not (Test-Path -LiteralPath $envCandidate)) {
    $errMsg = "Preflight failed: cos.env credential file not found: $envCandidate"
    "[PREFLIGHT-FAIL] code=10 category=path_not_found message=$errMsg" | Add-Content -LiteralPath $log
    Write-ReceiptFallback -Code 10 -Category "path_not_found" -Message $errMsg
    exit 10
}

# Build arguments
$pyArgs = @($pyScript)
if ($PreflightOnly) {
    $pyArgs += '--preflight-only'
} else {
    $pyArgs += @('--keep', $Keep)
    if ($Apply) {
        $pyArgs += '--apply'
    }
}

$ErrorActionPreference = 'Continue'
& python @pyArgs 2>&1 | Add-Content -LiteralPath $log
$pyExit = $LASTEXITCODE

$category = switch ($pyExit) {
    0  { "SUCCESS" }
    10 { "ERR_PATH_NOT_FOUND" }
    11 { "ERR_DEPENDENCY_MISSING" }
    12 { "ERR_CREDENTIAL_INVALID" }
    13 { "ERR_NETWORK_UNREACHABLE" }
    default { "ERR_EXECUTION_FAILURE" }
}

"exit=$pyExit outcome=$category" | Add-Content -LiteralPath $log
exit $pyExit
