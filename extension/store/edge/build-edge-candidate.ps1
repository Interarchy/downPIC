param([string]$OutputDirectory)
$ErrorActionPreference = 'Stop'
$extensionDirectory = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) { $OutputDirectory = Join-Path $extensionDirectory 'dist\edge' }
# Build from current canonical runtime; never reuse a historical Chrome/Edge ZIP or privacy page.
& (Join-Path $extensionDirectory 'scripts\build-store-package.ps1') -Browser edge -OutputDirectory $OutputDirectory
