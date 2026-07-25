param(
    [string]$SillyTavernRoot = ''
)

$ErrorActionPreference = 'Stop'
$PluginId = 'comic-orb'
$Source = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "server-plugins\$PluginId")).Path

function Test-SillyTavernRoot([string]$Path) {
    if (-not $Path) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path 'config.yaml') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $Path 'server.js') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $Path 'src\plugin-loader.js') -PathType Leaf)
}

function Find-SillyTavernRoot {
    param([string[]]$Starts)
    foreach ($start in $Starts) {
        if (-not $start) { continue }
        $current = [System.IO.Path]::GetFullPath($start)
        for ($depth = 0; $depth -lt 12; $depth++) {
            if (Test-SillyTavernRoot $current) { return $current }
            $parent = Split-Path -Parent $current
            if (-not $parent -or $parent -eq $current) { break }
            $current = $parent
        }
    }
    return ''
}

if ($SillyTavernRoot) {
    $Root = [System.IO.Path]::GetFullPath($SillyTavernRoot)
    if (-not (Test-SillyTavernRoot $Root)) { throw "指定路径不是有效的 SillyTavern 根目录：$Root" }
} else {
    $Root = Find-SillyTavernRoot @($PSScriptRoot, (Get-Location).Path)
    if (-not $Root) {
        $manual = Read-Host '未能自动找到 SillyTavern。请输入包含 config.yaml 和 server.js 的 SillyTavern 根目录'
        $Root = [System.IO.Path]::GetFullPath($manual)
        if (-not (Test-SillyTavernRoot $Root)) { throw "不是有效的 SillyTavern 根目录：$Root" }
    }
}

$ConfigPath = Join-Path $Root 'config.yaml'
$ConfigText = Get-Content -LiteralPath $ConfigPath -Raw
$BackupPath = "$ConfigPath.comic-orb-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
Copy-Item -LiteralPath $ConfigPath -Destination $BackupPath -Force
if ($ConfigText -match '(?m)^\s*enableServerPlugins\s*:') {
    $ConfigText = [regex]::Replace($ConfigText, '(?m)^(\s*)enableServerPlugins\s*:\s*(?:true|false)\s*$', '${1}enableServerPlugins: true')
} else {
    $ConfigText = $ConfigText.TrimEnd() + [Environment]::NewLine + 'enableServerPlugins: true' + [Environment]::NewLine
}
Set-Content -LiteralPath $ConfigPath -Value $ConfigText -Encoding utf8

$PluginsDir = Join-Path $Root 'plugins'
$Destination = Join-Path $PluginsDir $PluginId
New-Item -ItemType Directory -Path $PluginsDir -Force | Out-Null

if (Test-Path -LiteralPath $Destination) {
    $item = Get-Item -LiteralPath $Destination -Force
    if ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) {
        Remove-Item -LiteralPath $Destination -Force
    } else {
        $backup = Join-Path $PluginsDir "$PluginId.backup-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
        Move-Item -LiteralPath $Destination -Destination $backup
        Write-Host "已有同名目录已备份到：$backup" -ForegroundColor Yellow
    }
}

New-Item -ItemType Junction -Path $Destination -Target $Source | Out-Null

Write-Host ''
Write-Host 'Comic Orb Server Plugin 安装完成。' -ForegroundColor Green
Write-Host "SillyTavern：$Root"
Write-Host "后端插件：$Destination -> $Source"
Write-Host "config.yaml 备份：$BackupPath"
Write-Host ''
Write-Host '请完全重启 SillyTavern 后端，然后在漫画球主页点击“重新检测”。' -ForegroundColor Cyan
