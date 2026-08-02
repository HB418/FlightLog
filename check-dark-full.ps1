$raw = Get-Content 'F:\coding\flightLog-v2\keypad-dark-b64.txt' -Raw
$clean = $raw -replace '\s', ''
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash = ([System.BitConverter]::ToString($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($clean))) -replace '-','').ToLower()
Write-Output ("Length: " + $clean.Length + "  SHA256: " + $hash)
