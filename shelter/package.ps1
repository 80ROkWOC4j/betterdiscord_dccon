# Called by build.cjs to create the three GitHub Release assets.
$ErrorActionPreference = 'Stop'
$dist = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../artifacts/dist'))
$checksums = [ordered]@{}
foreach ($mode in @('betterdiscord', 'standalone')) {
    $name = "dccon-$mode.zip"
    $archive = Join-Path $dist $name
    Compress-Archive -Path (Join-Path $dist "$mode/*") -DestinationPath $archive -Force
    $checksums[$name] = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
}
$checksums | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $dist 'checksums.json') -Encoding utf8
