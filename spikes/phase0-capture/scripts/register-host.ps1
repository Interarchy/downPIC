param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern('^[a-p]{32}$')]
  [string]$ExtensionId
)

$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$templatePath = Join-Path $spikeRoot 'native-host\host-manifest.template.json'
$hostPath = (Resolve-Path -LiteralPath (Join-Path $spikeRoot 'native-host\bin\SuoyinshiCaptureHost.exe')).Path
$manifestPath = Join-Path $spikeRoot 'native-host\com.suoyinshi.capture.json'
$allowedOrigins = '"chrome-extension://' + $ExtensionId + '/"'
$manifest = (Get-Content -Raw -Encoding utf8 $templatePath).Replace('__HOST_EXE_PATH__', $hostPath.Replace('\', '\\')).Replace('"__ALLOWED_ORIGINS__"', $allowedOrigins)
[System.IO.File]::WriteAllText($manifestPath, $manifest, (New-Object System.Text.UTF8Encoding($false)))

$chromeKey = 'HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.suoyinshi.capture'
New-Item -Path $chromeKey -Force | Out-Null
Set-Item -Path $chromeKey -Value $manifestPath

Write-Output "Registered for Chrome: $manifestPath"
