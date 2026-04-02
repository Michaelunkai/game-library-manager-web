# Game Library Manager — Image Maintenance Guide

## Overview

Game cover images live in `docs/images/`. The app resolves images by converting `game.id` to lowercase and looking for `{id}.png`.

**Example:** game id `driversanfrancisco` → `docs/images/driversanfrancisco.png`

---

## Finding Missing Images

Run this PowerShell one-liner from the project root:

```powershell
$games = Get-Content "docs/data/games.json" | ConvertFrom-Json
$images = Get-ChildItem "docs/images" | Select-Object -ExpandProperty BaseName
$missing = $games | Where-Object { $images -notcontains $_.id.ToLower() }
Write-Host "Missing: $($missing.Count) games"
$missing | ForEach-Object { "$($_.id) — $($_.name) [$($_.category)]" }
```

---

## Image Specs

| Property | Value |
|----------|-------|
| Format   | PNG   |
| Size     | 460 × 215 px (recommended) |
| Naming   | `{game.id.toLowerCase()}.png` |
| Location | `docs/images/` |

---

## Sourcing Real Cover Art

For actual games, prefer images from these sources (in order):

1. **SteamGridDB** — https://www.steamgriddb.com/  
   Search by game name → download "grid" image (460×215)

2. **Steam CDN** (for Steam games)  
   `https://cdn.cloudflare.steamstatic.com/steam/apps/{appid}/header.jpg`

3. **IGDB / Giant Bomb** — for older or non-Steam titles

4. **Official game website** — press kit / media assets

Resize/convert to PNG at 460×215 before saving.

---

## Generating Placeholder Images

Use the included PowerShell script to generate placeholder images (dark background + game title text):

```powershell
# Edit generate-placeholders.ps1 to add your games, then:
.\generate-placeholders.ps1
```

Or generate a single placeholder inline:

```powershell
Add-Type -AssemblyName System.Drawing
$bmp = New-Object System.Drawing.Bitmap(460, 215)
$g = [System.Drawing.Graphics]::FromImage($bmp)
$g.Clear([System.Drawing.Color]::FromArgb(31, 41, 55))
$bmp.Save("docs/images/yourgameid.png", [System.Drawing.Imaging.ImageFormat]::Png)
```

---

## Image Update History

### 2026-03-19 — 11 placeholder images created (Agent 7)

The following entries had no image and received dark-background placeholder PNGs:

| Game ID | Display Name | Category | Type |
|---------|-------------|----------|------|
| `speedtest` | Speedtest | new | tool/utility |
| `test-push` | Test Push | new | test entry |
| `windowsapps-cache` | WindowsApps Cache | new | cache entry |
| `wsl-cache` | WSL Cache | new | cache entry |
| `displaydriveruninstaller` | Display Driver Uninstaller | win11maintaince | tool |
| `hydra` | Hydra | gamedownloaders | tool |
| `mygdocker` | MyGDocker | 3th_party_tools | tool |
| `ccleaner` | CCleaner | win11maintaince | tool |
| `driverbooster` | Driver Booster | win11maintaince | tool |
| `win11drivers` | Win 11 Drivers | oporationsystems | tool |
| `driversanfrancisco` | Driver: San Francisco | racing | game ⚠️ |

**Note:** `driversanfrancisco` (Driver: San Francisco) is an actual game — real cover art should be sourced from SteamGridDB or the Ubisoft press kit and replace the placeholder.

**Source:** System.Drawing placeholder generation (PowerShell)  
**Image spec:** 460×215 PNG, solid `#1f2937` background

---

### 2026-02-24 — Audit report generated (image-audit-report.json)

Identified 15 games with no image, 14 orphaned image files. Some were resolved between audit and 2026-03-19.

Notable previously resolved games (had images added between audit and this update):
- Mewgenics, Rayman 30th Anniversary Edition, 911 Operator, Pepper Grinder, Harold Halibut, Sonic Frontiers, Metal Gear Solid 3, Cairn, Metal Gear Rising, Bayonetta, High on Life 2, Ninja Gaiden 2 Black, The Witcher 3

---

## Orphaned Images (Safe to Delete)

These image files exist but have no matching game in `games.json`:

| File | Was | Status |
|------|-----|--------|
| `batmantheenemywithin.png` | Batman The Enemy Within | game removed |
| `batmanthetelltaleseries.png` | Batman The Telltale Series | game removed |
| `brotherstaleoftwosons.png` | Brothers A Tale of Two Sons | game removed |
| `callofdutymodernwarfare.png` | Call of Duty Modern Warfare | game removed |
| `callofdutymodernwarfare3.png` | Call of Duty Modern Warfare 3 | game removed |
| `codinfininitewarfare.png` | COD Infinite Warfare | game removed |
| `fireemblemengage.png` | Fire Emblem Engage | game removed |
| `fireemblemwarriors3hopes.png` | Fire Emblem Warriors 3 Hopes | game removed |
| `ftlfasterthanlight.png` | FTL Faster Than Light | game removed |
| `grandtheftautoiv.png` | Grand Theft Auto IV | game removed |
| `llama31.png` | Llama 3.1 | non-game entry removed |
| `rimworld.png` | RimWorld | game removed |
| `thesims4.png` | The Sims 4 | game removed |
| `thecastingoffrankston.png` | The Casting of Frank Stone | typo — correct is `thecastingoffrankstone.png` |

---

## Routine Maintenance Checklist

Run monthly or after adding new games to `games.json`:

1. **Find missing images** — run the PowerShell snippet above
2. **Source real art** for actual games (SteamGridDB first)
3. **Generate placeholders** for tools/utilities (run `generate-placeholders.ps1`)
4. **Remove orphaned images** if disk space is a concern
5. **Update this guide** with date + what was changed
