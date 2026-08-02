$path = 'F:\coding\flightLog-v2\js\stock-courses.js'
$content = Get-Content $path -Raw
$pattern = 'logo: "data:image/png;base64,[A-Za-z0-9+/=]*",'
$replacement = 'logo: OLD_TOWN_HALL_LOGO,'
$newContent = [regex]::Replace($content, $pattern, $replacement)

$success = $false
for ($i = 0; $i -lt 8; $i++) {
  try {
    [System.IO.File]::WriteAllText($path, $newContent)
    $success = $true
    break
  } catch {
    Start-Sleep -Milliseconds 800
  }
}
if ($success) {
  Write-Output "Write succeeded"
} else {
  Write-Output "Write FAILED after retries - file likely still locked by another program (e.g. an editor open on it)"
}
