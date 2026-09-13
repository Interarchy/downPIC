param(
  [string]$SettingsPath,
  [switch]$ApiKeyFromClipboard,
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$ServerArguments
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SettingsPath)) {
  $SettingsPath = Join-Path $PSScriptRoot '..\runtime\developer-ai-settings.json'
}
$servePath = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\serve.mjs'))
$target = [System.IO.Path]::GetFullPath($SettingsPath)

if (-not (Test-Path -LiteralPath $target)) {
  throw "DeepSeek settings were not found at $target. Run configure-deepseek.ps1 first."
}

$settings = Get-Content -LiteralPath $target -Raw | ConvertFrom-Json
if ($settings.provider -ne 'deepseek' -or -not $settings.encryptedApiKey) {
  throw 'DeepSeek settings are incomplete. Run configure-deepseek.ps1 again.'
}

function Read-CleanApiKeyFromClipboard {
  Write-Host 'Copy only the DeepSeek API Key from the console, then return here.' -ForegroundColor Yellow
  Read-Host 'Press Enter after the Key is in the clipboard' | Out-Null
  $clipboardKey = Get-Clipboard -Raw
  if ([string]::IsNullOrWhiteSpace($clipboardKey)) {
    throw 'Clipboard is empty. Copy only the DeepSeek API Key and retry.'
  }
  $clipboardKey = $clipboardKey -replace '[^\u0021-\u007E]', ''
  if (($clipboardKey.StartsWith('"') -and $clipboardKey.EndsWith('"')) -or
      ($clipboardKey.StartsWith("'") -and $clipboardKey.EndsWith("'"))) {
    $clipboardKey = $clipboardKey.Substring(1, $clipboardKey.Length - 2)
  }
  if ($clipboardKey.Length -lt 16) {
    throw 'Clipboard does not contain a complete DeepSeek API Key.'
  }
  return $clipboardKey
}

# Resolve the credential in this user-started PowerShell process and pass it to Node.
# This PowerShell process is temporary, so its environment disappears when Node exits.
if ($ApiKeyFromClipboard) {
  $resolvedApiKey = Read-CleanApiKeyFromClipboard
} else {
  try {
    $secureKey = ConvertTo-SecureString $settings.encryptedApiKey -ErrorAction Stop
    if ($null -eq $secureKey) { throw 'Windows returned an empty SecureString.' }
    $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    $resolvedApiKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  } catch {
    Write-Warning 'Windows DPAPI could not decrypt this saved credential. Falling back to a clipboard-only session; the Key will not be written to disk.'
    $resolvedApiKey = Read-CleanApiKeyFromClipboard
  }
}

$env:DEEPSEEK_API_KEY = $resolvedApiKey
$resolvedApiKey = $null
if ($settings.baseUrl) { $env:DEEPSEEK_BASE_URL = $settings.baseUrl }
else { $env:DEEPSEEK_BASE_URL = 'https://api.deepseek.com/anthropic' }
if ($settings.model) { $env:DEEPSEEK_MODEL = $settings.model }
else { $env:DEEPSEEK_MODEL = 'deepseek-flash' }

& node $servePath @ServerArguments
exit $LASTEXITCODE
