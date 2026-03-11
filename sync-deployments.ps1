# Sync Game Library Manager Deployments
# Ensures Render and Vercel deployments have identical admin configurations

$renderUrl = "https://game-library-manager-web.onrender.com"
$vercelUrl = "https://game-library-manager-web.vercel.app"
$adminToken = "glm-admin-2024"

Write-Host "=== Game Library Manager Deployment Sync ===" -ForegroundColor Cyan
Write-Host ""

# Function to fetch admin config from a deployment
function Get-AdminConfig {
    param($url)
    
    try {
        $headers = @{
            "X-Admin-Token" = $adminToken
        }
        
        $response = Invoke-RestMethod -Uri "$url/api/admin-config" -Headers $headers -Method GET
        return $response
    }
    catch {
        Write-Host "Error fetching from $url : $_" -ForegroundColor Red
        return $null
    }
}

# Function to fetch games.json
function Get-GamesData {
    param($url)
    
    try {
        # Add cache-busting parameter to ensure fresh data
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $response = Invoke-RestMethod -Uri "$url/data/games.json?t=$timestamp" -Method GET
        return $response
    }
    catch {
        Write-Host "Error fetching games from $url : $_" -ForegroundColor Red
        return $null
    }
}

Write-Host "1. Fetching data from Render deployment..." -ForegroundColor Yellow
$renderConfig = Get-AdminConfig $renderUrl
$renderGames = Get-GamesData $renderUrl

Write-Host "2. Fetching data from Vercel deployment..." -ForegroundColor Yellow
$vercelConfig = Get-AdminConfig $vercelUrl
$vercelGames = Get-GamesData $vercelUrl

if (-not $renderConfig -or -not $vercelConfig) {
    Write-Host "Failed to fetch configurations. Exiting." -ForegroundColor Red
    exit 1
}

# Compare configurations
Write-Host ""
Write-Host "3. Comparing configurations..." -ForegroundColor Yellow

$renderCategories = $renderConfig.gameCategories | ConvertTo-Json -Depth 10
$vercelCategories = $vercelConfig.gameCategories | ConvertTo-Json -Depth 10

$renderHidden = $renderConfig.hiddenTabs | ConvertTo-Json -Depth 10
$vercelHidden = $vercelConfig.hiddenTabs | ConvertTo-Json -Depth 10

$categoriesMatch = $renderCategories -eq $vercelCategories
$hiddenMatch = $renderHidden -eq $vercelHidden

Write-Host ""
Write-Host "=== Comparison Results ===" -ForegroundColor Cyan
Write-Host "Game categories match: $(if ($categoriesMatch) { 'YES' } else { 'NO' })" -ForegroundColor $(if ($categoriesMatch) { 'Green' } else { 'Red' })
Write-Host "Hidden tabs match: $(if ($hiddenMatch) { 'YES' } else { 'NO' })" -ForegroundColor $(if ($hiddenMatch) { 'Green' } else { 'Red' })
Write-Host ""

# Count games in each category
$renderGameCount = ($renderConfig.gameCategories | Get-Member -MemberType NoteProperty).Count
$vercelGameCount = ($vercelConfig.gameCategories | Get-Member -MemberType NoteProperty).Count

Write-Host "Render - Categorized games: $renderGameCount"
Write-Host "Vercel - Categorized games: $vercelGameCount"
Write-Host ""

# Check specific game: Mirror's Edge Catalyst
$mirrorEdgeRender = $renderConfig.gameCategories.mirrorsedgecatalyst
$mirrorEdgeVercel = $vercelConfig.gameCategories.mirrorsedgecatalyst

Write-Host "Mirror's Edge Catalyst status:" -ForegroundColor Yellow
Write-Host "  Render: $(if ($mirrorEdgeRender) { "Category: $mirrorEdgeRender" } else { "Not categorized (NEW)" })"
Write-Host "  Vercel: $(if ($mirrorEdgeVercel) { "Category: $mirrorEdgeVercel" } else { "Not categorized (NEW)" })"
Write-Host ""

if ($categoriesMatch -and $hiddenMatch) {
    Write-Host "Both deployments are in sync!" -ForegroundColor Green
    exit 0
}

# If not in sync, show differences
Write-Host "Deployments are out of sync!" -ForegroundColor Red
Write-Host ""

# Find differences
$renderCats = $renderConfig.gameCategories | ConvertTo-Json | ConvertFrom-Json
$vercelCats = $vercelConfig.gameCategories | ConvertTo-Json | ConvertFrom-Json

Write-Host "Finding differences..." -ForegroundColor Yellow

# Games only in Render
$renderOnly = @()
foreach ($prop in ($renderCats | Get-Member -MemberType NoteProperty)) {
    $gameName = $prop.Name
    if (-not $vercelCats.$gameName) {
        $renderOnly += @{
            game = $gameName
            category = $renderCats.$gameName
        }
    }
}

