param(
  [string]$SettingsPath = (Join-Path $PSScriptRoot '..\runtime\developer-ai-settings.json')
)

$ErrorActionPreference = 'Stop'
Write-Host 'downPIC plugin prototype - Developer DeepSeek configuration' -ForegroundColor DarkGreen
Write-Host 'End users do not run this script. The key is encrypted and never written to source code.'

$baseUrl = Read-Host 'Enter the DeepSeek Anthropic-compatible base URL (must start with https://)'
$baseUrl = $baseUrl.Trim().TrimEnd('/')
if (-not $baseUrl.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'Base URL must start with https://'
}
if (-not $baseUrl.EndsWith('/anthropic', [System.StringComparison]::OrdinalIgnoreCase)) {
  $baseUrl = $baseUrl + '/anthropic'
}

$secureKey = Read-Host 'Enter a newly created or rotated DeepSeek API Key' -AsSecureString
if ($secureKey.Length -lt 16) { throw 'API Key length is invalid' }
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
