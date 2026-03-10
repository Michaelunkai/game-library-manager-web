$gameId = "scottpilgrimvstheworldce"
$outputPath = "public\images\$gameId.png"

# Try multiple sources for Scott Pilgrim vs. The World: Complete Edition
$urls = @(
    "https://images.igdb.com/igdb/image/upload/t_cover_big/co7v90.jpg",  # IGDB official
    "https://images.igdb.com/igdb/image/upload/t_1080p/co7v90.jpg",      # Higher res
    "https://cdn.cloudflare.steamstatic.com/steam/apps/881230/library_600x900.jpg"  # Steam (if available)
)

$downloaded = $false
foreach($url in $urls) {
    Write-Host "Trying: $url"
    try {
        Invoke-WebRequest -Uri $url -OutFile $outputPath -TimeoutSec 15 -ErrorAction Stop
        $fileSize = (Get-Item $outputPath).Length
        Write-Host "  Downloaded: $fileSize bytes"
        
        if($fileSize -gt 10000) {
            Write-Host "  SUCCESS! Valid image downloaded" -ForegroundColor Green
            $downloaded = $true
            break
        } else {
            Write-Host "  Too small, trying next URL..." -ForegroundColor Yellow
            Remove-Item $outputPath -ErrorAction SilentlyContinue
        }
    } catch {
        Write-Host "  Failed: $($_.Exception.Message)" -ForegroundColor Red
    }
}

if(-not $downloaded) {
    Write-Host "`nAll sources failed!" -ForegroundColor Red
} else {
    Write-Host "`nFinal image size: $((Get-Item $outputPath).Length) bytes" -ForegroundColor Cyan
}
