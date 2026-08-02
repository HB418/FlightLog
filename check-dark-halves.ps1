$raw = Get-Content 'F:\coding\flightLog-v2\keypad-dark-b64.txt' -Raw
$clean = $raw -replace '\s', ''
Write-Output ("Total length: " + $clean.Length)
$half = 3298
$h1 = $clean.Substring(0, $half)
$h2 = $clean.Substring($half)
$sha256 = [System.Security.Cryptography.SHA256]::Create()
$hash1 = ([System.BitConverter]::ToString($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($h1))) -replace '-','').ToLower()
$hash2 = ([System.BitConverter]::ToString($sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($h2))) -replace '-','').ToLower()
Write-Output ("h1 len: " + $h1.Length + " sha256: " + $hash1)
Write-Output ("h2 len: " + $h2.Length + " sha256: " + $hash2)
