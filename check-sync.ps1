# Simple sync checker

$render = Invoke-RestMethod 'https://game-library-manager-web.onrender.com/data/admin-config.json'
$vercel = Invoke-RestMethod 'https://game-library-manager-web.vercel.app/data/admin-config.json'

# Get all game IDs from each
$renderGames = @($render.gameCategories.PSObject.Properties.Name)
$vercelGames = @($vercel.gameCategories.PSObject.Properties.Name)

Write-Host "`n📊 SYNC STATUS" -ForegroundColor Cyan
Write-Host "==============" -ForegroundColor Cyan
Write-Host "`nCategorized games:"
Write-Host "  Render: $($renderGames.Count)" -ForegroundColor Cyan
Write-Host "  Vercel: $($vercelGames.Count)" -ForegroundColor Cyan

# Check if identical
$identical = $renderGames.Count -eq $vercelGames.Count
if ($identical) {
    Write-Host "`n✅ BOTH SITES HAVE SAME GAME COUNT!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️  GAME COUNT MISMATCH!" -ForegroundColor Red
}

# Check Mirror's Edge
Write-Host "`nMirror's Edge Catalyst:" -ForegroundColor Yellow
$renderCat = if ($renderGames -contains 'mirrorsedgecatalyst') { 
    "Categorized as: $($render.gameCategories.mirrorsedgecatalyst)" 
} else { 
    "NOT categorized (shows as NEW)" 
}
$vercelCat = if ($vercelGames -contains 'mirrorsedgecatalyst') { 
    "Categorized as: $($vercel.gameCategories.mirrorsedgecatalyst)" 
} else { 
    "NOT categorized (shows as NEW)" 
}
Write-Host "  Render: $renderCat"
Write-Host "  Vercel: $vercelCat"

# Sync time
Write-Host "`nLast sync:" -ForegroundColor Yellow
Write-Host "  $($render.lastUpdated)"

Write-Host "`n📋 HOW IT WORKS:" -ForegroundColor Cyan
Write-Host "  1. You make changes on Render admin panel"
Write-Host "  2. Render saves to local files + commits to GitHub"
Write-Host "  3. Both sites pull from GitHub and stay synced"
Write-Host "  4. Sync delay: 2-5 minutes after changes"
