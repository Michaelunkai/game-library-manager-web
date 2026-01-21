#!/usr/bin/env python3
"""
Fetch HowLongToBeat times for all missing games.
Uses HowLongToBeat website to get actual game completion times.
"""

import json
import requests
import time
import sys
from typing import Dict, Optional, List
import re

# HowLongToBeat search API
HLTB_SEARCH_URL = "https://howlongtobeat.com/api/search"


def clean_game_name(name: str) -> str:
    """Clean game name for better search results."""
    # Remove common suffixes that might interfere with search
    suffixes = [
        r"gameoftheyearedition",
        r"goty",
        r"deluxe",
        r"complete",
        r"edition",
        r"remastered",
        r"enhanced",
        r"definitive",
        r"remarstered",
        r"remake",
        r"collection",
        r"pack",
        r"bundle",
    ]

    cleaned = name.lower()

    # Remove suffixes
    for suffix in suffixes:
        cleaned = re.sub(suffix + r"$", "", cleaned)

    # Replace common patterns
    replacements = {
        "vs": " vs ",
        "and": " and ",
        "of": " of ",
        "the": " the ",
        "gta": "grand theft auto",
        "cod": "call of duty",
        "bf": "battlefield",
        "tes": "the elder scrolls",
        "fallout4": "fallout 4",
        "fallout3": "fallout 3",
        "fallout2": "fallout 2",
        "fallout1": "fallout 1",
    }

    for old, new in replacements.items():
        cleaned = cleaned.replace(old, new)

    # Add spaces between words (for camelCase)
    cleaned = re.sub(r"([a-z])([A-Z])", r"\1 \2", cleaned)

    # Remove numbers at the end that might be versions
    cleaned = re.sub(r"\d+$", "", cleaned).strip()

    # Clean up extra spaces
    cleaned = " ".join(cleaned.split())

    return cleaned


def search_hltb(query: str) -> Optional[float]:
    """Search HowLongToBeat for a game and return main story time."""
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
        "Content-Type": "application/json",
        "Referer": "https://howlongtobeat.com",
        "Origin": "https://howlongtobeat.com",
    }

    payload = {
        "searchType": "games",
        "searchTerms": [query],
        "searchPage": 1,
        "size": 20,
        "searchOptions": {
            "games": {
                "userId": 0,
                "platform": "",
                "sortCategory": "popular",
                "rangeCategory": "main",
                "rangeTime": {"min": 0, "max": 0},
                "gameplay": {"perspective": "", "flow": "", "genre": ""},
                "modifier": "",
            },
            "users": {"sortCategory": "postcount"},
            "filter": "",
            "sort": 0,
            "randomizer": 0,
        },
    }

    try:
        response = requests.post(
            HLTB_SEARCH_URL, json=payload, headers=headers, timeout=10
        )
        response.raise_for_status()
        data = response.json()

        games = data.get("data", [])
        if not games:
            return None

        # Find the best match
        for game in games:
            game_name = game.get("game_name", "").lower()

            # Check if this is a good match
            if query.lower() in game_name or game_name in query.lower():
                # Get main story time (comp_main)
                main_time = game.get("comp_main", 0)
                if main_time > 0:
                    # Convert from seconds to hours
                    hours = main_time / 3600
                    return round(hours, 1)

        # If no exact match, use the first result's main time
        first_game = games[0]
        main_time = first_game.get("comp_main", 0)
        if main_time > 0:
            hours = main_time / 3600
            return round(hours, 1)

        return None

    except Exception as e:
        print(f"Error searching for '{query}': {e}")
        return None


