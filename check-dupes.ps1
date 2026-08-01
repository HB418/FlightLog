$files = 'stock-courses.js','ratings.js','map-icons.js','course-wizard.js','admin-panel.js','round.js','putt-practice.js','main.js','namePrompt.js'
$all = @()
foreach ($f in $files) {
  $path = "F:\coding\flightLog-v2\js\$f"
  $matches = Select-String -Path $path -Pattern '^(let|const)\s+(\w+)'
  foreach ($m in $matches) {
    $name = $m.Matches[0].Groups[2].Value
    $all += [PSCustomObject]@{File=$f; Var=$name}
  }
}
$all | Group-Object Var | Where-Object { $_.Count -gt 1 } | ForEach-Object {
  Write-Output ($_.Name + ': ' + (($_.Group | ForEach-Object { $_.File }) -join ', '))
}
Write-Output "DONE"
