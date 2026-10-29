param(
  [string]$OutputDirectory,
  [switch]$FixedIdentityTest
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
if ($manifest.PSObject.Properties.Name -contains 'key') { throw 'Canonical/store manifest must not include a test identity key.' }
if ($FixedIdentityTest) {
  $testIdentity = Get-Content -LiteralPath (Join-Path $extensionDirectory 'test-fixtures\unified-public-key.json') -Raw | ConvertFrom-Json
  $publicBytes = [Convert]::FromBase64String([string]$testIdentity.publicKey)
  $sha = [System.Security.Cryptography.SHA256]::Create()
  try { $digest = $sha.ComputeHash($publicBytes) } finally { $sha.Dispose() }
  $identity = -join (([BitConverter]::ToString($digest[0..15]).Replace('-', '').ToLowerInvariant()).ToCharArray() | ForEach-Object { [char](97 + [Convert]::ToInt32([string]$_, 16)) })
  if ($identity -ne $testIdentity.extensionId -or $identity -ne 'ikkmbpahejfapgnngdckocmfbcbnjedo') { throw 'Fixed test public key identity mismatch.' }
  $manifest | Add-Member -NotePropertyName 'key' -NotePropertyValue ([string]$testIdentity.publicKey)
  $manifest.version_name = [string]$manifest.version_name + ' (A/B TEST)'
  $manifestText = $manifest | ConvertTo-Json -Depth 20
}
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
  'account-session.mjs',
  'account-session-local.mjs',
  'account-storage.mjs',
  'cloud-account.mjs',
  'cloud-account-ui.mjs',
  'cloud-library-service.mjs',
  'unified-downloads.mjs',
  'cloud-library.html',
  'cloud-library.css',
  'cloud-library.mjs',
  'account-ui-local.mjs',
  'account-ui.mjs',
  'i18n.mjs',
  'privacy.mjs',
  'account-ui.css',
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
$packageName = if ($FixedIdentityTest) { 'archbuddy-unified-test-' } else { 'archbuddy-beta-' }
$archivePath = Join-Path $OutputDirectory ($packageName + $version + '.zip')
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
    $destination = $entry.Open()
    try {
      if ($FixedIdentityTest -and $relativePath -eq 'manifest.json') {
        $bytes = [System.Text.Encoding]::UTF8.GetBytes($manifestText)
        $destination.Write($bytes, 0, $bytes.Length)
      } else {
        $source = [System.IO.File]::OpenRead($sourcePath)
        try { $source.CopyTo($destination) } finally { $source.Dispose() }
      }
    } finally { $destination.Dispose() }
  }
} finally {
  $archive.Dispose()
}
$packageLabel = if ($FixedIdentityTest) { 'Created fixed-ID test package: ' } else { 'Created Chrome Web Store package: ' }
Write-Output ($packageLabel + $archivePath)
