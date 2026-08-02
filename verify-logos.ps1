$content = Get-Content 'F:\coding\flightLog-v2\js\old-town-hall-logo.js' -Raw
$matches = [regex]::Matches($content, 'base64,([A-Za-z0-9+/=]+)')
foreach ($m in $matches) {
  $b64 = $m.Groups[1].Value
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($b64)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  $hash = $sha256.ComputeHash($bytes)
  $hashHex = [System.BitConverter]::ToString($hash) -replace '-',''
  Write-Output ("Length: " + $b64.Length + "  SHA256: " + $hashHex.ToLower())
}
