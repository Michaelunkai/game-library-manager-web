$steamGames = @{
    "dishonored" = "205100"
    "codevein" = "678960"
    "grimdawn" = "219990"
    "untildawn" = "1180690"
    "godeater3" = "1071010"
    "tunic" = "553420"
    "gothic3" = "39500"
    "titanquestanniversaryedition" = "475150"
    "octopathtraveler" = "921570"
    "princeofpersiathelostcrown" = "2231490"
    "hadesii" = "1145350"
    "againstthestorm" = "1336490"
    "coralisland" = "1158160"
    "trialsofmana" = "924980"
}

$outputDir = "public\images"
$downloaded = 0
$failed = @()

foreach($game in $steamGames.GetEnumerator()) {
    $gameId = $game.Key
    $appId = $game.Value
    $outputPath = "$outputDir\$gameId.png"
    
    Write-Host "[$($downloaded + 1)/$($steamGames.Count)] $gameId (AppID: $appId)..."
    
    $urls = @(
        "https://cdn.cloudflare.steamstatic.com/steam/apps/$appId/library_600x900_2x.jpg",
        "https://cdn.cloudflare.steamstatic.com/steam/apps/$appId/library_600x900.jpg",
        "https://cdn.akamai.steamstatic.com/steam/apps/$appId/library_600x900.jpg"
    )
    
    $success = $false
    foreach($url in $urls) {
        try {
            $response = Invoke-WebRequest -Uri $url -OutFile $outputPath -TimeoutSec 10 -ErrorAction Stop
            if((Get-Item $outputPath).Length -gt 10000) {
                Write-Host "  Downloaded!" -ForegroundColor Green
                $downloaded++
                $success = $true
                break
            } else {
                Remove-Item $outputPath -ErrorAction SilentlyContinue
            }
        } catch {
            # Try next URL
        }
    }
    
    if(-not $success) {
        Write-Host "  Failed" -ForegroundColor Red
        $failed += $gameId
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`n=== SUMMARY ===" -ForegroundColor Cyan
Write-Host "Downloaded: $downloaded" -ForegroundColor Green
Write-Host "Failed: $($failed.Count)" -ForegroundColor $(if($failed.Count -gt 0){"Red"}else{"Green"})
if($failed.Count -gt 0) {
    Write-Host "Failed games: $($failed -join ', ')"
}
