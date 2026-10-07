# Online installer. Example:
# & ([scriptblock]::Create((irm 'https://github.com/80ROkWOC4j/discord-dccon/releases/latest/download/install.ps1'))) -Mode BetterDiscord
param(
    [Parameter(Mandatory=$true)]
    [ValidateSet('BetterDiscord', 'Standalone')][string]$Mode,
    [string]$Version,
    [Alias('Restore')][switch]$Remove,
    [ValidateSet('Stable', 'Canary')][string]$Channel = 'Stable',
    [string]$DiscordRoot,
    [string]$PluginsDirectory = (Join-Path $env:APPDATA 'BetterDiscord/plugins')
)
$ErrorActionPreference = 'Stop'
if ($Remove -and $Mode -ne 'Standalone') {throw '-Remove is only supported for Standalone.'}
if ($Channel -ne 'Stable' -and $Mode -ne 'Standalone') {throw '-Channel is only supported for Standalone.'}
[Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
$repository = '80ROkWOC4j/discord-dccon'
$releaseUrl = "https://api.github.com/repos/$repository/releases/latest"
if ($Version) {$releaseUrl = "https://api.github.com/repos/$repository/releases/tags/$([uri]::EscapeDataString($Version))"}
$headers = @{'User-Agent'='discord-dccon-Installer';'Accept'='application/vnd.github+json'}
try {$release = Invoke-RestMethod -Uri $releaseUrl -Headers $headers}
catch {throw "Could not find a published discord-dccon release. No installation was changed. $($_.Exception.Message)"}
$assetName = 'discord-dccon-' + $Mode.ToLowerInvariant() + '.zip'
$archiveAsset = @($release.assets | Where-Object {$_.name -eq $assetName})
$checksumAsset = @($release.assets | Where-Object {$_.name -eq 'checksums.json'})
if ($archiveAsset.Count -ne 1 -or $checksumAsset.Count -ne 1) {throw "Release $($release.tag_name) is missing $assetName or checksums.json. No installation was changed."}
$tempBase = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
$workspace = Join-Path $tempBase ('discord-dccon-install-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $workspace | Out-Null
try {
    Write-Host "Downloading discord-dccon $($release.tag_name) ($Mode)..."
    $archive = Join-Path $workspace $assetName
    $checksumPath = Join-Path $workspace 'checksums.json'
    foreach ($download in @(@($archiveAsset[0], $archive), @($checksumAsset[0], $checksumPath))) {
        $url = [uri]$download[0].browser_download_url
        if ($url.Scheme -ne 'https' -or $url.Host -ne 'github.com' -or !$url.AbsolutePath.StartsWith("/$repository/releases/download/")) {
            throw 'Unexpected release asset URL.'
        }
        Invoke-WebRequest -UseBasicParsing -Uri $url.AbsoluteUri -Headers @{'User-Agent'='discord-dccon-Installer'} -OutFile $download[1]
    }
    $checksums = Get-Content -LiteralPath $checksumPath -Raw | ConvertFrom-Json
    $expected = $checksums.$assetName
    if ($expected -notmatch '^[a-fA-F0-9]{64}$' -or (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash -ne $expected) {
        throw 'Downloaded package checksum mismatch. No installation was changed.'
    }
    $package = Join-Path $workspace 'package'
    Expand-Archive -LiteralPath $archive -DestinationPath $package
    $installer = Join-Path $package 'install.ps1'
    if (!(Test-Path -LiteralPath $installer -PathType Leaf)) {throw 'Package has no installer.'}
    # Use a child process so the default Windows script policy needs no permanent change.
    $shell = Join-Path $PSHOME $(if ($PSVersionTable.PSEdition -eq 'Core') {'pwsh.exe'} else {'powershell.exe'})
    $arguments = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $installer)
    if ($Mode -eq 'Standalone') {
        if ($DiscordRoot) {$arguments += @('-DiscordRoot', $DiscordRoot)}
        if ($Channel -ne 'Stable') {$arguments += @('-Channel', $Channel)}
        # Older release packages only understand -Restore; newer ones keep it as an alias.
        if ($Remove) {$arguments += '-Restore'}
    } else {$arguments += @('-PluginsDirectory', $PluginsDirectory)}
    & $shell @arguments
    if ($LASTEXITCODE -ne 0) {throw "discord-dccon installer failed (exit $LASTEXITCODE)."}
} finally {
    $resolved = [IO.Path]::GetFullPath($workspace)
    $prefix = $tempBase.TrimEnd([IO.Path]::DirectorySeparatorChar) + [IO.Path]::DirectorySeparatorChar
    if ($resolved.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase) -and
        [IO.Path]::GetFileName($resolved) -match '^discord-dccon-install-[a-f0-9]{32}$') {
        Remove-Item -LiteralPath $resolved -Recurse -Force
    }
}
