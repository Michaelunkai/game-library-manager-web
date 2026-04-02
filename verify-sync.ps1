# Verify sync between Render and Vercel deployments

$renderUrl = 'https://game-library-manager-web.onrender.com/data/admin-config.json'
$vercelUrl = 'https://game-library-manager-web.vercel.app/data/admin-config.json'

$render = Invoke-RestMethod $renderUrl
$vercel = Invoke-RestMethod $vercelUrl

$renderGames = @($render.gameCategories.PSObject.Properties.Name)
$vercelGames = @($vercel.gameCategories.PSObject.Properties.Name)

Write-Host ""
Write-Host "SYNC STATUS CHECK" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Categorized games count:"
Write-Host "  Render: " -NoNewline
Write-Host $renderGames.Count -ForegroundColor Cyan
Write-Host "  Vercel: " -NoNewline
Write-Host $vercelGames.Count -ForegroundColor Cyan

if ($renderGames.Count -eq $vercelGames.Count) {
    Write-Host ""
    Write-Host "SUCCESS - Both sites have same count!" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "WARNING - Counts differ!" -ForegroundColor Red
}

Write-Host ""
Write-Host "Mirrors Edge Catalyst:"
if ($renderGames -contains 'mirrorsedgecatalyst') {
    $cat = $render.gameCategories.mirrorsedgecatalyst
    Write-Host "  Render: Category = $cat" -ForegroundColor Cyan
} else {
    Write-Host "  Render: Not categorized (NEW)" -ForegroundColor Yellow
}

if ($vercelGames -contains 'mirrorsedgecatalyst') {
    $cat = $vercel.gameCategories.mirrorsedgecatalyst
    Write-Host "  Vercel: Category = $cat" -ForegroundColor Cyan
} else {
    Write-Host "  Vercel: Not categorized (NEW)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Last updated: $($render.lastUpdated)"
Write-Host ""
