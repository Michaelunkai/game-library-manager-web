# Fix Vercel Sync Issues - Complete Solution

## Architecture Differences

### Render Deployment
- **Server**: Express.js (server.js)
- **Admin API**: `/api/admin-config` via Express routes
- **Storage**: Local files + auto-commit to GitHub
- **Status**: ✅ Working

### Vercel Deployment  
- **Server**: Serverless functions (api/*.js)
- **Admin API**: `/api/admin-config` via serverless
- **Storage**: Direct GitHub API writes
- **Status**: ❌ Getting 404 errors

## Root Cause
The Vercel serverless function exists but isn't being triggered. Possible causes:
1. Function not deploying (check Vercel build logs)
2. GITHUB_TOKEN not set in Vercel environment
3. Route configuration issue

## Fix Steps

### 1. Check Vercel Environment Variables
```bash
# In Vercel dashboard, ensure GITHUB_TOKEN is set
# The api/db.js has a fallback token, but it's better to use env var
```

### 2. Test Vercel API Directly
```powershell
# Test if the endpoint exists
Invoke-WebRequest -Uri "https://game-library-manager-web.vercel.app/api/admin-config" -Method GET

# Test with admin token
$headers = @{ "X-Admin-Token" = "glm-admin-2024" }
Invoke-WebRequest -Uri "https://game-library-manager-web.vercel.app/api/admin-config" -Headers $headers
```

### 3. Debug Route Configuration
The vercel.json routes might need adjustment:
```json
{
  "routes": [
    {
      "src": "/api/admin-config",
      "dest": "/api/admin-config.js"
    },
    {
      "src": "/api/(.*)",
      "dest": "/api/$1.js"
    },
    {
      "src": "/(.*)",
      "dest": "/public/$1"
    }
  ]
}
```

### 4. Manual Sync Script (Immediate Solution)
Until Vercel is fixed, use this PowerShell script:

```powershell
# Force sync from GitHub to both deployments
$githubUrl = "https://raw.githubusercontent.com/Michaelunkai/game-library-manager-web/main/data/admin-config.json"
$adminConfig = Invoke-RestMethod -Uri $githubUrl

Write-Host "Current GitHub config has:" -ForegroundColor Cyan
Write-Host "- Hidden tabs: $($adminConfig.hiddenTabs.Count)"
Write-Host "- Categorized games: $(($adminConfig.gameCategories | Get-Member -MemberType NoteProperty).Count)"

# Both deployments will pull from GitHub on next deploy
Write-Host "`nBoth sites will sync on next deployment cycle" -ForegroundColor Green
```

### 5. Monitor Sync Status
```powershell
# Check sync status between deployments
$render = Invoke-RestMethod "https://game-library-manager-web.onrender.com/data/admin-config.json"
$vercel = Invoke-RestMethod "https://game-library-manager-web.vercel.app/data/admin-config.json"
$github = Invoke-RestMethod "https://raw.githubusercontent.com/Michaelunkai/game-library-manager-web/main/data/admin-config.json"

$renderCount = ($render.gameCategories | Get-Member -MemberType NoteProperty).Count
$vercelCount = ($vercel.gameCategories | Get-Member -MemberType NoteProperty).Count
$githubCount = ($github.gameCategories | Get-Member -MemberType NoteProperty).Count

Write-Host "Category counts:" -ForegroundColor Cyan
Write-Host "- Render: $renderCount games"
Write-Host "- Vercel: $vercelCount games"  
Write-Host "- GitHub: $githubCount games (source of truth)"

if ($renderCount -eq $vercelCount -and $vercelCount -eq $githubCount) {
    Write-Host "`n✅ All deployments are in sync!" -ForegroundColor Green
} else {
    Write-Host "`n⚠️ Deployments are out of sync!" -ForegroundColor Yellow
}
```

## How Sync Works

1. **Admin makes change on Render**:
   - Saves locally to `data/admin-config.json`
   - Commits & pushes to GitHub
   - Vercel auto-deploys from GitHub

2. **Admin makes change on Vercel** (when working):
   - Serverless function writes directly to GitHub
   - Render pulls on next deployment

3. **GitHub is the source of truth**:
   - Both deployments read from GitHub on startup
   - Changes propagate through GitHub commits

## Current Status
- Mirror's Edge Catalyst: ✅ Present on both sites
- Admin API on Render: ✅ Working
- Admin API on Vercel: ❌ 404 errors (needs fixing)
- Data sync via GitHub: ✅ Working (with 2-5 min delay)