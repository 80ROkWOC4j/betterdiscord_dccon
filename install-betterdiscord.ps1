# Install DCCon into an existing BetterDiscord installation. Settings/cache are preserved.
param([string]$PluginsDirectory = (Join-Path $env:APPDATA 'BetterDiscord/plugins'))
$ErrorActionPreference = 'Stop'
if (!(Test-Path -LiteralPath $PluginsDirectory -PathType Container)) {throw 'BetterDiscord plugin directory not found. Install BetterDiscord first.'}
$source = Join-Path $PSScriptRoot 'DCCon.plugin.js'
if (!(Test-Path -LiteralPath $source)) {throw 'DCCon.plugin.js must be next to this installer.'}
$target = Join-Path $PluginsDirectory 'DCCon.plugin.js'
if (Test-Path -LiteralPath $target) {
    if ((Get-FileHash -LiteralPath $source).Hash -eq (Get-FileHash -LiteralPath $target).Hash) {
        Write-Output 'This DCCon version is already installed.'
        exit
    }
    Copy-Item -LiteralPath $target -Destination ($target + '.backup-' + [guid]::NewGuid().ToString('N'))
}
Copy-Item -LiteralPath $source -Destination $target
if ((Get-FileHash -LiteralPath $source).Hash -ne (Get-FileHash -LiteralPath $target).Hash) {throw 'Installation verification failed'}
Write-Output 'DCCon installed. Enable it in Discord Settings > BetterDiscord > Plugins. Existing settings and cache were preserved.'
