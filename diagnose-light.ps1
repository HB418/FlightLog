$raw = Get-Content 'F:\coding\flightLog-v2\keypad-light-b64.txt' -Raw
$clean = $raw -replace '\s', ''
Write-Output ("Clean length: " + $clean.Length)
$badChars = [regex]::Matches($clean, '[^A-Za-z0-9+/=]')
Write-Output ("Non-base64 chars found: " + $badChars.Count)
foreach ($m in $badChars) {
  Write-Output ("  At index " + $m.Index + ": [" + $m.Value + "] (code " + [int][char]$m.Value + ")")
}
# Also check for '=' padding not at the end
$eqIndex = $clean.IndexOf('=')
Write-Output ("First '=' at index: " + $eqIndex + " (string length " + $clean.Length + ")")
