param(
  [string]$SettingsPath,
  [switch]$ApiKeyFromClipboard
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($SettingsPath)) {
  $SettingsPath = Join-Path $PSScriptRoot '..\runtime\developer-ai-settings.json'
}
Write-Host 'downPIC plugin prototype - Developer DeepSeek configuration' -ForegroundColor DarkGreen
Write-Host 'End users do not run this script. The key is encrypted and never written to source code.'

$defaultBaseUrl = 'https://api.deepseek.com/anthropic'
$baseUrl = Read-Host "Enter the DeepSeek Anthropic-compatible base URL (press Enter for $defaultBaseUrl)"
if ([string]::IsNullOrWhiteSpace($baseUrl)) { $baseUrl = $defaultBaseUrl }
$baseUrl = $baseUrl.Trim().TrimEnd('/')
if (-not $baseUrl.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Base URL must start with https://'
}
if (-not $baseUrl.EndsWith('/anthropic', [System.StringComparison]::OrdinalIgnoreCase)) {
  $baseUrl = $baseUrl + '/anthropic'
}

$plainKey = $null
if ($ApiKeyFromClipboard) {
  $plainKey = Get-Clipboard -Raw
  if ([string]::IsNullOrWhiteSpace($plainKey)) {
    throw 'Clipboard is empty. Copy only the DeepSeek API Key, then run this command again.'
  }

  # DeepSeek keys use printable ASCII. Remove whitespace and invisible Unicode
  # artifacts introduced by copying, without ever printing the value.
  $plainKey = $plainKey -replace '[^\u0021-\u007E]', ''
  if (($plainKey.StartsWith('"') -and $plainKey.EndsWith('"')) -or
      ($plainKey.StartsWith("'") -and $plainKey.EndsWith("'"))) {
    $plainKey = $plainKey.Substring(1, $plainKey.Length - 2)
  }
  if ($plainKey.Length -lt 16) {
    throw 'Clipboard does not contain a complete DeepSeek API Key. Copy only the Key and retry.'
  }
  $secureKey = ConvertTo-SecureString $plainKey -AsPlainText -Force
  $plainKey = $null
} else {
  $secureKey = Read-Host 'Enter a newly created or rotated DeepSeek API Key (right-click to paste)' -AsSecureString
  if ($secureKey.Length -lt 16) {
    throw 'API Key was not pasted completely. In Windows PowerShell use right-click to paste, or rerun with -ApiKeyFromClipboard.'
  }
}
$encryptedKey = ConvertFrom-SecureString $secureKey

$target = [System.IO.Path]::GetFullPath($SettingsPath)
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Path $parent -Force | Out-Null
[ordered]@{
  schemaVersion = 1
  provider = 'deepseek'
  model = 'deepseek-flash'
  baseUrl = $baseUrl
  encryptedApiKey = $encryptedKey
  updatedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding UTF8

Write-Host "Saved to $target with Windows current-user encryption." -ForegroundColor Green
Write-Host 'Restart the prototype server, then check GET /api/status reports configured: true.'
