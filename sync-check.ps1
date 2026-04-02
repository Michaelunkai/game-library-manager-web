# Game Library Manager - Deployment Sync Checker

Write-Host "`nChecking sync status..." -ForegroundColor Cyan
Write-Host "======================" -ForegroundColor Cyan

# Fetch configurations
$render = Invoke-RestMethod -Uri 'https://game-library-manager-web.onrender.com/data/admin-config.json'
$vercel = Invoke-RestMethod -Uri 'https://game-library-manager-web.vercel.app/data/admin-config.json'
$github = Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/Michaelunkai/game-library-manager-web/main/data/admin-config.json'

# Count games
$renderCount = ($render.gameCategories.PSObject.Properties).Count
$vercelCount = ($vercel.gameCategories.PSObject.Properties).Count
$githubCount = ($github.gameCategories.PSObject.Properties).Count

Write-Host "`nCategorized games:" -ForegroundColor Yellow
Write-Host "  Render: $renderCount" -ForegroundColor Cyan
Write-Host "  Vercel: $vercelCount" -ForegroundColor Cyan
Write-Host "  GitHub: $githubCount (source of truth)" -ForegroundColor Green

# Sync status
if ($renderCount -eq $vercelCount -and $vercelCount -eq $githubCount) {
    Write-Host "`n✅ ALL IN SYNC!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  OUT OF SYNC!" -ForegroundColor Red
    if ($renderCount -ne $githubCount) { 
        Write-Host "  Render diff: $($renderCount - $githubCount)" -ForegroundColor Yellow
    }
    if ($vercelCount -ne $githubCount) { 
        Write-Host "  Vercel diff: $($vercelCount - $githubCount)" -ForegroundColor Yellow
    }
}

# Check Mirror's Edge Catalyst
Write-Host "`nMirror's Edge Catalyst:" -ForegroundColor Yellow
$renderCat = if ($render.gameCategories.mirrorsedgecatalyst) { $render.gameCategories.mirrorsedgecatalyst } else { "NEW" }
$vercelCat = if ($vercel.gameCategories.mirrorsedgecatalyst) { $vercel.gameCategories.mirrorsedgecatalyst } else { "NEW" }
Write-Host "  Render: $renderCat" -ForegroundColor Cyan
Write-Host "  Vercel: $vercelCat" -ForegroundColor Cyan

# Last updates
Write-Host "`nLast updated:" -ForegroundColor Yellow
Write-Host "  Render: $($render.lastUpdated)" -ForegroundColor Cyan
Write-Host "  Vercel: $($vercel.lastUpdated)" -ForegroundColor Cyan
