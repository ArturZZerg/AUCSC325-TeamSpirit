param(
  [string]$AdbPath = (Join-Path $env:LOCALAPPDATA 'Android\Sdk\platform-tools\adb.exe'),
  [string]$Serial,
  [ValidateRange(1024,65535)][int]$AdbServerPort = 5037,
  [string[]]$Routes = @('journal','planner','focus','workload','academics','timetable','study-plans','study-report','focus-history','get-started','review','routines','help')
)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$headings = @{
  journal='CHECK-IN JOURNAL'; planner='PLAN AHEAD'; focus='FOCUS SPACE'; workload='WORKLOAD INBOX'; help='HELP & DATA'
  academics='COURSEWORK'; timetable='CLASS TIMETABLE'; 'study-plans'='MY STUDY PLANS'; 'study-report'='STUDY REPORT'
  'focus-history'='YOUR STUDY TIME'; 'get-started'='GET STARTED'; review='WEEKLY REVIEW'; routines='ROUTINE LIBRARY'
}
if (-not (Test-Path -LiteralPath $AdbPath)) { throw 'Android platform-tools are required' }
if ($Serial -and $Serial -notmatch '^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$') { throw 'Invalid Android device serial' }
if ($Routes.Count -eq 0 -or @($Routes | Where-Object { -not $headings.ContainsKey($_) }).Count) { throw 'Choose documented standalone routes only' }
$devices = @(& $AdbPath -P $AdbServerPort devices | Where-Object { $_ -match '^\S+\s+device$' } | ForEach-Object { ($_ -split '\s+')[0] })
if ($LASTEXITCODE -ne 0) { throw 'Android device inventory failed' }
if ($Serial) {
  if (@($devices | Where-Object { $_ -ceq $Serial }).Count -ne 1) { throw 'Selected Android device is missing, offline or unauthorized' }
} else {
  if ($devices.Count -ne 1) { throw 'Connect exactly one authorized, unlocked Android device or select its serial explicitly' }
  $Serial = $devices[0]
}
function Invoke-Adb {
  $output = & $AdbPath -P $AdbServerPort -s $Serial @args
  if ($LASTEXITCODE -ne 0) { throw 'Selected Android device command failed; acceptance stopped' }
  return $output
}
if (-not (Invoke-Adb shell pm path com.campusflow.mobile)) { throw 'Install the reviewed preview and sign in before testing' }
$size = (Invoke-Adb shell wm size) -join "`n"
$sizeMatches = [regex]::Matches($size, '(?:Physical|Override) size:\s*(\d+)x(\d+)')
if (-not $sizeMatches.Count) { throw 'Device dimensions unavailable' }
$height = [int]$sizeMatches[$sizeMatches.Count-1].Groups[2].Value
$state = (Invoke-Adb shell dumpsys window) -join "`n"
$top = [regex]::Match($state, 'mType=statusBars[^\r\n]*mInsetsHint=Insets\{left=\d+, top=(\d+)')
$bottom = [regex]::Match($state, 'mType=navigationBars[^\r\n]*mInsetsHint=Insets\{[^\r\n]*bottom=(\d+)')
if (-not $top.Success -or -not $bottom.Success) { throw 'Visible system-bar geometry unavailable; inspect the device manually' }
$contentTop = [int]$top.Groups[1].Value
$contentBottom = $height - [int]$bottom.Groups[1].Value
$directory = Join-Path $root '.local/native-screen-acceptance'
[IO.Directory]::CreateDirectory($directory) | Out-Null
$results = @()
function Bounds($node) {
  $values = @([regex]::Matches($node.bounds, '\d+') | ForEach-Object { [int]$_.Value })
  if ($values.Count -ne 4) { throw 'Malformed accessibility bounds' }
  return $values
}
foreach ($route in $Routes) {
  Invoke-Adb shell am start -W -a android.intent.action.VIEW -d "campusflow://$route" com.campusflow.mobile | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Cannot open $route" }
  $remote = '/sdcard/campusflow-insets-' + [guid]::NewGuid().ToString('N') + '.xml'
  $local = Join-Path $directory 'current.xml'
  try {
    Invoke-Adb shell uiautomator dump $remote | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Accessibility snapshot unavailable' }
    Invoke-Adb pull $remote $local 2>&1 | Out-Null
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read accessibility snapshot' }
  } finally { Invoke-Adb shell rm $remote | Out-Null }
  [xml]$ui = [IO.File]::ReadAllText($local)
  if ($ui.SelectSingleNode('//node').package -ne 'com.campusflow.mobile') { throw 'Another surface interrupted CampusFlow acceptance' }
  $nodes = @($ui.SelectNodes('//node'))
  $workspace = @($nodes | Where-Object { $_.text -eq $headings[$route] })
  if ($workspace.Count -ne 1) { throw "Expected one $route workspace heading; do not substitute an auth/unknown screen" }
  # Navigation can expose an outer ScrollView covering the entire window. The
  # workspace viewport is the nearest scroll ancestor of its verified heading.
  $scroll = $workspace[0].SelectSingleNode('ancestor::node[@class="android.widget.ScrollView"][1]')
  if (-not $scroll) { throw "No main scroll viewport for $route" }
  $viewport = Bounds $scroll
  if ($viewport[1] -lt $contentTop -or $viewport[3] -gt $contentBottom) { throw "$route overlaps system bars (viewport $($scroll.bounds), allowed y=$contentTop..$contentBottom)" }
  $buttons = @($scroll.SelectNodes('.//node') | Where-Object { $_.class -eq 'android.widget.Button' -and $_.clickable -eq 'true' })
  if (-not $buttons.Count) { throw "No workspace action for $route" }
  $first = Bounds $buttons[0]
  if ($first[1] -lt $contentTop -or $first[3] -gt $contentBottom -or $first[3] -le $first[1]) { throw "$route first action overlaps system bars" }
  $results += @{ route=$route; viewport=$viewport; firstAction=$first }
  Write-Output "$route viewport and first action fit visible system bars"
}
$report = @{ checkedAt=[DateTime]::UtcNow.ToString('o'); serial=$Serial; adbServerPort=$AdbServerPort; contentTop=$contentTop; contentBottom=$contentBottom; screens=$results }
[IO.File]::WriteAllText((Join-Path $directory 'result.json'), ($report | ConvertTo-Json -Depth 5))
Write-Output "Native geometry acceptance passed for $($results.Count) workspaces. Private snapshots stay in ignored .local."
