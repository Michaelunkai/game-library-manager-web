$remaining = @{
    "jackal" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2rs0.jpg"
    "kirbythecompletecollection" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2rrs.jpg"
    "kirbyandtheforgottenland" = "https://cdn.cloudflare.steamstatic.com/steam/apps/2096770/library_600x900.jpg"
    "kirbysreturntodreamlanddeluxe" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co5wb6.jpg"
    "myheroacademiaallsjustice" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1pt4.jpg"
    "romeoisadeadman" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8kni.jpg"
    "supermario3dworldbowsersfury" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2c4s.jpg"
    "supermariogalaxy1and2" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1rbi.jpg"
    "supermarioodyssey" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1rtd.jpg"
    "styxbladesofgreed" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2lc2.jpg"
    "burdenofcommand" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co4k8v.jpg"
    "demontides" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8aq4.jpg"
    "nioh3" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co87ov.jpg"
    "strangerofparadisefinalfantasyorigin" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co3r93.jpg"
    "theouterworlds2" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co65ps.jpg"
    "dynastywarriorsorigins" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8nht.jpg"
    "godeater3" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1p18.jpg"
    "thedarkpicturesanthologyhouseofashes" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co3njl.jpg"
}

$outputDir = "public\images"
$downloaded = 0

foreach($game in $remaining.GetEnumerator()) {
    $gameId = $game.Key
    $url = $game.Value
    $outputPath = "$outputDir\$gameId.png"
    
    Write-Host "[$($downloaded + 1)/$($remaining.Count)] $gameId..."
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $outputPath -TimeoutSec 15 -ErrorAction Stop
        if((Get-Item $outputPath).Length -gt 5000) {
            Write-Host "  Downloaded!" -ForegroundColor Green
            $downloaded++
        } else {
            Remove-Item $outputPath -ErrorAction SilentlyContinue
            Write-Host "  Too small, skipped" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`nDownloaded: $downloaded/$($remaining.Count)" -ForegroundColor Cyan
