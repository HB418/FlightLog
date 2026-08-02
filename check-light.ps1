$raw = Get-Content 'F:\coding\flightLog-v2\keypad-light-b64.txt' -Raw
$clean = $raw -replace '\s', ''
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($clean))
$hashHex = ([System.BitConverter]::ToString($hash) -replace '-','').ToLower()
Write-Output ("Length: " + $clean.Length + "  SHA256: " + $hashHex)
