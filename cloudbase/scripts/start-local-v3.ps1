param()

$ErrorActionPreference = 'Stop'
# Select the Security module belonging to this PowerShell version.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
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
$previousMaxCalls = $env:ARCHBUDDY_MAX_CALLS_PER_PROCESS
$previousEmbeddingKey = $env:ARCHBUDDY_EMBEDDING_API_KEY
$embeddingSettingsPath = Join-Path $projectRoot 'plugin-prototype/runtime/embedding-settings.json'
if ([string]::IsNullOrWhiteSpace($env:ARCHBUDDY_EMBEDDING_API_KEY) -and (Test-Path -LiteralPath $embeddingSettingsPath)) {
  $embeddingSettings = Get-Content -LiteralPath $embeddingSettingsPath -Raw | ConvertFrom-Json
  if ($embeddingSettings.projectId -ne 'archbuddy' -or $embeddingSettings.stage -ne 'development') {
    throw 'Embedding configuration does not belong to ArchBuddy development.'
  }
  $embeddingSecureKey = ConvertTo-SecureString $embeddingSettings.encryptedApiKey
  $embeddingPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($embeddingSecureKey)
  try { $env:ARCHBUDDY_EMBEDDING_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($embeddingPointer) }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($embeddingPointer)
    $embeddingSecureKey.Dispose()
  }
}

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
$env:ARCHBUDDY_MAX_CONCURRENT = '6'
$env:ARCHBUDDY_MAX_CALLS_PER_PROCESS = '300'
$env:ARCHBUDDY_CALLS_PER_MINUTE = '20'
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
  $env:ARCHBUDDY_MAX_CALLS_PER_PROCESS = $previousMaxCalls
  $env:ARCHBUDDY_EMBEDDING_API_KEY = $previousEmbeddingKey
}
