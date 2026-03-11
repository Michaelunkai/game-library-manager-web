# Check sync status between Render, Vercel, and GitHub deployments

Write-Host "`nChecking Game Library Manager sync status..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

try {
    # Fetch configurations from all sources
    $render = Invoke-RestMethod -Uri 'https://game-library-manager-web.onrender.com/data/admin-config.json' -UseBasicParsing
    $vercel = Invoke-RestMethod -Uri 'https://game-library-manager-web.vercel.app/data/admin-config.json' -UseBasicParsing
    $github = Invoke-RestMethod -Uri 'https://raw.githubusercontent.com/Michaelunkai/game-library-manager-web/main/data/admin-config.json' -UseBasicParsing

    # Count categorized games
    $renderCount = ($render.gameCategories | Get-Member -MemberType NoteProperty).Count
    $vercelCount = ($vercel.gameCategories | Get-Member -MemberType NoteProperty).Count
    $githubCount = ($github.gameCategories | Get-Member -MemberType NoteProperty).Count

    Write-Host "`nCategorized games count:" -ForegroundColor Yellow
    Write-Host "  Render: $renderCount games" -ForegroundColor Cyan
    Write-Host "  Vercel: $vercelCount games" -ForegroundColor Cyan
    Write-Host "  GitHub: $githubCount games (source of truth)" -ForegroundColor Green

    # Check if in sync
    if ($renderCount -eq $vercelCount -and $vercelCount -eq $githubCount) {
        Write-Host "`n✅ All deployments are IN SYNC!" -ForegroundColor Green
    } else {
        Write-Host "`n⚠️  Deployments are OUT OF SYNC!" -ForegroundColor Red
        
        if ($renderCount -ne $githubCount) { 
            $diff = [Math]::Abs($renderCount - $githubCount)
            $status = if($renderCount -gt $githubCount) {"ahead of"} else {"behind"}
            Write-Host "  - Render is $status GitHub by $diff games" -ForegroundColor Yellow
        }
        if ($vercelCount -ne $githubCount) { 
            $diff = [Math]::Abs($vercelCount - $githubCount)
            $status = if($vercelCount -gt $githubCount) {"ahead of"} else {"behind"}
            Write-Host "  - Vercel is $status GitHub by $diff games" -ForegroundColor Yellow
        }
    }

    # Check Mirror's Edge Catalyst specifically
    Write-Host "`nMirror's Edge Catalyst status:" -ForegroundColor Yellow
    
    $renderMirror = if ($render.gameCategories.mirrorsedgecatalyst) { 
        "Category: $($render.gameCategories.mirrorsedgecatalyst)" 
    } else { 
        "NOT CATEGORIZED (showing as NEW)" 
    }
    
    $vercelMirror = if ($vercel.gameCategories.mirrorsedgecatalyst) { 
        "Category: $($vercel.gameCategories.mirrorsedgecatalyst)" 
    } else { 
        "NOT CATEGORIZED (showing as NEW)" 
    }
    
    $githubMirror = if ($github.gameCategories.mirrorsedgecatalyst) { 
        "Category: $($github.gameCategories.mirrorsedgecatalyst)" 
    } else { 
        "NOT CATEGORIZED (showing as NEW)" 
    }
    
    Write-Host "  Render: $renderMirror" -ForegroundColor Cyan
    Write-Host "  Vercel: $vercelMirror" -ForegroundColor Cyan
    Write-Host "  GitHub: $githubMirror" -ForegroundColor Green

    # Check last update times
    Write-Host "`nLast updated:" -ForegroundColor Yellow
    if ($render.lastUpdated) { Write-Host "  Render: $($render.lastUpdated)" -ForegroundColor Cyan }
    if ($vercel.lastUpdated) { Write-Host "  Vercel: $($vercel.lastUpdated)" -ForegroundColor Cyan }
    if ($github.lastUpdated) { Write-Host "  GitHub: $($github.lastUpdated)" -ForegroundColor Green }

    # Summary
    Write-Host "`n📝 Summary:" -ForegroundColor Yellow
    Write-Host "- GitHub is the source of truth for both deployments" -ForegroundColor White
    Write-Host "- Render commits changes to GitHub, Vercel pulls from GitHub" -ForegroundColor White
    Write-Host "- Sync happens automatically within 2-5 minutes of changes" -ForegroundColor White
    
    if ($renderCount -ne $vercelCount -or $vercelCount -ne $githubCount) {
        Write-Host "`n⚡ Action needed: Wait a few minutes for auto-sync or run sync script" -ForegroundColor Yellow
    }

} catch {
    Write-Host "Error checking sync status: $($_.Exception.Message)" -ForegroundColor Red
}