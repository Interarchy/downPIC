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

$runtimeConfigPath = Join-Path $extensionDirectory 'runtime-config.mjs'
$runtimeConfigText = [System.IO.File]::ReadAllText($runtimeConfigPath, [System.Text.Encoding]::UTF8)
if ($runtimeConfigText -notmatch 'export\s+const\s+BACKEND_MODE\s*=\s*[''"]cloud[''"]') {
  throw 'Chrome Web Store packages require BACKEND_MODE=cloud.'
}

$requiredFiles = @(
  'manifest.json',
  'background.mjs',
  'runtime-config.mjs',
  'shared.mjs',
  'source-image-store.mjs',
  'content.js',
  'content.css',
  'popup.html',
  'popup.css',
  'popup.mjs',
  'sidepanel.html',
  'sidepanel.css',
  'sidepanel.mjs',
  'library.html',
  'library.css',
  'library.mjs',
  'library-search.mjs',
  'library-vector-index.mjs',
  'folder-import.mjs',
  'privacy.html',
  'icons\icon-16.png',
  'icons\icon-32.png',
  'icons\icon-48.png',
  'icons\icon-128.png',
  'icons\logo.svg',
  'icons\gemini.png',
  'icons\chatgpt.svg'
)

foreach ($relativePath in $requiredFiles) {
  $sourcePath = Join-Path $extensionDirectory $relativePath
  if (-not (Test-Path -LiteralPath $sourcePath)) {
    throw ('Required package file was not found: ' + $relativePath)
  }
}

New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
$archivePath = Join-Path $OutputDirectory ('archbuddy-beta-' + $version + '.zip')
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

# ZipArchive uses forward slashes so icons resolve on every platform and in Chrome Web Store.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in $requiredFiles) {
    $sourcePath = Join-Path $extensionDirectory $relativePath
    $entryName = $relativePath.Replace('\', '/')
    $entry = $archive.CreateEntry($entryName, [System.IO.Compression.CompressionLevel]::Optimal)
    $source = [System.IO.File]::OpenRead($sourcePath)
    $destination = $entry.Open()
    try { $source.CopyTo($destination) }
    finally {
      $destination.Dispose()
      $source.Dispose()
    }
  }
} finally {
  $archive.Dispose()
}
Write-Output ('Created Chrome Web Store package: ' + $archivePath)
