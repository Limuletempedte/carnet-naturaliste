Add-Type -AssemblyName System.Drawing

$publicDir = Join-Path $PSScriptRoot '..\public'
$srcPath = Join-Path $publicDir 'pwa-512x512.png'

if (-not (Test-Path $srcPath)) {
    Write-Error "Source not found: $srcPath"
    exit 1
}

$src = [System.Drawing.Image]::FromFile((Resolve-Path $srcPath))
Write-Host "Source size: $($src.Width)x$($src.Height)"

function Resize-Png {
    param(
        [System.Drawing.Image]$Source,
        [int]$Size,
        [string]$OutPath
    )
    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
    $g.DrawImage($Source, 0, 0, $Size, $Size)
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Wrote: $OutPath ($Size x $Size)"
}

# pwa-144x144.png
Resize-Png -Source $src -Size 144 -OutPath (Join-Path $publicDir 'pwa-144x144.png')

# pwa-384x384.png
Resize-Png -Source $src -Size 384 -OutPath (Join-Path $publicDir 'pwa-384x384.png')

# apple-touch-icon.png (180x180)
Resize-Png -Source $src -Size 180 -OutPath (Join-Path $publicDir 'apple-touch-icon.png')

# favicon.ico — write as 32x32 PNG with .ico extension. Modern browsers accept this.
# For a real .ico container with multiple sizes, use a dedicated tool. PNG-with-.ico
# extension is supported by Chrome/Firefox/Safari/Edge for >10 years.
Resize-Png -Source $src -Size 32 -OutPath (Join-Path $publicDir 'favicon.ico')

$src.Dispose()
Write-Host "Done."
