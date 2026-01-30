# Game Library Manager v5.0 - Web App

A full-featured web application for managing and running Docker-based games from the `michadockermisha/backup` repository.

## Live Demo

**[https://game-library-manager-web.onrender.com/](https://game-library-manager-web.onrender.com/)**

## Features

- **928+ Games** from Docker Hub `michadockermisha/backup` repo
- **29 Categories** with filtering and sorting
- **Bulk Selection** - Select multiple games and run all at once
- **Custom Mount Path** - Set your game download directory (any path works!)
- **Multi-format Scripts** - Download .BAT (Windows), .PS1 (PowerShell), or .SH (Linux/Mac)
- **Real-time Progress** - See every file being copied during extraction
- **Single-phase Processing** - Each game: Pull → Extract → Next (no waiting for all pulls)
- **Auto-retry & Recovery** - Automatic Docker recovery and retry on failures
- **HLTB Times** - HowLongToBeat completion time estimates
- **Dark/Light Theme** - Toggle between themes
- **Search** - Find games by name, ID, or category (Ctrl+K)
- **Sort Options** - Name, Time, Category (ascending/descending)
- **Settings Export/Import** - Save and restore your preferences

## How It Works

1. Browse and select games from the library
2. Set your destination path (e.g., `E:/Games`, `D:/MyGames`)
3. Click "Run Selected" to download a script (.BAT, .PS1, or .SH)
4. Run the script - each game will be:
   - **Pulled** from Docker Hub
   - **Extracted** to your destination folder with real-time progress
   - **Verified** with file listing and total size

## Script Output Example

```
############################################################
 GAME 1/4: Arc Runner
############################################################
[STEP 1/2] Pulling Docker image for Arc Runner...
[OK] Image pulled successfully!

[STEP 2/2] Extracting files to: E:/Games/ArcRunner

[ATTEMPT 1/3] Running extraction container...

=== CONTAINER STARTED ===
Copying game files to /output/ArcRunner...
'/home/ArcRunner.exe' -> '/output/ArcRunner/ArcRunner.exe'
'/home/data/' -> '/output/ArcRunner/data/'
'/home/data/game.pak' -> '/output/ArcRunner/data/game.pak'
...

=== COPY COMPLETE ===
total 5.2G
-rwxr-xr-x 1 root root 156M ArcRunner.exe
drwxr-xr-x 2 root root 4096 data/

Total size: 5.2G

============================================================
[SUCCESS] Arc Runner extracted successfully!
[SAVED TO] E:/Games/ArcRunner
============================================================

[NEXT] Moving to next game in 3 seconds...
```

## Docker Command Format

The app generates Docker commands that:
1. Mount your chosen folder to `/output` inside the container
2. Copy game files with verbose output
3. Show file listing and total size after extraction

```bash
docker run -v "E:/Games:/output" --rm --name ArcRunner michadockermisha/backup:ArcRunner sh -c "mkdir -p /output/ArcRunner && cp -rv /home/* /output/ArcRunner/"
```

## Requirements

- Docker Desktop (Windows) or Docker (Linux/Mac)
- Modern web browser

## Settings

- **Docker Hub Username**: Default `michadockermisha`
- **Repository Name**: Default `backup`
- **Mount Path**: Any valid path (e.g., `F:/Games`, `E:/MyGames`, `/home/user/games`)

## Changelog

### v5.0
- **Single-phase processing**: Each game is fully processed (pull + extract) before moving to next
- **Real-time file copy progress**: See every file being copied with `cp -rv`
- **Fixed Docker mount syntax**: Works with any Windows/Linux/Mac path
- **Better error handling**: Retry logic with Docker recovery
- **Clearer output**: File listing and total size after each extraction

### v4.0
- Added .BAT and .PS1 download options
- Added bulk selection
- Added Docker recovery functions

### v3.5
- Initial web version

## Source

Based on the PyQt desktop application [Game Library Manager](https://github.com/Michaelunkai/game-library-manager-web)

## License

MIT
