param(
    [string]$SillyTavernRoot = ''
)

$ErrorActionPreference = 'Stop'
$PluginId = 'comic-orb'

function Test-SillyTavernRoot([string]$Path) {
    if (-not $Path) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Path 'config.yaml') -PathType Leaf) -and
        (Test-Path -LiteralPath (Join-Path $Path 'server.js') -PathType Leaf)
}

function Find-SillyTavernRoot([string]$Start) {
    $current = [System.IO.Path]::GetFullPath($Start)
    for ($depth = 0; $depth -lt 12; $depth++) {
        if (Test-SillyTavernRoot $current) { return $current }
        $parent = Split-Path -Parent $current
        if (-not $parent -or $parent -eq $current) { break }
        $current = $parent
    }
    return ''
}

$Root = if ($SillyTavernRoot) { [System.IO.Path]::GetFullPath($SillyTavernRoot) } else { Find-SillyTavernRoot $PSScriptRoot }
if (-not (Test-SillyTavernRoot $Root)) { throw '无法定位 SillyTavern 根目录；请使用 -SillyTavernRoot 指定。' }

$Destination = Join-Path $Root "plugins\$PluginId"
if (-not (Test-Path -LiteralPath $Destination)) {
    Write-Host 'Comic Orb Server Plugin 当前未安装。'
    exit 0
}

$item = Get-Item -LiteralPath $Destination -Force
if (-not ($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint)) {
    throw "为避免误删，卸载器拒绝删除非链接目录：$Destination"
}

Remove-Item -LiteralPath $Destination -Force
Write-Host "已移除后端插件链接：$Destination" -ForegroundColor Green
Write-Host '没有关闭全局 enableServerPlugins，以免影响其他服务器插件。请重启 SillyTavern。' -ForegroundColor Cyan
