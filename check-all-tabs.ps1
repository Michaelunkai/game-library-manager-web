# Check every tab on both Render and Vercel sites

Write-Host "`nCOMPREHENSIVE TAB CHECK" -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

# Fetch data
$renderGames = Invoke-RestMethod 'https://game-library-manager-web.onrender.com/data/games.json'
$vercelGames = Invoke-RestMethod 'https://game-library-manager-web.vercel.app/data/games.json'
$renderConfig = Invoke-RestMethod 'https://game-library-manager-web.onrender.com/data/admin-config.json'
$vercelConfig = Invoke-RestMethod 'https://game-library-manager-web.vercel.app/data/admin-config.json'

# Get all categories
$allCategories = @()
$allCategories += $renderGames | ForEach-Object { $_.category } | Select-Object -Unique
$allCategories += $vercelGames | ForEach-Object { $_.category } | Select-Object -Unique
$allCategories = $allCategories | Select-Object -Unique | Sort-Object

Write-Host "`nTAB BY TAB COMPARISON:" -ForegroundColor Yellow
Write-Host "---------------------"

$mismatchFound = $false
$totalRender = 0
$totalVercel = 0
$differences = @()

foreach ($category in $allCategories) {
    $renderCount = @($renderGames | Where-Object { $_.category -eq $category }).Count
    $vercelCount = @($vercelGames | Where-Object { $_.category -eq $category }).Count
    
    $totalRender += $renderCount
    $totalVercel += $vercelCount
    
    $status = if ($renderCount -eq $vercelCount) { "OK" } else { "MISMATCH" }
    
    Write-Host "[$category]" -ForegroundColor Cyan
    Write-Host "  Render: $renderCount games"
    Write-Host "  Vercel: $vercelCount games"
    
    if ($renderCount -ne $vercelCount) {
        Write-Host "  Status: " -NoNewline
        Write-Host "MISMATCH!" -ForegroundColor Red
        Write-Host "  Difference: " -NoNewline
        Write-Host "$($renderCount - $vercelCount) games" -ForegroundColor Yellow
        $mismatchFound = $true
        $differences += @{
            Category = $category
            RenderCount = $renderCount
            VercelCount = $vercelCount
            Difference = $renderCount - $vercelCount
        }
    } else {
        Write-Host "  Status: " -NoNewline
        Write-Host "SYNCED" -ForegroundColor Green
    }
    Write-Host ""
}

Write-Host "TOTALS:" -ForegroundColor Yellow
Write-Host "-------"
Write-Host "Total Render games: $totalRender"
Write-Host "Total Vercel games: $totalVercel"
Write-Host "Total difference: $($totalRender - $totalVercel)"

# Admin config check
Write-Host "`nADMIN CONFIG SYNC:" -ForegroundColor Yellow
Write-Host "-----------------"
$renderCats = @($renderConfig.gameCategories.PSObject.Properties).Count
$vercelCats = @($vercelConfig.gameCategories.PSObject.Properties).Count
Write-Host "Render categorized: $renderCats games"
Write-Host "Vercel categorized: $vercelCats games"

# Final report
Write-Host "`nFINAL REPORT:" -ForegroundColor Cyan
Write-Host "============="

if (-not $mismatchFound) {
    Write-Host "ALL TABS ARE PERFECTLY SYNCED!" -ForegroundColor Green
    Write-Host "Every tab has the same game count on both sites." -ForegroundColor Green
} else {
    Write-Host "SYNC ISSUES FOUND!" -ForegroundColor Red
    Write-Host ""
    Write-Host "Tabs with mismatches:" -ForegroundColor Yellow
    foreach ($diff in $differences) {
        Write-Host "  - $($diff.Category): Render has $($diff.Difference) more games" -ForegroundColor Yellow
    }
    
    Write-Host "`nTO FIX THIS:" -ForegroundColor Cyan
    Write-Host "1. The sites should auto-sync from GitHub"
    Write-Host "2. If not synced in 5 minutes, there may be a deployment issue"
    Write-Host "3. Check if both sites are reading from the same GitHub repo"
}