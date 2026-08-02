$files = @(
  'F:\coding\flightLog-v2\img\KeypadLightMode.png',
  'F:\coding\flightLog-v2\img\KeypadDarkMode.png'
)
foreach ($f in $files) {
  $bytes = [System.IO.File]::ReadAllBytes($f)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = $sha256.ComputeHash($bytes)
  $hashHex = ([System.BitConverter]::ToString($hash) -replace '-','').ToLower()
  Write-Output ($f + " -- bytes: " + $bytes.Length + " -- sha256: " + $hashHex)
}