def get_fallback_time(game_id: str) -> float:
    """Get a reasonable fallback time based on game type/name."""
    game_id_lower = game_id.lower()

    # System/utility programs
    if any(
        word in game_id_lower
        for word in [
            "ubuntu",
            "server",
            "installer",
            "utility",
            "nvidia",
            "driver",
            "office",
            "winrar",
            "chrome",
            "firefox",
            "steam",
            "epic",
        ]
    ):
        return 0.5  # 30 minutes for utilities

    # Racing games
    if any(
        word in game_id_lower
        for word in [
            "racing",
            "forza",
            "need",
            "speed",
            "dirt",
            "grid",
            "f1",
            "formula",
            "burnout",
        ]
    ):
        return 12  # Average racing game

    # Fighting games
    if any(
        word in game_id_lower
        for word in ["fighter", "kombat", "tekken", "street", "mortal", "injustice"]
    ):
        return 8  # Fighting games are shorter

    # Sports games
    if any(
        word in game_id_lower
        for word in [
            "fifa",
            "nba",
            "nfl",
            "soccer",
            "football",
            "basketball",
            "tennis",
            "golf",
        ]
    ):
        return 10  # Sports career modes

    # Puzzle games
    if any(word in game_id_lower for word in ["puzzle", "tetris", "portal", "witness"]):
        return 6  # Puzzle games

    # RPGs
    if any(
        word in game_id_lower
        for word in [
            "rpg",
            "elder",
            "scrolls",
            "fallout",
            "witcher",
            "final",
            "fantasy",
            "dragon",
            "age",
            "mass",
            "effect",
            "baldurs",
        ]
    ):
        return 45  # RPGs are long

    # Strategy games
    if any(
        word in game_id_lower
        for word in [
            "civilization",
            "total",
            "war",
            "age",
            "empires",
            "crusader",
            "europa",
            "hearts",
            "iron",
        ]
    ):
        return 35  # Strategy games

    # Action/Adventure
    if any(
        word in game_id_lower
        for word in [
            "assassin",
            "creed",
            "gta",
            "grand",
            "theft",
            "auto",
            "batman",
            "tomb",
            "raider",
            "uncharted",
        ]
    ):
        return 25  # Action-adventure

    # Shooters
    if any(
        word in game_id_lower
        for word in [
            "call",
            "duty",
            "battlefield",
            "halo",
            "doom",
            "quake",
            "counter",
            "strike",
            "overwatch",
        ]
    ):
        return 8  # Shooter campaigns

    # Indie games
    if any(
        word in game_id_lower
        for word in ["indie", "pixel", "bit", "retro", "celeste", "hollow", "knight"]
    ):
        return 15  # Indie games vary

    # Horror games
    if any(
        word in game_id_lower
        for word in ["horror", "evil", "dead", "resident", "silent", "hill", "outlast"]
    ):
        return 12  # Horror games

    # Default for unknown games
    return 18  # Average game length


def main():
    print("=" * 60)
    print("HowLongToBeat Time Fetcher")
    print("=" * 60)

    # Load existing data
    try:
        with open("public/data/games.json", "r") as f:
            games = json.load(f)
    except FileNotFoundError:
        print("Error: games.json not found!")
        sys.exit(1)

    try:
        with open("public/data/times.json", "r") as f:
            existing_times = json.load(f)
    except FileNotFoundError:
        existing_times = {}

    # Find games missing time data
    game_ids = {game["id"] for game in games}
    existing_game_ids = set(existing_times.keys())
    missing_game_ids = game_ids - existing_game_ids

    print(f"Total games: {len(game_ids)}")
    print(f"Games with existing times: {len(existing_game_ids)}")
    print(f"Games missing time data: {len(missing_game_ids)}")

    if not missing_game_ids:
        print("All games already have time data!")
        return

    # Create game ID to name mapping
    id_to_name = {game["id"]: game["name"] for game in games}

    # Process missing games
    new_times = existing_times.copy()
    success_count = 0
    fallback_count = 0

    for i, game_id in enumerate(missing_game_ids, 1):
        game_name = id_to_name.get(game_id, game_id)
        cleaned_name = clean_game_name(game_name)

        print(f"[{i}/{len(missing_game_ids)}] Searching: {game_name} -> {cleaned_name}")

        # Try to get time from HLTB
        hltb_time = search_hltb(cleaned_name)

        if hltb_time:
            new_times[game_id] = hltb_time
            success_count += 1
            print(f"  ✓ Found: {hltb_time} hours")
        else:
            # Use fallback
            fallback_time = get_fallback_time(game_id)
            new_times[game_id] = fallback_time
            fallback_count += 1
            print(f"  → Fallback: {fallback_time} hours")

        # Rate limiting
        time.sleep(1)  # Be nice to HLTB servers

    # Save updated times
    with open("public/data/times.json", "w") as f:
        json.dump(new_times, f, indent=4, sort_keys=True)

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  - HLTB matches found: {success_count}")
    print(f"  - Fallback times used: {fallback_count}")
    print(f"  - Total games with times: {len(new_times)}")
    print(f"  - times.json updated successfully!")
    print("=" * 60)


if __name__ == "__main__":
    main()
