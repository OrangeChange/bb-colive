param(
    [string]$OutputRoot = (Join-Path $PSScriptRoot "..\release"),
    [string]$ExecutablePath = ""
)

$ErrorActionPreference = "Stop"
$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$package = Get-Content (Join-Path $projectRoot "package.json") -Raw | ConvertFrom-Json
$packageName = "bb-colive-$($package.version)-portable"
$destination = Join-Path $OutputRoot $packageName
$archive = Join-Path $OutputRoot "bb-colive_$($package.version)_x64-portable.zip"
$executable = if ($ExecutablePath) { (Resolve-Path -LiteralPath $ExecutablePath).Path } else { Join-Path $projectRoot "src-tauri\target\release\bb-colive.exe" }

if (-not (Test-Path -LiteralPath $executable)) {
    throw "尚未生成 release 程序，请先运行 npm run tauri build。"
}
if ((Test-Path -LiteralPath $destination) -or (Test-Path -LiteralPath $archive)) {
    throw "便携版目标已存在，未覆盖：$destination 或 $archive"
}

$themeRoot = Join-Path $projectRoot "src-tauri\style-distribution"
$themeManifests = @(Get-ChildItem -LiteralPath $themeRoot -Filter theme.json -Recurse -File)
$expectedCounts = @{ native = 3; blivechat = 3; 'blivechat-open' = 8; laplace = 18 }
$actualCounts = @{}
foreach ($manifest in $themeManifests) {
    $theme = Get-Content -LiteralPath $manifest.FullName -Raw | ConvertFrom-Json
    if ($theme.origin -ne 'builtin') { throw "发布目录包含自定义主题：$($manifest.FullName)" }
    $actualCounts[$theme.mode]++
    foreach ($name in @('settings.json', 'base.css', 'visual.css', 'custom.css') + @($theme.assets | Where-Object { -not $_.sharedResourceId -and -not $_.sourceUrl } | ForEach-Object { $_.path })) {
        if (-not (Test-Path -LiteralPath (Join-Path $manifest.DirectoryName $name) -PathType Leaf)) {
            throw "主题文件缺失：$($theme.themeId)/$name"
        }
    }
    foreach ($asset in @($theme.assets | Where-Object { $_.sharedResourceId })) {
        $shared = Join-Path $themeRoot ("shared-assets/" + $asset.sharedResourceId + "/" + [IO.Path]::GetFileName($asset.path))
        if (-not (Test-Path -LiteralPath $shared -PathType Leaf)) { throw "共享素材缺失：$shared" }
    }
}
foreach ($mode in $expectedCounts.Keys) {
    if ($actualCounts[$mode] -ne $expectedCounts[$mode]) { throw "内置主题数量不完整：$mode。请先执行 npm run build。" }
}

New-Item -ItemType Directory -Path $destination -Force | Out-Null
Copy-Item -LiteralPath $executable -Destination (Join-Path $destination "bb-colive.exe")
Set-Content -LiteralPath (Join-Path $destination 'portable.flag') -Value 'BB CoLive portable' -Encoding utf8
Copy-Item -LiteralPath (Join-Path $projectRoot 'licenses/distribution') -Destination (Join-Path $destination 'licenses') -Recurse
Copy-Item -LiteralPath $themeRoot -Destination (Join-Path $destination "style") -Recurse
Compress-Archive -Path (Join-Path $destination "*") -DestinationPath $archive

Write-Output $destination
Write-Output $archive
