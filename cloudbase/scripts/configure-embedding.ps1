param([switch]$PromptKey)

$ErrorActionPreference = 'Stop'
# Select the Security module belonging to this PowerShell version.
Import-Module (Join-Path $PSHOME 'Modules/Microsoft.PowerShell.Security/Microsoft.PowerShell.Security.psd1') -ErrorAction Stop
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$settingsPath = Join-Path $projectRoot 'plugin-prototype\runtime\embedding-settings.json'
$probePath = Join-Path $PSScriptRoot 'check-embedding.mjs'
$previousKey = $env:ARCHBUDDY_EMBEDDING_API_KEY
$plainKey = $null
$secureKey = $null

try {
  if (-not $PromptKey -and -not [string]::IsNullOrWhiteSpace($previousKey)) {
    $plainKey = $previousKey.Trim()
  } elseif (-not $PromptKey -and (Test-Path -LiteralPath $settingsPath)) {
    $settings = Get-Content -LiteralPath $settingsPath -Raw | ConvertFrom-Json
    if ($settings.projectId -ne 'archbuddy' -or $settings.stage -ne 'development' -or $settings.provider -ne 'tokenhub') {
      throw 'Unexpected local credential scope.'
    }
    $secureKey = ConvertTo-SecureString $settings.encryptedApiKey
  }

  if ($plainKey -and $plainKey -cnotmatch '^[\x21-\x7e]{16,256}$') {
    Write-Host 'The current key contains invalid characters or has an invalid length. Enter only the API Key.'
    $plainKey = $null
  }
  if (-not $plainKey) {
    if (-not $secureKey) {
      Write-Host 'ArchBuddy TokenHub setup. The Key is hidden and will never be printed.'
      $secureKey = Read-Host 'Paste the TokenHub API Key, then press Enter' -AsSecureString
    }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try { $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer).Trim() }
    finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer) }
  }
  if ($plainKey -cnotmatch '^[\x21-\x7e]{16,256}$') {
    Write-Host 'KEY_FORMAT_INVALID: paste only the complete API Key. No request was sent.'
    exit 1
  }

  $env:ARCHBUDDY_EMBEDDING_API_KEY = $plainKey
  Write-Host 'Checking one synthetic text with the same Node adapter used by ArchBuddy (30 second timeout).'
  & node $probePath
  if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

  $encryptedKey = ConvertFrom-SecureString (ConvertTo-SecureString $plainKey -AsPlainText -Force)
  New-Item -ItemType Directory -Path (Split-Path -Parent $settingsPath) -Force | Out-Null
  [ordered]@{
    schemaVersion = 1
    projectId = 'archbuddy'
    stage = 'development'
    provider = 'tokenhub'
    encryptedApiKey = $encryptedKey
    updatedAt = [DateTime]::UtcNow.ToString('o')
  } | ConvertTo-Json | Set-Content -LiteralPath $settingsPath -Encoding UTF8
  Write-Host 'SAVED: Windows current-user encrypted local configuration. No cloud configuration was changed.'
  Write-Host 'The local ArchBuddy startup script will load it automatically.'
} catch {
  # Never print the exception or command: it could contain a credential.
  Write-Host 'SETUP_FAILED: local configuration could not be read or saved. Retry with -PromptKey.'
  exit 1
} finally {
  $plainKey = $null
  if ($secureKey) { $secureKey.Dispose() }
  $env:ARCHBUDDY_EMBEDDING_API_KEY = $previousKey
}
