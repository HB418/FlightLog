Add-Type -AssemblyName System.Drawing

function Get-ContentBounds($bmp) {
  $minX = $bmp.Width
  $minY = $bmp.Height
  $maxX = 0
  $maxY = 0
  for ($y = 0; $y -lt $bmp.Height; $y++) {
    for ($x = 0; $x -lt $bmp.Width; $x++) {
      $a = $bmp.GetPixel($x, $y).A
      if ($a -gt 10) {
        if ($x -lt $minX) { $minX = $x }
        if ($x -gt $maxX) { $maxX = $x }
        if ($y -lt $minY) { $minY = $y }
        if ($y -gt $maxY) { $maxY = $y }
      }
    }
  }
  return @{ X = $minX; Y = $minY; W = ($maxX - $minX + 1); H = ($maxY - $minY + 1) }
}

$names = @('2ndTeeActive', '2ndTeeInActive', 'BasketBlue')
foreach ($name in $names) {
  $srcPath = "F:\coding\flightLog-v2\img\$name.png"
  $origPath = "F:\coding\flightLog-v2\img\${name}1.png"

  Copy-Item $srcPath $origPath -Force

  $bmp = [System.Drawing.Bitmap]::FromFile($srcPath)
  $bounds = Get-ContentBounds $bmp
  $rect = New-Object System.Drawing.Rectangle($bounds.X, $bounds.Y, $bounds.W, $bounds.H)
  $cropped = New-Object System.Drawing.Bitmap($bounds.W, $bounds.H)
  $g = [System.Drawing.Graphics]::FromImage($cropped)
  $g.DrawImage($bmp, (New-Object System.Drawing.Rectangle(0, 0, $bounds.W, $bounds.H)), $rect, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose()
  $bmp.Dispose()

  $cropped.Save($srcPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $cropped.Dispose()

  Write-Output ("$name cropped to " + $bounds.W + "x" + $bounds.H + " (original saved as ${name}1.png)")
}
