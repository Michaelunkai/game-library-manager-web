# Game Library Manager v3.5 - Web App

A full-featured web application for managing and running Docker-based games from the `michadockermisha/backup` repository.

## Live Demo

**[https://game-library-manager-web.onrender.com/](https://game-library-manager-web.onrender.com/)**

## Features

- **928 Games** from Docker Hub `michadockermisha/backup` repo
- **29 Categories** with filtering and sorting
- **Bulk Selection** - Select multiple games and run all at once
- **Custom Mount Path** - Set your game download directory
- **Double-click .bat Files** - Downloads Windows batch scripts that run on double-click
- **HLTB Times** - HowLongToBeat completion time estimates
- **Dark/Light Theme** - Toggle between themes
- **Search** - Find games by name, ID, or category (Ctrl+K)
- **Sort Options** - Name, Time, Category (ascending/descending)
- **Settings Export/Import** - Save and restore your preferences

## How It Works

1. Browse and select games from the library
2. Click "Select All" or click individual game cards to select
3. Click "Run Selected" to download a .bat file
4. Double-click the .bat file to run Docker and download games to your specified path

## Docker Commands

The app generates Docker commands in the format:
```bash
docker run -v "F:/:/f/" -it --rm --name <game_id> michadockermisha/backup:<game_id> sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home /f/Games/ && cd /f/Games && mv home <game_id>"
```

## Requirements

- Docker Desktop (Windows) or Docker (Linux/Mac)
- Modern web browser

## Settings

- **Docker Hub Username**: Default `michadockermisha`
- **Repository Name**: Default `backup`
- **Mount Path**: Default `F:/Games`

## Source

Based on the PyQt desktop application [Game Library Manager v3.5](https://github.com/Michaelunkai/game-library-manager-web)

## License

MIT

<!-- gitit-sync: 2026-01-22 16:39:41.052835 -->
