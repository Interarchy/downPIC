param()
$ErrorActionPreference = 'Stop'
$extensionRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$outputRoot = [System.IO.Path]::GetFullPath((Join-Path $extensionRoot 'dist\local-account'))
if (-not $outputRoot.StartsWith($extensionRoot + [System.IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'Local extension output must remain inside this workspace.'
}
New-Item -ItemType Directory -Path $outputRoot -Force | Out-Null
# 仅复制扩展运行文件及图标，不复制截图、下载、账号数据或开发者配置。
Get-ChildItem -LiteralPath $extensionRoot -File | Where-Object { $_.Extension -in '.mjs', '.js', '.html', '.css' -or $_.Name -eq 'manifest.json' } | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $outputRoot $_.Name) -Force
}
$iconsOutput = Join-Path $outputRoot 'icons'
New-Item -ItemType Directory -Path $iconsOutput -Force | Out-Null
Get-ChildItem -LiteralPath (Join-Path $extensionRoot 'icons') -File | ForEach-Object {
  Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $iconsOutput $_.Name) -Force
}
$runtimePath = Join-Path $outputRoot 'runtime-config.mjs'
$runtimeText = [System.IO.File]::ReadAllText($runtimePath)
$runtimeText = $runtimeText.Replace("export const BACKEND_MODE = 'cloud';", "export const BACKEND_MODE = 'local';")
if ($runtimeText -notmatch "export const BACKEND_MODE = 'local';") { throw 'Local runtime configuration could not be generated.' }
[System.IO.File]::WriteAllText($runtimePath, $runtimeText, [System.Text.UTF8Encoding]::new($false))
$manifestPath = Join-Path $outputRoot 'manifest.json'
$manifest = [System.IO.File]::ReadAllText($manifestPath) | ConvertFrom-Json
$manifest.name = 'ArchBuddy 本地积分演示'
$manifest.version_name = '本地账号与积分预览'
[System.IO.File]::WriteAllText($manifestPath, ($manifest | ConvertTo-Json -Depth 12), [System.Text.UTF8Encoding]::new($false))
Write-Output ('Load unpacked local extension: ' + $outputRoot)
Write-Output 'This copy uses http://127.0.0.1:8080 and has separate browser-local assets from the store extension.'
