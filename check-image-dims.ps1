Add-Type -AssemblyName System.Drawing
Get-ChildItem 'F:\coding\flightLog-v2\img' -Filter '*.png' | ForEach-Object {
  try {
    $img = [System.Drawing.Image]::FromFile($_.FullName)
    Write-Output ($_.Name + ': ' + $img.Width + 'x' + $img.Height + ' (' + $_.Length + ' bytes)')
    $img.Dispose()
  } catch {}
}
