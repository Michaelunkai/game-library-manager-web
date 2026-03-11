# Monitor Game Library Manager Deployment Synchronization
# Continuously checks if Render and Vercel deployments are in sync

param(
    [int]$CheckIntervalMinutes = 5,
    [switch]$AutoSync = $false,
    [string]$PreferredSource = "render"  # "render" or "vercel"
)

$renderUrl = "https://game-library-manager-web.onrender.com"
$vercelUrl = "https://game-library-manager-web.vercel.app"
$adminToken = "glm-admin-2024"

Write-Host "=== Game Library Manager Sync Monitor ===" -ForegroundColor Cyan
Write-Host "Check interval: $CheckIntervalMinutes minutes"
Write-Host "Auto-sync: $(if ($AutoSync) { 'ENABLED' } else { 'DISABLED' })"
if ($AutoSync) {
    Write-Host "Preferred source: $PreferredSource"
}
Write-Host "Press Ctrl+C to stop monitoring"
Write-Host ""

# Function to fetch admin config
function Get-AdminConfig {
    param($url)
    
    try {
        $headers = @{
            "X-Admin-Token" = $adminToken
        }
        
        $response = Invoke-RestMethod -Uri "$url/api/admin-config" -Headers $headers -Method GET -TimeoutSec 10
        return $response
    }
    catch {
        return $null
    }
}

# Function to sync configurations
function Sync-Deployments {
    param(
        [string]$sourceUrl,
        [string]$targetUrl,
        [object]$sourceConfig
    )
    
    $headers = @{
        "X-Admin-Token" = $adminToken
        "Content-Type" = "application/json"
    }
    
    $body = @{
        gameCategories = $sourceConfig.gameCategories
        hiddenTabs = $sourceConfig.hiddenTabs
    } | ConvertTo-Json -Depth 10
    
    try {
        $response = Invoke-RestMethod -Uri "$targetUrl/api/admin-config" -Headers $headers -Method POST -Body $body -TimeoutSec 30
        return $true
    }
    catch {
        Write-Host "Sync error: $_" -ForegroundColor Red
        return $false
    }
}

$checkCount = 0
$lastSyncIssue = $null

while ($true) {
    $checkCount++
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    
    Write-Host "[$timestamp] Check #$checkCount" -ForegroundColor Gray
    
    # Fetch configurations
    $renderConfig = Get-AdminConfig $renderUrl
    $vercelConfig = Get-AdminConfig $vercelUrl
    
    if (-not $renderConfig -or -not $vercelConfig) {
        Write-Host "  ⚠ Failed to fetch one or both configurations" -ForegroundColor Yellow
        if (-not $renderConfig) { Write-Host "    - Render: FAILED" -ForegroundColor Red }
        if (-not $vercelConfig) { Write-Host "    - Vercel: FAILED" -ForegroundColor Red }
    }
    else {
        # Compare configurations
        $renderCategories = $renderConfig.gameCategories | ConvertTo-Json -Depth 10
        $vercelCategories = $vercelConfig.gameCategories | ConvertTo-Json -Depth 10
        
        $renderHidden = $renderConfig.hiddenTabs | ConvertTo-Json -Depth 10
        $vercelHidden = $vercelConfig.hiddenTabs | ConvertTo-Json -Depth 10
        
        $categoriesMatch = $renderCategories -eq $vercelCategories
        $hiddenMatch = $renderHidden -eq $vercelHidden
        
        $renderCount = ($renderConfig.gameCategories | Get-Member -MemberType NoteProperty).Count
        $vercelCount = ($vercelConfig.gameCategories | Get-Member -MemberType NoteProperty).Count
        
        if ($categoriesMatch -and $hiddenMatch) {
            Write-Host "  ✓ Deployments are in sync (Render: $renderCount games, Vercel: $vercelCount games)" -ForegroundColor Green
            $lastSyncIssue = $null
        }
        else {
            $currentIssue = "Categories: $(if ($categoriesMatch) { 'OK' } else { 'MISMATCH' }), Hidden: $(if ($hiddenMatch) { 'OK' } else { 'MISMATCH' })"
            
            if ($currentIssue -ne $lastSyncIssue) {
                Write-Host "  ✗ Deployments OUT OF SYNC!" -ForegroundColor Red
                Write-Host "    - Render: $renderCount categorized games"
                Write-Host "    - Vercel: $vercelCount categorized games"
                Write-Host "    - $currentIssue"
                
                if ($AutoSync) {
                    Write-Host "  🔄 Auto-syncing from $PreferredSource..." -ForegroundColor Yellow
                    
                    $success = $false
                    if ($PreferredSource -eq "render") {
                        $success = Sync-Deployments -sourceUrl $renderUrl -targetUrl $vercelUrl -sourceConfig $renderConfig
                        if ($success) {
                            Write-Host "  ✓ Successfully synced Render → Vercel" -ForegroundColor Green
                        }
                    }
                    else {
                        $success = Sync-Deployments -sourceUrl $vercelUrl -targetUrl $renderUrl -sourceConfig $vercelConfig
                        if ($success) {
                            Write-Host "  ✓ Successfully synced Vercel → Render" -ForegroundColor Green
                        }
                    }
                    
                    if ($success) {
                        Write-Host "  📝 Note: GitHub webhook will trigger redeployment in 2-5 minutes" -ForegroundColor Cyan
                    }
                }
                else {
                    Write-Host "  💡 Run with -AutoSync to automatically sync deployments" -ForegroundColor Yellow
                }
                
                $lastSyncIssue = $currentIssue
            }
            else {
                Write-Host "  ✗ Still out of sync (same issue as before)" -ForegroundColor DarkYellow
            }
        }
    }
    
    # Wait for next check
    Write-Host ""
    Start-Sleep -Seconds ($CheckIntervalMinutes * 60)
}