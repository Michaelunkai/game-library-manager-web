# Comprehensive tab-by-tab verification between Render and Vercel

Write-Host "`n🔍 CHECKING EVERY TAB ON BOTH SITES..." -ForegroundColor Cyan
Write-Host "======================================" -ForegroundColor Cyan

# Fetch games and admin configs
$renderGames = Invoke-RestMethod 'https://game-library-manager-web.onrender.com/data/games.json'
$vercelGames = Invoke-RestMethod 'https://game-library-manager-web.vercel.app/data/games.json'
$renderConfig = Invoke-RestMethod 'https://game-library-manager-web.onrender.com/data/admin-config.json'
$vercelConfig = Invoke-RestMethod 'https://game-library-manager-web.vercel.app/data/admin-config.json'

# Get all unique categories from both sites
$allCategories = @()
$allCategories += $renderGames | ForEach-Object { $_.category } | Select-Object -Unique
$allCategories += $vercelGames | ForEach-Object { $_.category } | Select-Object -Unique
$allCategories = $allCategories | Select-Object -Unique | Sort-Object

# Tab display names
$tabNames = @{
    'new' = '🆕 NEW'
    'action' = '⚔️ Action'
    'platformers' = '🏃 Platformers'
    'shooters' = '🔫 Shooters'
    'rpg' = '🗡️ RPG'
    'soulslike' = '💀 SoulsLike'
    'storydriven' = '📖 StoryDriven'
    'nintendo/switch' = '🎮 Nintendo/Switch'
    'simulators' = '🚜 Simulators'
    'localcoop' = '👥 LocalCoop'
    'hacknslash' = '⚡ HackNslash'
    'sidescroller' = '➡️ SideScroller'
    'strategy' = '♟️ Strategy'
    'puzzles' = '🧩 Puzzles'
    'fighting' = '🥊 Fighting'
    'racing' = '🏎️ Racing'
    'sports' = '⚽ Sports'
    'roguelike' = '🎲 Roguelike'
    'horrors' = '👻 Horrors'
    'metroidvania' = '🗺️ Metroidvania'
    'remasters' = '✨ Remasters'
    'sandbox' = '🏖️ Sandbox'
    'moba' = '🎯 Moba'
    'pointnclick' = '👆 PointNClick'
    'not_for_me' = '❌ Not For Me'
    'finished' = '✅ Finished'
    'mybackup' = '💾 MyBackup'
    'oporationsystems' = '💻 OperationSystems'
    'music' = '🎵 Music'
    'win11maintaince' = '🔧 Win11Maintaince'
    '3th_party_tools' = '🛠️ 3th Party Tools'
    'gamedownloaders' = '📥 GameDownloaders'
}

Write-Host "`n📊 TAB-BY-TAB COMPARISON:" -ForegroundColor Yellow

$mismatchFound = $false
$totalRenderGames = 0
$totalVercelGames = 0

foreach ($category in $allCategories) {
    $renderCount = @($renderGames | Where-Object { $_.category -eq $category }).Count
    $vercelCount = @($vercelGames | Where-Object { $_.category -eq $category }).Count
    
    $totalRenderGames += $renderCount
    $totalVercelGames += $vercelCount
    
    $tabName = if ($tabNames[$category]) { $tabNames[$category] } else { $category }
    
    if ($renderCount -eq $vercelCount) {
        Write-Host "  $tabName : " -NoNewline
        Write-Host "$renderCount games " -ForegroundColor Green -NoNewline
        Write-Host "✅"
    } else {
        Write-Host "  $tabName : " -NoNewline
        Write-Host "Render=$renderCount" -ForegroundColor Red -NoNewline
        Write-Host " vs " -NoNewline
        Write-Host "Vercel=$vercelCount" -ForegroundColor Red -NoNewline
        Write-Host " ❌ MISMATCH!"
        $mismatchFound = $true
    }
}

Write-Host "`n📈 TOTAL GAMES:" -ForegroundColor Yellow
Write-Host "  Render: $totalRenderGames games"
Write-Host "  Vercel: $totalVercelGames games"

if ($totalRenderGames -eq $totalVercelGames) {
    Write-Host "  Status: " -NoNewline
    Write-Host "EQUAL ✅" -ForegroundColor Green
} else {
    Write-Host "  Status: " -NoNewline
    Write-Host "DIFFERENT ❌" -ForegroundColor Red
    Write-Host "  Difference: " -NoNewline
    Write-Host "$($totalRenderGames - $totalVercelGames) games" -ForegroundColor Yellow
}

# Check admin config sync
Write-Host "`n🔐 ADMIN CONFIG:" -ForegroundColor Yellow
$renderCatCount = @($renderConfig.gameCategories.PSObject.Properties).Count
$vercelCatCount = @($vercelConfig.gameCategories.PSObject.Properties).Count

Write-Host "  Categorized games in admin config:"
Write-Host "    Render: $renderCatCount"
Write-Host "    Vercel: $vercelCatCount"

if ($renderCatCount -eq $vercelCatCount) {
    Write-Host "    Status: " -NoNewline
    Write-Host "SYNCED ✅" -ForegroundColor Green
} else {
    Write-Host "    Status: " -NoNewline
    Write-Host "OUT OF SYNC ❌" -ForegroundColor Red
}

# Final verdict
Write-Host "`n📋 FINAL VERDICT:" -ForegroundColor Cyan
if (-not $mismatchFound -and $totalRenderGames -eq $totalVercelGames) {
    Write-Host "✅ ALL TABS ARE PERFECTLY SYNCED!" -ForegroundColor Green
    Write-Host "Every tab on Vercel has the same games as Render." -ForegroundColor Green
} else {
    Write-Host "❌ SYNC ISSUES DETECTED!" -ForegroundColor Red
    Write-Host "Some tabs have different game counts between sites." -ForegroundColor Yellow
    Write-Host "`nTO FIX: Make a small change on Render admin panel" -ForegroundColor Yellow
    Write-Host "and wait 2-5 minutes for GitHub sync to propagate." -ForegroundColor Yellow
}