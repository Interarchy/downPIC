param(
  [string]$SettingsPath = (Join-Path $PSScriptRoot '..\..\phase0-capture\runtime\developer-ai-settings.json'),
  [int]$Port = 4175
)

$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($SettingsPath)
if (-not (Test-Path -LiteralPath $target)) {
  throw 'Qwen is not configured. Run configure-qwen.ps1 first.'
}

$settings = Get-Content -Raw -LiteralPath $target | ConvertFrom-Json
if (-not $settings.encryptedApiKey -or -not $settings.baseUrl) {
  throw 'The developer AI settings file is incomplete.'
}

$secureKey = ConvertTo-SecureString ([string]$settings.encryptedApiKey)
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
try {
  $env:DASHSCOPE_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  $env:DASHSCOPE_BASE_URL = [string]$settings.baseUrl
  $env:QWEN_MODEL = if ($settings.model) { [string]$settings.model } else { 'qwen3.7-plus' }

  $projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..\..'))
  $serverPath = Join-Path $projectRoot 'spikes\phase1-analysis\server.mjs'
  Write-Host 'Local asset service is starting in this terminal.' -ForegroundColor Green
  Write-Host 'Keep this terminal open. Press Ctrl+C when you want to stop the service.'
  Write-Host ("Open http://127.0.0.1:$Port/desktop-prototype/")
  Push-Location $projectRoot
  try {
    & node $serverPath "--port=$Port"
  }
  finally {
    Pop-Location
  }
}
finally {
  Remove-Item Env:DASHSCOPE_API_KEY -ErrorAction SilentlyContinue
  Remove-Item Env:DASHSCOPE_BASE_URL -ErrorAction SilentlyContinue
  Remove-Item Env:QWEN_MODEL -ErrorAction SilentlyContinue
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}
