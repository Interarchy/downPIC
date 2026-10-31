param([switch]$SkipPrepareExtension)

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$serverPath = Join-Path $projectRoot 'cloudbase\start.mjs'
$preparePath = Join-Path $projectRoot 'extension\scripts\prepare-local-account.ps1'
if (Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue) {
  throw 'Port 8080 is in use. Stop the existing local service before starting the account demo.'
}
if (-not $SkipPrepareExtension) { & $preparePath }
$names = @('NODE_ENV', 'ARCHBUDDY_ACCOUNT_MODE', 'ARCHBUDDY_LOCAL_MOCK_AI', 'ARCHBUDDY_QUOTA_MODE', 'ARCHBUDDY_ANALYTICS_ENABLED', 'ARCHBUDDY_MAX_CONCURRENT', 'ARCHBUDDY_CALLS_PER_MINUTE', 'PORT')
$previous = @{}
foreach ($name in $names) { $previous[$name] = [Environment]::GetEnvironmentVariable($name, 'Process') }
try {
  $env:NODE_ENV = 'development'
  $env:ARCHBUDDY_ACCOUNT_MODE = 'local-demo'
  $env:ARCHBUDDY_LOCAL_MOCK_AI = 'true'
  $env:ARCHBUDDY_QUOTA_MODE = 'process-test'
  $env:ARCHBUDDY_ANALYTICS_ENABLED = 'false'
  $env:ARCHBUDDY_MAX_CONCURRENT = '6'
  $env:ARCHBUDDY_CALLS_PER_MINUTE = '20'
  $env:PORT = '8080'
  Write-Host 'LOCAL DEMO: generated OTP is shown in the login page. AI results are mock examples; no SMS, model billing or payment occurs.'
  Write-Host 'Local 50/500 counters simulate protection. Connecting real models requires a separate shared-budget decision.'
  Write-Host 'Load unpacked extension: extension/dist/local-account'
  Write-Host 'ArchBuddy account service: http://127.0.0.1:8080. Keep this terminal open. Ctrl+C stops the server.'
  & node $serverPath
  $serviceExitCode = $LASTEXITCODE
} finally {
  foreach ($name in $names) { [Environment]::SetEnvironmentVariable($name, $previous[$name], 'Process') }
}
exit $serviceExitCode
