param(
  [switch]$Worker
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path -LiteralPath (Split-Path -Parent $PSScriptRoot)).Path
$packagePath = Join-Path $projectRoot "package.json"
$package = Get-Content -LiteralPath $packagePath -Raw | ConvertFrom-Json
$sourceCommit = (& git -C $projectRoot rev-parse --short HEAD 2>$null)
if ([string]::IsNullOrWhiteSpace($sourceCommit)) {
  $sourceCommit = "unknown"
}
$debugIdentity = "source=$projectRoot; version=$($package.version); commit=$sourceCommit; mode=debug"
$taskName = "bb-colive-dev"
$logDirectory = Join-Path $env:LOCALAPPDATA "BB CoLive"
$logPath = Join-Path $logDirectory "dev.log"
$viteLogPath = Join-Path $logDirectory "vite.log"
$viteErrorPath = Join-Path $logDirectory "vite-error.log"
$tauriLogPath = Join-Path $logDirectory "tauri.log"
$tauriErrorPath = Join-Path $logDirectory "tauri-error.log"

if ($Worker) {
  New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null
  Set-Location -LiteralPath $projectRoot
  $env:WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS = "--remote-debugging-port=9223"
  $node = (Get-Command node.exe -ErrorAction Stop).Source
  $viteScript = Join-Path $projectRoot "node_modules\vite\bin\vite.js"
  $tauriScript = Join-Path $projectRoot "node_modules\@tauri-apps\cli\tauri.js"
  "[$(Get-Date -Format s)] $debugIdentity; start npm run dev (hidden Vite process)" | Add-Content -LiteralPath $logPath -Encoding utf8
  $vite = Start-Process `
    -FilePath $node `
    -ArgumentList @($viteScript, "--host", "127.0.0.1", "--strictPort") `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $viteLogPath `
    -RedirectStandardError $viteErrorPath `
    -PassThru

  $viteReady = $false
  for ($i = 0; $i -lt 80; $i++) {
    $listener = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
    if ($listener) {
      $viteReady = $true
      break
    }
    Start-Sleep -Milliseconds 250
  }

  if (-not $viteReady) {
    & taskkill.exe /PID $vite.Id /T /F 2>$null | Out-Null
    throw "Vite did not become ready on port 1420. See $viteLogPath and $viteErrorPath."
  }

  $configPath = Join-Path $logDirectory "tauri-dev-override.json"
  '{"build":{"beforeDevCommand":"","devUrl":"http://127.0.0.1:1420"}}' | Set-Content -LiteralPath $configPath -Encoding utf8
  "[$(Get-Date -Format s)] $debugIdentity; start tauri dev with external Vite (hidden process)" | Add-Content -LiteralPath $logPath -Encoding utf8
  $tauri = Start-Process `
    -FilePath $node `
    -ArgumentList @($tauriScript, "dev", "--config", $configPath) `
    -WorkingDirectory $projectRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $tauriLogPath `
    -RedirectStandardError $tauriErrorPath `
    -PassThru

  $appReady = $false
  # Rust 首次增量编译可能超过 20 秒；等待窗口过短会误杀仍在正常启动的 Tauri 进程。
  for ($i = 0; $i -lt 240; $i++) {
    $app = Get-Process -Name "bb-colive" -ErrorAction SilentlyContinue
    if ($app) {
      $appReady = $true
      break
    }
    if ($tauri.HasExited) {
      break
    }
    Start-Sleep -Milliseconds 250
  }

  if (-not $appReady) {
    if ($vite -and -not $vite.HasExited) {
      & taskkill.exe /PID $vite.Id /T /F 2>$null | Out-Null
    }
    throw "Tauri did not start bb-colive.exe. See $tauriLogPath and $tauriErrorPath."
  }

  "[$(Get-Date -Format s)] bb-colive.exe started; worker will keep Vite alive until the app closes" | Add-Content -LiteralPath $logPath -Encoding utf8
  while (Get-Process -Name "bb-colive" -ErrorAction SilentlyContinue) {
    Start-Sleep -Seconds 2
  }
  if ($vite -and -not $vite.HasExited) {
    & taskkill.exe /PID $vite.Id /T /F 2>$null | Out-Null
  }
  if ($tauri -and -not $tauri.HasExited) {
    & taskkill.exe /PID $tauri.Id /T /F 2>$null | Out-Null
  }
  "[$(Get-Date -Format s)] bb-colive.exe closed; stopped Vite and Tauri dev processes" | Add-Content -LiteralPath $logPath -Encoding utf8
  exit 0
}

$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
$app = Get-Process -Name "bb-colive" -ErrorAction SilentlyContinue
if ($task) {
  $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
  if ($taskInfo.State -eq "Running" -or $app) {
    Write-Output "Detached dev instance is already running (task: $taskName or bb-colive.exe)."
    exit 0
  }
}
if ($app) {
  Write-Output "Detached dev instance is already running (bb-colive.exe)."
  exit 0
}

$wscript = Join-Path $env:SystemRoot "System32\wscript.exe"
$launcherPath = Join-Path $projectRoot "scripts\start-dev-detached.vbs"
$arguments = "//B //NoLogo `"$launcherPath`" --worker"
$action = New-ScheduledTaskAction -Execute $wscript -Argument $arguments -WorkingDirectory $projectRoot
$principal = New-ScheduledTaskPrincipal `
  -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive `
  -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
  -Hidden `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable

Register-ScheduledTask `
  -TaskName $taskName `
  -Action $action `
  -Principal $principal `
  -Settings $settings `
  -Description "bb-colive development mode (detached from Codex session)" `
  -Force | Out-Null
Start-ScheduledTask -TaskName $taskName
Write-Output "Detached dev instance started (task: $taskName); console window is hidden."
Write-Output "Dev log: $logPath"
Write-Output "Vite log: $viteLogPath"