# Games only in Vercel
$vercelOnly = @()
foreach ($prop in ($vercelCats | Get-Member -MemberType NoteProperty)) {
    $gameName = $prop.Name
    if (-not $renderCats.$gameName) {
        $vercelOnly += @{
            game = $gameName
            category = $vercelCats.$gameName
        }
    }
}

# Games with different categories
$different = @()
foreach ($prop in ($renderCats | Get-Member -MemberType NoteProperty)) {
    $gameName = $prop.Name
    if ($vercelCats.$gameName -and $renderCats.$gameName -ne $vercelCats.$gameName) {
        $different += @{
            game = $gameName
            renderCategory = $renderCats.$gameName
            vercelCategory = $vercelCats.$gameName
        }
    }
}

if ($renderOnly.Count -gt 0) {
    Write-Host ""
    Write-Host "Games categorized only on Render ($($renderOnly.Count)):" -ForegroundColor Yellow
    $renderOnly | ForEach-Object {
        Write-Host "  - $($_.game) → $($_.category)"
    }
}

if ($vercelOnly.Count -gt 0) {
    Write-Host ""
    Write-Host "Games categorized only on Vercel ($($vercelOnly.Count)):" -ForegroundColor Yellow
    $vercelOnly | ForEach-Object {
        Write-Host "  - $($_.game) → $($_.category)"
    }
}

if ($different.Count -gt 0) {
    Write-Host ""
    Write-Host "Games with different categories ($($different.Count)):" -ForegroundColor Yellow
    $different | ForEach-Object {
        Write-Host "  - $($_.game): Render=$($_.renderCategory), Vercel=$($_.vercelCategory)"
    }
}

Write-Host ""
Write-Host "=== Sync Options ===" -ForegroundColor Cyan
Write-Host "1. Use Render as source (copy Render → Vercel)"
Write-Host "2. Use Vercel as source (copy Vercel → Render)"
Write-Host "3. Manual sync (review each difference)"
Write-Host "4. Exit without syncing"
Write-Host ""

$choice = Read-Host "Enter your choice (1-4)"

switch ($choice) {
    "1" {
        Write-Host ""
        Write-Host "Syncing from Render to Vercel..." -ForegroundColor Yellow
        
        # Update Vercel with Render's configuration
        $headers = @{
            "X-Admin-Token" = $adminToken
            "Content-Type" = "application/json"
        }
        
        $body = @{
            gameCategories = $renderConfig.gameCategories
            hiddenTabs = $renderConfig.hiddenTabs
        } | ConvertTo-Json -Depth 10
        
        try {
            $response = Invoke-RestMethod -Uri "$vercelUrl/api/admin-config" -Headers $headers -Method POST -Body $body
            Write-Host "Successfully synced to Vercel!" -ForegroundColor Green
            Write-Host "Changes will be reflected after Vercel redeploys from GitHub (usually within 2-5 minutes)" -ForegroundColor Cyan
        }
        catch {
            Write-Host "Failed to sync: $_" -ForegroundColor Red
        }
    }
    
    "2" {
        Write-Host ""
        Write-Host "Syncing from Vercel to Render..." -ForegroundColor Yellow
        
        # Update Render with Vercel's configuration
        $headers = @{
            "X-Admin-Token" = $adminToken
            "Content-Type" = "application/json"
        }
        
        $body = @{
            gameCategories = $vercelConfig.gameCategories
            hiddenTabs = $vercelConfig.hiddenTabs
        } | ConvertTo-Json -Depth 10
        
        try {
            $response = Invoke-RestMethod -Uri "$renderUrl/api/admin-config" -Headers $headers -Method POST -Body $body
            Write-Host "Successfully synced to Render!" -ForegroundColor Green
            Write-Host "Changes will be reflected after Render redeploys from GitHub (usually within 2-5 minutes)" -ForegroundColor Cyan
        }
        catch {
            Write-Host "Failed to sync: $_" -ForegroundColor Red
        }
    }
    
    "3" {
        Write-Host ""
        Write-Host "Manual sync not implemented yet." -ForegroundColor Yellow
        Write-Host "Please use option 1 or 2 to sync deployments." -ForegroundColor Cyan
    }
    
    "4" {
        Write-Host ""
        Write-Host "Exiting without syncing." -ForegroundColor Yellow
    }
    
    default {
        Write-Host ""
        Write-Host "Invalid choice. Exiting." -ForegroundColor Red
    }
}

Write-Host ""
Write-Host "=== Important Notes ===" -ForegroundColor Cyan
Write-Host "- Both deployments auto-deploy from GitHub when changes are pushed"
Write-Host "- Admin changes on either site update the GitHub repository"
Write-Host "- Sync may take 2-5 minutes as deployments pull from GitHub"
Write-Host "- Use the admin panel (with token: $adminToken) to make changes"
Write-Host ""