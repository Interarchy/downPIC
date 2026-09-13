param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$scriptDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$extensionDirectory = [System.IO.Path]::GetFullPath((Join-Path $scriptDirectory '..'))
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $extensionDirectory 'store\assets'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

function New-TextFromCodePoints([int[]]$CodePoints) {
  $builder = New-Object System.Text.StringBuilder
  foreach ($codePoint in $CodePoints) {
    [void]$builder.Append([char]$codePoint)
  }
  return $builder.ToString()
}

$subtitle = New-TextFromCodePoints @(0x53C2,0x8003,0x56FE,0xFF0C,0x4E00,0x952E,0x53D8,0x6210,0x4E2D,0x6587,0x63D0,0x793A,0x8BCD)
$audience = New-TextFromCodePoints @(0x5EFA,0x7B51,0x4E0E,0x8BBE,0x8BA1,0x5E08)

$bitmap = New-Object System.Drawing.Bitmap 440, 280
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

$paper = [System.Drawing.Color]::FromArgb(247,248,247)
$green = [System.Drawing.Color]::FromArgb(37,99,75)
$greenDark = [System.Drawing.Color]::FromArgb(25,74,56)
$mist = [System.Drawing.Color]::FromArgb(232,240,236)
$ink = [System.Drawing.Color]::FromArgb(36,51,45)
$soft = [System.Drawing.Color]::FromArgb(100,113,106)
$line = [System.Drawing.Color]::FromArgb(194,209,201)
$graphics.Clear($paper)

$greenBrush = New-Object System.Drawing.SolidBrush $green
$greenDarkBrush = New-Object System.Drawing.SolidBrush $greenDark
$mistBrush = New-Object System.Drawing.SolidBrush $mist
$inkBrush = New-Object System.Drawing.SolidBrush $ink
$softBrush = New-Object System.Drawing.SolidBrush $soft
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$linePen = New-Object System.Drawing.Pen $line, 2
$greenPen = New-Object System.Drawing.Pen $green, 3

$graphics.FillRectangle($mistBrush, 294, 0, 146, 280)
$graphics.DrawLine($linePen, 294, 0, 294, 280)
$graphics.DrawLine($linePen, 310, 212, 350, 154)
$graphics.DrawLine($linePen, 350, 154, 384, 191)
$graphics.DrawLine($greenPen, 337, 212, 388, 139)
$graphics.DrawLine($greenPen, 388, 139, 426, 183)
$graphics.FillRectangle($greenBrush, 324, 209, 88, 9)
$graphics.FillRectangle($greenDarkBrush, 359, 172, 25, 37)
$graphics.FillRectangle($greenBrush, 386, 187, 39, 22)

$graphics.FillRectangle($greenBrush, 32, 31, 48, 48)
$logoFont = New-Object System.Drawing.Font 'Georgia', 34, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('d', $logoFont, $whiteBrush, 43, 33)

$brandFont = New-Object System.Drawing.Font 'Georgia', 29, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$subtitleFont = New-Object System.Drawing.Font 'Microsoft YaHei UI', 18, ([System.Drawing.FontStyle]::Bold), ([System.Drawing.GraphicsUnit]::Pixel)
$smallFont = New-Object System.Drawing.Font 'Microsoft YaHei UI', 12, ([System.Drawing.FontStyle]::Regular), ([System.Drawing.GraphicsUnit]::Pixel)
$graphics.DrawString('downPIC', $brandFont, $inkBrush, 92, 39)
$graphics.DrawString($subtitle, $subtitleFont, $inkBrush, 32, 113)
$graphics.FillRectangle($mistBrush, 32, 169, 112, 30)
$graphics.DrawString($audience, $smallFont, $greenDarkBrush, 45, 176)
$graphics.DrawString('Save  /  Analyze  /  Reuse', $smallFont, $softBrush, 32, 226)

$outputPath = Join-Path $OutputDirectory 'small-promo-440x280.png'
$bitmap.Save($outputPath, [System.Drawing.Imaging.ImageFormat]::Png)

$logoFont.Dispose()
$brandFont.Dispose()
$subtitleFont.Dispose()
$smallFont.Dispose()
$greenBrush.Dispose()
$greenDarkBrush.Dispose()
$mistBrush.Dispose()
$inkBrush.Dispose()
$softBrush.Dispose()
$whiteBrush.Dispose()
$linePen.Dispose()
$greenPen.Dispose()
$graphics.Dispose()
$bitmap.Dispose()

Write-Output ('Created store asset: ' + $outputPath)
