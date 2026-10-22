$ErrorActionPreference = 'Stop'

$extensionDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$sourcePath = Join-Path $extensionDirectory 'dist\edge\ArchBuddy-Edge-V4.1-0.6.1-local-test.zip'
$outputPath = Join-Path $extensionDirectory 'dist\edge\ArchBuddy-Edge-V4.1-0.6.1-store-candidate.zip'
$privacyPath = Join-Path $PSScriptRoot 'privacy.html'
$expectedSourceHash = '56D558C6E3CF209C3746808877530EDBC2BDAEE0CBE8EB3AD2A88ED71C453310'

if (-not (Test-Path -LiteralPath $sourcePath)) { throw 'Pinned Edge local-test ZIP is missing.' }
if (-not (Test-Path -LiteralPath $privacyPath)) { throw 'Edge privacy.html is missing.' }
if (Test-Path -LiteralPath $outputPath) { throw 'Edge store candidate already exists; inspect it before replacing it.' }

$actualHash = (Get-FileHash -LiteralPath $sourcePath -Algorithm SHA256).Hash
if ($actualHash -ne $expectedSourceHash) { throw 'Pinned Edge local-test ZIP hash does not match.' }

Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$inputZip = [System.IO.Compression.ZipFile]::OpenRead($sourcePath)
try {
  $entries = @($inputZip.Entries)
  if ($entries.Count -ne 27 -or @($entries | Where-Object { $_.FullName -eq 'privacy.html' }).Count -ne 1) {
    throw 'Unexpected Edge local-test ZIP entries.'
  }
  if (@($entries | Where-Object { $_.FullName -match 'account|credit|payment|(^|/)\.\.' }).Count -gt 0) {
    throw 'Local account or unsafe path found in source ZIP.'
  }

  $outputZip = [System.IO.Compression.ZipFile]::Open($outputPath, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    foreach ($entry in $entries) {
      $targetEntry = $outputZip.CreateEntry($entry.FullName, [System.IO.Compression.CompressionLevel]::Optimal)
      $targetStream = $targetEntry.Open()
      try {
        if ($entry.FullName -eq 'privacy.html') {
          $privacyStream = [System.IO.File]::OpenRead($privacyPath)
          try { $privacyStream.CopyTo($targetStream) }
          finally { $privacyStream.Dispose() }
        } else {
          $sourceStream = $entry.Open()
          try { $sourceStream.CopyTo($targetStream) }
          finally { $sourceStream.Dispose() }
        }
      } finally { $targetStream.Dispose() }
    }
  } finally { $outputZip.Dispose() }
} finally { $inputZip.Dispose() }

Write-Output ('Created Edge store candidate: ' + $outputPath)
