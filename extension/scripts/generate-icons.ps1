param(
  [string]$OutputDirectory
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($OutputDirectory)) {
  $OutputDirectory = Join-Path $PSScriptRoot '..\icons'
}
$OutputDirectory = [System.IO.Path]::GetFullPath($OutputDirectory)
New-Item -ItemType Directory -Path $OutputDirectory -Force | Out-Null

Add-Type -AssemblyName System.Drawing

foreach ($size in @(16, 32, 48, 128)) {
  $bitmap = New-Object System.Drawing.Bitmap($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $padding = [single]($size * 0.125)
  $markSize = [single]($size - 2 * $padding)
  $radius = [single]($markSize * 0.2)
  $rect = New-Object System.Drawing.RectangleF($padding, $padding, $markSize, $markSize)
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = [single]($radius * 2)
  $path.AddArc($rect.X, $rect.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($rect.Right - $diameter, $rect.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($rect.X, $rect.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()

  $green = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#25634B'))
  $white = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::White)
  $graphics.FillPath($green, $path)

  $fontSize = [single]($markSize * 0.64)
  $font = New-Object System.Drawing.Font('Georgia', $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
  $format = New-Object System.Drawing.StringFormat
  $format.Alignment = [System.Drawing.StringAlignment]::Center
  $format.LineAlignment = [System.Drawing.StringAlignment]::Center
  $textRect = New-Object System.Drawing.RectangleF($rect.X, [single]($rect.Y - $markSize * 0.035), $rect.Width, $rect.Height)
  $graphics.DrawString('d', $font, $white, $textRect, $format)

  $target = Join-Path $OutputDirectory "icon-$size.png"
  $bitmap.Save($target, [System.Drawing.Imaging.ImageFormat]::Png)
  $format.Dispose()
  $font.Dispose()
  $white.Dispose()
  $green.Dispose()
  $path.Dispose()
  $graphics.Dispose()
  $bitmap.Dispose()
}

Write-Output "Generated downPIC icons in $OutputDirectory"
