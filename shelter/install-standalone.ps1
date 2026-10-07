# Run with Discord fully closed. Build first: node shelter/build.cjs
# Install: pwsh -File shelter/install-standalone.ps1
# Remove discord-dccon loader (preserves user data): add -Remove
param(
    [Alias('Restore')][switch]$Remove,
    [ValidateSet('Stable', 'Canary')][string]$Channel = 'Stable',
    [string]$DiscordRoot
)
$ErrorActionPreference = 'Stop'
$Channel = if ($Channel -eq 'Canary') {'Canary'} else {'Stable'}
if (!$DiscordRoot) {$DiscordRoot = Join-Path $env:LOCALAPPDATA $(if ($Channel -eq 'Canary') {'DiscordCanary'} else {'Discord'})}
$root = [IO.Path]::GetFullPath($DiscordRoot)
if (Get-Process -Name Discord,DiscordCanary -ErrorAction SilentlyContinue | Where-Object { $_.Path -and [IO.Path]::GetFullPath($_.Path).StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase) }) {
    throw "Fully quit Discord $Channel before installing or restoring."
}
$version = Get-ChildItem -LiteralPath $root -Directory |
    Where-Object {$_.Name -match '^app-\d+(\.\d+)+$'} |
    Sort-Object {[version]($_.Name.Substring(4))} -Descending | Select-Object -First 1
if (!$version) {throw "Discord $Channel installation not found at $root"}
$resources = [IO.Path]::GetFullPath((Join-Path $version.FullName 'resources'))
if (!$resources.StartsWith($root + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {throw 'Unexpected Discord path'}
$app = Join-Path $resources 'app'
$asar = Join-Path $resources 'app.asar'
$original = Join-Path $resources 'discord-dccon-original.asar'
$manifest = Join-Path $app 'discord-dccon-install.json'
$record = if (Test-Path -LiteralPath $manifest) {Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json} else {$null}
if ($record) {
    $installedChannel = if ($record.channel) {$record.channel} else {'Stable'}
    if ($installedChannel -ne $Channel) {throw "This installation uses -Channel $installedChannel"}
    if ($record.kind -ne 'discord-dccon-standalone' -or !(Test-Path -LiteralPath $original) -or
        (Get-FileHash -LiteralPath $original).Hash -ne $record.originalHash) {throw 'Invalid discord-dccon installation or original archive changed'}
    foreach ($file in @('index.js', 'package.json')) {
        if ((Get-FileHash -LiteralPath (Join-Path $app $file)).Hash -ne $record.$file) {throw "Modified loader: $file"}
    }
}
if ($Remove) {
    if (!$record -or (Test-Path -LiteralPath $asar)) {throw 'No restorable standalone installation, or app.asar already exists'}
    # Keep the removed loader as a recoverable sibling; never delete user files.
    $archive = Join-Path $resources ('discord-dccon-removed-' + [guid]::NewGuid().ToString('N'))
    if (![IO.Path]::GetFullPath($archive).StartsWith($resources + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {throw 'Unexpected archive path'}
    Move-Item -LiteralPath $app -Destination $archive
    try {Move-Item -LiteralPath $original -Destination $asar}
    catch {Move-Item -LiteralPath $archive -Destination $app; throw}
    Write-Output 'discord-dccon removed; vanilla Discord restored. User data and removed loader were preserved.'
    exit
}
$build = Join-Path $PSScriptRoot 'runtime'
if (!(Test-Path -LiteralPath $build)) {$build = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts/shelter'))}
$files = @('bootstrap.js', 'main.cjs', 'preload.cjs', 'native.js')
foreach ($file in $files) {if (!(Test-Path -LiteralPath (Join-Path $build $file))) {throw 'Build first: node shelter/build.cjs'}}
if (!$record -and ((Test-Path -LiteralPath $app) -or (Test-Path -LiteralPath $original) -or !(Test-Path -LiteralPath $asar))) {
    throw 'This installer requires vanilla Discord. Existing mods are not replaced.'
}
$stage = Join-Path $resources ('discord-dccon-stage-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path (Join-Path $stage 'runtime') -Force | Out-Null
foreach ($file in $files) {Copy-Item -LiteralPath (Join-Path $build $file) -Destination (Join-Path $stage "runtime/$file")}
[IO.File]::WriteAllText((Join-Path $stage 'runtime/channel.json'), (@{channel=$Channel} | ConvertTo-Json), [Text.UTF8Encoding]::new($false))
$entry = @'
const path = require('node:path');
const electron = require('electron');
const original = path.resolve(__dirname, '../discord-dccon-original.asar');
const metadata = require(path.join(original, 'package.json'));
electron.app.setAppPath(original);
electron.app.name = metadata.name;
try { require('./runtime/main.cjs'); }
catch (error) { try { console.error('[discord-dccon] Loader failed', error); } catch (_) {} }
const entry = path.join(original, metadata.main);
require.main.filename = entry;
require('node:module')._load(entry, null, true);
'@
[IO.File]::WriteAllText((Join-Path $stage 'index.js'), $entry)
[IO.File]::WriteAllText((Join-Path $stage 'package.json'), '{"main":"index.js"}')
$saved = @{kind='discord-dccon-standalone';channel=$Channel;originalHash=if ($record) {$record.originalHash} else {(Get-FileHash -LiteralPath $asar).Hash}}
foreach ($file in @('index.js', 'package.json')) {$saved[$file] = (Get-FileHash -LiteralPath (Join-Path $stage $file)).Hash}
$saved | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $stage 'discord-dccon-install.json') -Encoding utf8
if ($record) {
    $previous = Join-Path $resources ('discord-dccon-previous-' + [guid]::NewGuid().ToString('N'))
    Move-Item -LiteralPath $app -Destination $previous
    try {Move-Item -LiteralPath $stage -Destination $app}
    catch {Move-Item -LiteralPath $previous -Destination $app; throw}
} else {
    Move-Item -LiteralPath $asar -Destination $original
    try {Move-Item -LiteralPath $stage -Destination $app}
    catch {Move-Item -LiteralPath $original -Destination $asar; throw}
}
Write-Output "discord-dccon standalone installed for Discord $Channel. Start Discord normally. Host updates may require running this installer again."
