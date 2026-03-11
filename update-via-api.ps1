$ErrorActionPreference = "Stop"

Write-Host "Loading categorization data..." -ForegroundColor Cyan
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

Write-Host "`nSending update to server API..." -ForegroundColor Yellow
Write-Host "Endpoint: https://game-library-manager-web.onrender.com/api/admin-config" -ForegroundColor Gray

try {
    $response = Invoke-RestMethod -Uri "https://game-library-manager-web.onrender.com/api/admin-config" `
        -Method POST `
        -Headers @{
            "Content-Type" = "application/json"
            "X-Admin-Token" = "glm-admin-2024"
        } `
        -Body $payload `
        -TimeoutSec 60

    Write-Host "`n✅ SUCCESS!" -ForegroundColor Green
    Write-Host "Server response:" -ForegroundColor Cyan
    $response | ConvertTo-Json -Depth 3
    
    Write-Host "`n📊 Updated $(($gameCategories.Keys).Count) game categories" -ForegroundColor Yellow
} catch {
    Write-Host "`n❌ ERROR:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $responseBody = $reader.ReadToEnd()
        Write-Host "Response body: $responseBody" -ForegroundColor Red
    }
}
