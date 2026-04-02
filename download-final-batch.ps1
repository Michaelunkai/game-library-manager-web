$finalGames = @{
    "bladechimera" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8r7f.jpg"
    "campfirewithcat" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co96id.jpg"
    "foregone" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1sic.jpg"
    "hifirush" = "https://cdn.cloudflare.steamstatic.com/steam/apps/1817230/library_600x900.jpg"
    "inmost" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2bq0.jpg"
    "kirbyandtheforgottenland" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co4jni.jpg"
    "minicozyroomlofi" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8mqm.jpg"
    "screaminghead" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8xnk.jpg"
    "shewas98" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co92u6.jpg"
    "thelastcitadel" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co93eg.jpg"
    "theslaveriantrucker" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8b42.jpg"
    "towerborne" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8q27.jpg"
    "youstay" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8pnr.jpg"
    "castlevanialordsofshadow2" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1s9n.jpg"
    "childrenofmorta" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co1tg9.jpg"
    "dawnoftheashenqueen" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co93mu.jpg"
    "lostepic" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co2jfl.jpg"
    "maichildofagesstormsoftime" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8l05.jpg"
    "pipistrelloandthecursedyoyo" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co91f0.jpg"
    "placidplasticdeckaquietquest" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co89l8.jpg"
    "scottpilgrimvstheworldce" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co44k1.jpg"
    "spaceinvadersdeckcommander" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co93m9.jpg"
    "flatoutheroes" = "https://images.igdb.com/igdb/image/upload/t_cover_big/co8zf5.jpg"
}

$outputDir = "public\images"
$downloaded = 0

foreach($game in $finalGames.GetEnumerator()) {
    $gameId = $game.Key
    $url = $game.Value
    $outputPath = "$outputDir\$gameId.png"
    
    Write-Host "[$($downloaded + 1)/$($finalGames.Count)] $gameId..."
    
    try {
        Invoke-WebRequest -Uri $url -OutFile $outputPath -TimeoutSec 15 -ErrorAction Stop
        if((Get-Item $outputPath).Length -gt 6000) {
            Write-Host "  Downloaded!" -ForegroundColor Green
            $downloaded++
        } else {
            Remove-Item $outputPath -ErrorAction SilentlyContinue
            Write-Host "  Too small" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
    
    Start-Sleep -Milliseconds 500
}

Write-Host "`nDownloaded: $downloaded/$($finalGames.Count)" -ForegroundColor Cyan
