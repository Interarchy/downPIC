$ErrorActionPreference = 'Stop'
$spikeRoot = Split-Path -Parent $PSScriptRoot
$source = Join-Path $spikeRoot 'native-host\Program.cs'
$bin = Join-Path $spikeRoot 'native-host\bin'
$output = Join-Path $bin 'SuoyinshiCaptureHost.exe'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'

if (-not (Test-Path -LiteralPath $compiler)) {
  throw "C# compiler not found: $compiler"
}

New-Item -ItemType Directory -Force -Path $bin | Out-Null
& $compiler /nologo /target:exe /out:$output /reference:System.Web.Extensions.dll $source
if ($LASTEXITCODE -ne 0) { throw 'Native host build failed.' }
Write-Output $output
