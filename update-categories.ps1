$ErrorActionPreference = "Stop"

# Read current admin config
$configPath = ".\data\admin-config.json"
$config = Get-Content $configPath -Raw | ConvertFrom-Json

# Read categorization mappings
$categorizePath = ".\categorize-new-games.json"
$newCategories = Get-Content $categorizePath -Raw | ConvertFrom-Json

# Update game categories
$newCategories.PSObject.Properties | ForEach-Object {
    $gameId = $_.Name
    $newCategory = $_.Value
    # Add or update the property
    if ($config.gameCategories.PSObject.Properties.Name -contains $gameId) {
        $config.gameCategories.$gameId = $newCategory
    } else {
        $config.gameCategories | Add-Member -Name $gameId -Value $newCategory -MemberType NoteProperty -Force
    }
    Write-Host "Moved $gameId -> $newCategory" -ForegroundColor Green
}

# Update timestamp
$config.lastUpdated = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

# Save updated config
$config | ConvertTo-Json -Depth 10 | Set-Content $configPath -Encoding UTF8
Write-Host "`nUpdated admin-config.json" -ForegroundColor Cyan

# Count games moved
$movedCount = ($newCategories.PSObject.Properties | Measure-Object).Count
Write-Host "Total games categorized: $movedCount" -ForegroundColor Yellow
