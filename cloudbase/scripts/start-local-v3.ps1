param()

$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$serverPath = Join-Path $projectRoot 'cloudbase\start.mjs'
$settingsPath = Join-Path $projectRoot 'plugin-prototype\runtime\developer-ai-settings.json'
$runtimeConfigPath = Join-Path $projectRoot 'extension\runtime-config.mjs'

$runtimeConfig = [System.IO.File]::ReadAllText($runtimeConfigPath, [System.Text.Encoding]::UTF8)
if ($runtimeConfig -notmatch 'export\s+const\s+BACKEND_MODE\s*=\s*[''"]local[''"]') {
  throw 'Local V3 development requires BACKEND_MODE=local in extension/runtime-config.mjs.'
}

if ([string]::IsNullOrWhiteSpace($env:DEEPSEEK_API_KEY) -and -not (Test-Path -LiteralPath $settingsPath)) {
  throw 'No local DeepSeek credential is available. Run plugin-prototype/scripts/configure-deepseek.ps1 first.'
}

$existingListener = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($existingListener) {
  throw 'Port 8080 is already in use. Stop the existing process before starting ArchBuddy.'
}

$previousMode = $env:ARCHBUDDY_QUOTA_MODE
$previousSecret = $env:ARCHBUDDY_SESSION_SECRET
$previousPort = $env:PORT
$previousAnalytics = $env:ARCHBUDDY_ANALYTICS_ENABLED
$previousConcurrent = $env:ARCHBUDDY_MAX_CONCURRENT

$bytes = New-Object byte[] 48
$generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
try {
  $generator.GetBytes($bytes)
  $env:ARCHBUDDY_SESSION_SECRET = [Convert]::ToBase64String($bytes)
} finally {
  $generator.Dispose()
}
$env:ARCHBUDDY_QUOTA_MODE = 'process-test'
$env:ARCHBUDDY_ANALYTICS_ENABLED = 'false'
$env:ARCHBUDDY_MAX_CONCURRENT = '3'
$env:PORT = '8080'

Write-Host 'ArchBuddy V3 local service is starting at http://127.0.0.1:8080'
Write-Host 'Keep this process running while testing. Press Ctrl+C to stop it.'

try {
  & node $serverPath
  exit $LASTEXITCODE
} finally {
  $env:ARCHBUDDY_QUOTA_MODE = $previousMode
  $env:ARCHBUDDY_SESSION_SECRET = $previousSecret
  $env:PORT = $previousPort
  $env:ARCHBUDDY_ANALYTICS_ENABLED = $previousAnalytics
  $env:ARCHBUDDY_MAX_CONCURRENT = $previousConcurrent
}
