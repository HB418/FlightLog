$raw = Get-Content 'F:\coding\flightLog-v2\keypad-dark-b64.txt' -Raw
$clean = $raw -replace '\s', ''
$bytes = [System.Convert]::FromBase64String($clean)
[System.IO.File]::WriteAllBytes('F:\coding\flightLog-v2\img\KeypadDarkMode.png', $bytes)

$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = ([System.BitConverter]::ToString($sha256.ComputeHash($bytes)) -replace '-','').ToLower()
Write-Output ("Decoded bytes: " + $bytes.Length + "  PNG SHA256: " + $hash)
