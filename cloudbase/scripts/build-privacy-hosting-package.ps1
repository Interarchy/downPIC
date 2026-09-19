param()
$ErrorActionPreference = 'Stop'
$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$source = Join-Path $projectRoot 'cloudbase\hosting\archbuddy\privacy'
$output = Join-Path $projectRoot 'cloudbase\dist\archbuddy-privacy-site.zip'
if (-not (Test-Path -LiteralPath (Join-Path $source 'index.html'))) { throw 'Privacy policy index.html was not found.' }
New-Item -ItemType Directory -Path (Split-Path -Parent $output) -Force | Out-Null
if (Test-Path -LiteralPath $output) { Remove-Item -LiteralPath $output -Force }
Compress-Archive -LiteralPath (Join-Path $source 'index.html') -DestinationPath $output -CompressionLevel Optimal
Write-Output ('Created isolated privacy site package: ' + $output)
Write-Output 'Cloud target path: /archbuddy/privacy/ (do not upload to hosting root)'
