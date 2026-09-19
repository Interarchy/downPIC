param([string]$OutputDirectory)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $PSScriptRoot '..\icons'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null
Add-Type -AssemblyName System.Drawing

# Vector geometry matches icons/logo.svg. Render at 4x for crisp small icons.
foreach ($size in @(16, 32, 48, 128)) {
  $renderSize = $size * 4
  $canvas = New-Object System.Drawing.Bitmap($renderSize, $renderSize)
  $graphics = [System.Drawing.Graphics]::FromImage($canvas)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::Transparent)
  $graphics.ScaleTransform([single]($renderSize / 128), [single]($renderSize / 128))
  $background = New-Object System.Drawing.Drawing2D.GraphicsPath
  $background.AddArc(8, 8, 48, 48, 180, 90)
  $background.AddArc(72, 8, 48, 48, 270, 90)
  $background.AddArc(72, 72, 48, 48, 0, 90)
  $background.AddArc(8, 72, 48, 48, 90, 90)
  $background.CloseFigure()
  $green = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#25634B'))
  $graphics.FillPath($green, $background)

  $letter = New-Object System.Drawing.Drawing2D.GraphicsPath
  $letter.FillMode = [System.Drawing.Drawing2D.FillMode]::Alternate
  $letter.AddPolygon([System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new(30,96), [System.Drawing.PointF]::new(55,32),
    [System.Drawing.PointF]::new(73,32), [System.Drawing.PointF]::new(98,96),
    [System.Drawing.PointF]::new(80,96), [System.Drawing.PointF]::new(74,80),
    [System.Drawing.PointF]::new(54,80), [System.Drawing.PointF]::new(48,96)
  ))
  $letter.StartFigure()
  $letter.AddLine(56,66,72,66)
  $letter.AddLine(72,66,72,62)
  $letter.AddArc(56,54,16,16,0,-180)
  $letter.CloseFigure()
  $graphics.FillPath([System.Drawing.Brushes]::White, $letter)

  $bitmap = New-Object System.Drawing.Bitmap($size, $size)
  $outputGraphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $outputGraphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $outputGraphics.DrawImage($canvas, 0, 0, $size, $size)
  $bitmap.Save((Join-Path $OutputDirectory "icon-$size.png"), [System.Drawing.Imaging.ImageFormat]::Png)
  $outputGraphics.Dispose()
  $bitmap.Dispose()
  $letter.Dispose()
  $green.Dispose()
  $background.Dispose()
  $graphics.Dispose()
  $canvas.Dispose()
}
Write-Output "Generated ArchBuddy icons in $OutputDirectory"
