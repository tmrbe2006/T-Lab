# Build a multi-resolution native Windows ICO from the approved T-Lab icon.
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$source = Join-Path $PSScriptRoot 'tlab-new-icon.png'
$target = Join-Path $PSScriptRoot 'tlab-new-icon.ico'
$original = [System.Drawing.Bitmap]::new($source)
try {
  $resolutions = @(16, 32, 48, 64)
  $streams = @()
  foreach ($size in $resolutions) {
    $bmp = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $g.DrawImage($original, 0, 0, $size, $size)
      } finally { $g.Dispose() }
      $ms = [System.IO.MemoryStream]::new()
      $bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
      $streams += ,$ms.ToArray()
      $ms.Dispose()
    } finally { $bmp.Dispose() }
  }
  $output = [System.IO.File]::Create($target)
  try {
    $writer = [System.IO.BinaryWriter]::new($output)
    try {
      $writer.Write([uint16]0) # reserved
      $writer.Write([uint16]1) # icon type
      $writer.Write([uint16]$resolutions.Count)
      $offset = 6 + (16 * $resolutions.Count)
      for ($i = 0; $i -lt $resolutions.Count; $i++) {
        $writer.Write([byte]$resolutions[$i])
        $writer.Write([byte]$resolutions[$i])
        $writer.Write([byte]0)
        $writer.Write([byte]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]32)
        $writer.Write([uint32]$streams[$i].Length)
        $writer.Write([uint32]$offset)
        $offset += $streams[$i].Length
      }
      foreach ($png in $streams) { $writer.Write([byte[]]$png) }
    } finally { $writer.Dispose() }
  } finally { $output.Dispose() }
} finally { $original.Dispose() }
Write-Host "Generated new Windows icon: $target"
