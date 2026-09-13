param(
  [string]$SettingsPath = (Join-Path $PSScriptRoot '..\..\phase0-capture\runtime\developer-ai-settings.json')
)

$ErrorActionPreference = 'Stop'
Write-Host 'Archive Index - Developer Qwen configuration' -ForegroundColor DarkGreen
Write-Host 'End users do not run this script. The key is hidden and is not written to source code.'

$apiHost = Read-Host 'Enter the API Host shown in Bailian (must start with https://)'
$apiHost = $apiHost.Trim().TrimEnd('/')
if (-not $apiHost.StartsWith('https://', [System.StringComparison]::OrdinalIgnoreCase)) {
  throw 'API Host must start with https://'
}
if (-not $apiHost.EndsWith('/compatible-mode/v1', [System.StringComparison]::OrdinalIgnoreCase)) {
  $apiHost = $apiHost + '/compatible-mode/v1'
}

$secureKey = Read-Host 'Enter a newly created or rotated Bailian API Key' -AsSecureString
if ($secureKey.Length -lt 16) { throw 'API Key length is invalid' }
$encryptedKey = ConvertFrom-SecureString $secureKey

$target = [System.IO.Path]::GetFullPath($SettingsPath)
$parent = Split-Path -Parent $target
New-Item -ItemType Directory -Path $parent -Force | Out-Null
[ordered]@{
  schemaVersion = 1
  provider = 'qwen'
  model = 'qwen3.7-plus'
  baseUrl = $apiHost
  encryptedApiKey = $encryptedKey
  updatedAt = [DateTime]::UtcNow.ToString('o')
} | ConvertTo-Json | Set-Content -LiteralPath $target -Encoding UTF8

Write-Host 'Configuration saved with Windows current-user encryption.' -ForegroundColor Green
Write-Host 'Restart the local asset service, then test one image from the Unparsed page.'
