param()
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$buildRoot = Join-Path $projectRoot 'cloudbase\dist'
New-Item -ItemType Directory -Path $buildRoot -Force | Out-Null
$target = Join-Path $buildRoot ('archbuddy-api-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
New-Item -ItemType Directory -Path $target | Out-Null
$files = @(
  'cloudbase/server.mjs', 'cloudbase/start.mjs',
  'cloudbase/quota.mjs', 'cloudbase/cloudbase-store.mjs', 'cloudbase/session.mjs', 'cloudbase/package.json', 'cloudbase/package-lock.json',
  'plugin-prototype/vision-analyzer.mjs', 'plugin-prototype/developer-settings.mjs',
  'plugin-prototype/analysis-contract.mjs', 'plugin-prototype/prompt-model.mjs',
  'plugin-prototype/analysis-instructions.md', 'plugin-prototype/analysis-instructions-v2.md',
  'plugin-prototype/evaluation-instructions-v3.md'
)
foreach ($file in $files) {
  $destination = Join-Path $target $file
  New-Item -ItemType Directory -Path (Split-Path -Parent $destination) -Force | Out-Null
  Copy-Item -LiteralPath (Join-Path $projectRoot $file) -Destination $destination
}
Copy-Item -LiteralPath (Join-Path $projectRoot 'cloudbase\Dockerfile') -Destination (Join-Path $target 'Dockerfile')
# Windows PowerShell Compress-Archive can write backslashes into ZIP entry names.
# CloudBase extracts on Linux: use explicit portable '/' entry names instead.
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archivePath = $target + '.zip'
$archive = [System.IO.Compression.ZipFile]::Open($archivePath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($relativePath in (@('Dockerfile') + $files)) {
    $entryName = $relativePath.Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
      $archive,
      (Join-Path $target $relativePath),
      $entryName,
      [System.IO.Compression.CompressionLevel]::Optimal
    ) | Out-Null
  }
} finally {
  $archive.Dispose()
}

# Validate the actual deliverable, not only the staging folder.
$archive = [System.IO.Compression.ZipFile]::OpenRead($archivePath)
try {
  $expected = @('Dockerfile') + $files
  if ($archive.Entries.Count -ne $expected.Count) { throw 'Unexpected deployment ZIP contents.' }
  foreach ($relativePath in $expected) {
    $entry = $archive.GetEntry($relativePath.Replace('\', '/'))
    if ($null -eq $entry -or $entry.FullName.Contains('\')) {
      throw ('Missing or non-portable ZIP entry: ' + $relativePath)
    }
    $stream = $entry.Open()
    $hash = [System.Security.Cryptography.SHA256]::Create()
    try {
      $actualHash = [System.BitConverter]::ToString($hash.ComputeHash($stream)).Replace('-', '')
      $expectedHash = (Get-FileHash -LiteralPath (Join-Path $target $relativePath) -Algorithm SHA256).Hash
      if ($actualHash -ne $expectedHash) { throw ('ZIP content mismatch: ' + $relativePath) }
    } finally {
      $hash.Dispose()
      $stream.Dispose()
    }
  }
} finally {
  $archive.Dispose()
}
Write-Output 'Verified: portable ZIP paths, root Dockerfile, and matching file hashes.'
Write-Output ('Upload folder: ' + $target)
Write-Output ('Transfer ZIP: ' + $archivePath)
