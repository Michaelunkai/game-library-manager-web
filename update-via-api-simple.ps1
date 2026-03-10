$ErrorActionPreference = "Stop"

Write-Host "Loading categorization data..."
$newCategories = Get-Content ".\categorize-new-games.json" -Raw | ConvertFrom-Json

# Convert to hashtable for API
$gameCategories = @{}
$newCategories.PSObject.Properties | ForEach-Object {
    $gameCategories[$_.Name] = $_.Value
}

# Prepare API payload
$payload = @{
    hiddenTabs = @("not_for_me", "finished", "mybackup", "oporationsystems", "music", "win11maintaince", "3th_party_tools", "gamedownloaders")
    gameCategories = $gameCategories
} | ConvertTo-Json -Depth 10

Write-Host "Sending update to server API..."
Write-Host "Endpoint: https://game-library-manager-web.onrender.com/api/admin-config"

try {
    $response = Invoke-RestMethod -Uri "https://game-library-manager-web.onrender.com/api/admin-config" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "X-Admin-Token" = "glm-admin-2024"
        } `
        -Body $payload `
        -TimeoutSec 60

    Write-Host "SUCCESS!"
    Write-Host "Server response:"
    $response | ConvertTo-Json -Depth 3
    
    Write-Host "Updated $($gameCategories.Count) game categories"
} catch {
    Write-Host "ERROR:"
    Write-Host $_.Exception.Message
}
