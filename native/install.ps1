param([switch]$DesktopShortcut, [string]$InstallRoot = (Join-Path $env:LOCALAPPDATA 'Programs\GameLibraryManager'), [switch]$NoShortcuts)
$ErrorActionPreference = 'Stop'
$sourceExe = Join-Path $PSScriptRoot 'dist\GameLibrary.exe'
if (-not (Test-Path -LiteralPath $sourceExe -PathType Leaf)) { throw 'Build the EXE with build.ps1 first.' }
$targetRoot = [IO.Path]::GetFullPath($InstallRoot)
if ([IO.Path]::GetPathRoot($targetRoot).TrimEnd('\') -eq $targetRoot.TrimEnd('\')) { throw 'The installation directory cannot be a drive root.' }
[void][IO.Directory]::CreateDirectory($targetRoot)
$targetExe = Join-Path $targetRoot 'GameLibrary.exe'
if (Test-Path -LiteralPath $targetExe) {
    if (-not (Test-Path -LiteralPath (Join-Path $targetRoot 'install-receipt.json'))) { throw 'An unmanaged GameLibrary.exe already exists here; choose another folder.' }
    Copy-Item -LiteralPath $targetExe -Destination ($targetExe + '.backup-' + (Get-Date -Format yyyyMMdd-HHmmssfff))
}
Copy-Item -LiteralPath $sourceExe -Destination $targetExe -Force
$expected = (Get-FileHash -LiteralPath $sourceExe -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $targetExe -Algorithm SHA256).Hash -ne $expected) { throw 'Installed EXE checksum does not match the package.' }
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'uninstall.ps1') -Destination (Join-Path $targetRoot 'uninstall.ps1') -Force
$links = @()
if (-not $NoShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $links += Join-Path ([Environment]::GetFolderPath('Programs')) 'Game Library.lnk'
    if ($DesktopShortcut) { $links += Join-Path ([Environment]::GetFolderPath('Desktop')) 'Game Library.lnk' }
    foreach ($linkPath in $links) {
        if (Test-Path -LiteralPath $linkPath) {
            $old = $shell.CreateShortcut($linkPath)
            if ($old.TargetPath -ne $targetExe) { throw ('An unrelated shortcut already exists: ' + $linkPath) }
        }
        $shortcut = $shell.CreateShortcut($linkPath)
        $shortcut.TargetPath = $targetExe; $shortcut.WorkingDirectory = $targetRoot; $shortcut.IconLocation = $targetExe + ',0'; $shortcut.Description = 'Native Windows Game Library'; $shortcut.Save()
    }
}
[pscustomobject]@{ app='GameLibraryManager.Native'; at=[DateTime]::UtcNow.ToString('o'); root=$targetRoot; executable=$targetExe; sha256=$expected; shortcuts=$links } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $targetRoot 'install-receipt.json') -Encoding UTF8
Write-Output ('Installed and checksum-verified: ' + $targetExe)
