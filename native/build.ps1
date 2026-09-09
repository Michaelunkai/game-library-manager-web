param([switch]$FrameworkDependent, [switch]$SkipAssets, [string]$DotnetPath)
$ErrorActionPreference = 'Stop'
$nativeRoot = $PSScriptRoot
$sourceRoot = Split-Path $nativeRoot -Parent
if (-not $DotnetPath) {
    $isolatedSdk = Join-Path $env:USERPROFILE '.codex\toolchains\gamelibrary-dotnet10\dotnet.exe'
    $DotnetPath = 'C:\Program Files\dotnet\dotnet.exe'
    if (Test-Path -LiteralPath $isolatedSdk) { $DotnetPath = $isolatedSdk }
}
if (-not (Test-Path -LiteralPath $dotnetPath)) { throw '.NET 10 SDK is required to build. Install it from Microsoft.' }
Push-Location -LiteralPath $nativeRoot
try {
    if (-not $SkipAssets) {
        Add-Type -AssemblyName System.IO.Compression
        Add-Type -AssemblyName System.IO.Compression.FileSystem
        [void][IO.Directory]::CreateDirectory((Join-Path $nativeRoot 'Assets'))
        $assetZip = Join-Path $nativeRoot 'Assets\catalog.zip'
        if (Test-Path -LiteralPath $assetZip) { Remove-Item -LiteralPath $assetZip }
        $archive = [IO.Compression.ZipFile]::Open($assetZip, [IO.Compression.ZipArchiveMode]::Create)
        try {
            $publicRoot = Join-Path $sourceRoot 'public'
            $files = @(Get-ChildItem -LiteralPath (Join-Path $publicRoot 'data'),(Join-Path $publicRoot 'images') -File -Recurse)
            foreach ($file in $files) {
                $entry = $file.FullName.Substring($publicRoot.Length + 1).Replace('\','/')
                [void][IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $file.FullName, $entry, [IO.Compression.CompressionLevel]::Fastest)
            }
            Write-Output ('Bundled {0} catalog and cover files' -f $files.Count)
        } finally { $archive.Dispose() }
    }
    (Get-FileHash -LiteralPath (Join-Path $nativeRoot 'Assets\catalog.zip') -Algorithm SHA256).Hash.ToLowerInvariant() | Set-Content -LiteralPath (Join-Path $nativeRoot 'Assets\catalog.sha256') -Encoding ASCII
    $selfContained = 'true'
    if ($FrameworkDependent) { $selfContained = 'false' }
    & $dotnetPath publish GameLibrary.Native.csproj -c Release -r win-x64 --self-contained $selfContained -o dist
    if ($LASTEXITCODE -ne 0) { throw ('Publish failed: exit ' + $LASTEXITCODE) }
    # The single-file publisher carries the managed payload into the EXE but may
    # omit native Node addons from the publish directory. Copy the exact bundled
    # Wand bridge runtime from the RID-specific build output so the installed EXE
    # remains self-contained and never falls back to a developer profile path.
    $builtTools = Join-Path $nativeRoot 'bin\Release\net10.0-windows\win-x64\tools'
    $publishedTools = Join-Path $nativeRoot 'dist\tools'
    if (Test-Path -LiteralPath $builtTools -PathType Container) {
        foreach ($file in @(Get-ChildItem -LiteralPath $builtTools -File -Recurse)) {
            $relative = $file.FullName.Substring($builtTools.Length + 1)
            $destination = Join-Path $publishedTools $relative
            [void][IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($destination))
            Copy-Item -LiteralPath $file.FullName -Destination $destination -Force
        }
    }
    $exe = Join-Path $nativeRoot 'dist\GameLibrary.exe'
    Get-Item -LiteralPath $exe | Select-Object FullName,Length,LastWriteTime
    Write-Output ('SHA256: ' + (Get-FileHash -LiteralPath $exe -Algorithm SHA256).Hash)
} finally { Pop-Location }
