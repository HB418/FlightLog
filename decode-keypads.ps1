$pairs = @(
  @{ txt = 'F:\coding\flightLog-v2\keypad-light-b64.txt'; png = 'F:\coding\flightLog-v2\img\KeypadLightMode.png' },
  @{ txt = 'F:\coding\flightLog-v2\keypad-dark-b64.txt'; png = 'F:\coding\flightLog-v2\img\KeypadDarkMode.png' }
)
foreach ($p in $pairs) {
  $raw = Get-Content $p.txt -Raw
  $b64 = $raw -replace '\s', ''
  $bytes = [System.Convert]::FromBase64String($b64)
  [System.IO.File]::WriteAllBytes($p.png, $bytes)

  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($b64))
  $hashHex = ([System.BitConverter]::ToString($hash) -replace '-','').ToLower()
  Write-Output ($p.png + " -- cleaned b64 length: " + $b64.Length + " -- bytes: " + $bytes.Length + " -- sha256: " + $hashHex)
}
