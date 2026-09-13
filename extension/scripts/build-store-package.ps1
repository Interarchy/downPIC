param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionDirectory = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory '..'))

if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $extensionDirectory 'dist'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)

$manifestPath = Join-Path $extensionDirectory 'manifest.json'
if (-not (Test-Path -LiteralPath $manifestPath)) {
  throw 'manifest.json was not found.'
}

$manifestText = [System.IO.File]::ReadAllText($manifestPath, [System.Text.Encoding]::UTF8)
$manifest = $manifestText | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+(\.\d+)?$') {
  throw 'manifest version is invalid.'
}

$requiredFiles = @(
  'manifest.json',
  'background.mjs',
  'runtime-config.mjs',
  'shared.mjs',
  'content.js',
  'content.css',
  'popup.html',
  'popup.css',
  'popup.mjs',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.mjs',
  'privacy.html',
  'icons\icon-16.png',
  'icons\icon-32.png',
  'icons\icon-48.png',
  'icons\icon-128.png'
)

foreach ($relativePath in $requiredFiles) {
  $sourcePath = Join-Path $extensionDirectory $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw ('Required package file was not found: ' + $relativePath)
  }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archivePath = Join-Path $OutputDirectory ('downpic-beta-' + $version + '.zip')
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

$stagingDirectory = Join-Path ([System.IO.Path]::GetTempPath()) ('downpic-package-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stagingDirectory | Out-Null

try {
  foreach ($relativePath in $requiredFiles) {
    $sourcePath = Join-Path $extensionDirectory $relativePath
    $targetPath = Join-Path $stagingDirectory $relativePath
    $targetParent = Split-Path -Parent $targetPath
    if (-not (Test-Path -LiteralPath $targetParent)) {
      New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $sourcePath -Destination $targetPath
  }
  Compress-Archive -Path (Join-Path $stagingDirectory '*') -DestinationPath $archivePath -CompressionLevel Optimal
} finally {
  if (Test-Path -LiteralPath $stagingDirectory) {
    $resolvedStaging = [System.IO.Path]::GetFullPath($stagingDirectory)
    $expectedPrefix = [System.IO.Path]::GetFullPath((Join-Path ([System.IO.Path]::GetTempPath()) 'downpic-package-'))
    if ($resolvedStaging.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
    }
  }
}

Write-Output ('Created Chrome Web Store package: ' + $archivePath)
