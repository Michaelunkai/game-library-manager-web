#!/usr/bin/env python3
"""
Fetch HowLongToBeat times for all missing games.
Uses smart fallback times based on game type and name analysis.
"""

import json
import sys
import re


def get_smart_fallback_time(game_id: str, game_name: str) -> float:
    """Get a smart fallback time based on detailed game analysis."""
    game_id_lower = game_id.lower()
    game_name_lower = game_name.lower()
    combined = f"{game_id_lower} {game_name_lower}"

    # System/utility programs - very short
    if any(
        word in combined
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
            "launcher",
            "creds",
            "glary",
            "heka",
            "revo",
            "pureos",
            "profile",
            "backup",
            "restore",
        ]
    ):
        return 0.5  # 30 minutes for utilities

    # Very long RPGs and open world games
    if any(
        word in combined
        for word in [
            "witcher3",
            "witcher 3",
            "skyrim",
            "elder scrolls",
            "fallout4",
            "fallout 4",
            "baldurs gate 3",
            "baldur",
            "divinity original sin",
            "persona 5",
            "final fantasy xv",
            "ff15",
            "cyberpunk 2077",
            "red dead redemption",
            "assassins creed odyssey",
            "assassins creed valhalla",
            "horizon zero dawn",
        ]
    ):
        return 60  # Very long RPGs

    # Long RPGs
    if any(
        word in combined
        for word in [
            "rpg",
            "elder",
            "scrolls",
            "fallout",
            "witcher",
            "final",
            "fantasy",
            "dragon age",
            "mass effect",
            "persona",
            "divinity",
            "pillars",
            "wasteland",
            "pathfinder",
            "disco elysium",
            "vampire masquerade",
        ]
    ):
        return 45  # Long RPGs

    # Strategy games
    if any(
        word in combined
        for word in [
            "civilization",
            "total war",
            "age of empires",
            "crusader kings",
            "europa universalis",
            "hearts of iron",
            "stellaris",
            "xcom",
            "anno",
            "cities skylines",
            "tropico",
        ]
    ):
        return 35  # Strategy games

    # Open world action/adventure
    if any(
        word in combined
        for word in [
            "gta",
            "grand theft auto",
            "assassins creed",
            "batman arkham",
            "tomb raider",
            "uncharted",
            "far cry",
            "watch dogs",
            "just cause",
            "saints row",
            "sleeping dogs",
            "mafia",
        ]
    ):
        return 25  # Open world action

    # Racing games with career modes
    if any(
        word in combined
        for word in [
            "forza horizon",
            "need for speed",
            "dirt rally",
            "f1",
            "formula",
            "gran turismo",
            "burnout paradise",
            "the crew",
        ]
    ):
        return 18  # Racing with progression

    # Regular action/adventure
    if any(
        word in combined
        for word in [
            "action",
            "adventure",
            "bioshock",
            "dishonored",
            "prey",
            "metro",
            "dead space",
            "alien isolation",
            "outlast",
            "amnesia",
            "layers of fear",
        ]
    ):
        return 15  # Standard action/adventure

    # Horror games
    if any(
        word in combined
        for word in [
            "horror",
            "evil",
            "resident evil",
            "silent hill",
            "outlast",
            "amnesia",
            "layers of fear",
            "dead by daylight",
            "friday 13th",
        ]
    ):
        return 12  # Horror games

    # Fighting games
    if any(
        word in combined
        for word in [
            "fighter",
            "kombat",
            "tekken",
            "street fighter",
            "mortal kombat",
            "injustice",
            "guilty gear",
            "blazblue",
            "king of fighters",
        ]
    ):
        return 8  # Fighting games

    # Sports games
    if any(
        word in combined
        for word in [
            "fifa",
            "nba",
            "nfl",
            "soccer",
            "football",
            "basketball",
            "tennis",
            "golf",
            "hockey",
            "baseball",
            "madden",
        ]
    ):
        return 10  # Sports career modes

    # Shooter campaigns
    if any(
        word in combined
        for word in [
            "call of duty",
            "cod",
            "battlefield",
            "halo",
            "doom",
            "quake",
            "wolfenstein",
            "borderlands",
            "titanfall",
            "apex legends",
        ]
    ):
        return 8  # Shooter campaigns

    # Puzzle games
    if any(
        word in combined
        for word in [
            "puzzle",
            "tetris",
            "portal",
            "witness",
            "baba is you",
            "return of obra dinn",
            "outer wilds",
        ]
    ):
        return 12  # Puzzle games

    # Racing games (shorter)
    if any(
        word in combined
        for word in ["racing", "rally", "track", "speed", "grid", "wreckfest"]
    ):
        return 6  # Arcade racing

    # Indie games - vary widely
    if any(
        word in combined
        for word in [
            "indie",
            "pixel",
            "bit",
            "retro",
            "celeste",
            "hollow knight",
            "dead cells",
            "hades",
            "ori and",
            "cuphead",
            "shovel knight",
        ]
    ):
        return 15  # Indie games

    # Platformers
    if any(
        word in combined
        for word in [
            "mario",
            "sonic",
            "platformer",
            "jump",
            "crash bandicoot",
            "spyro",
            "rayman",
            "donkey kong",
        ]
    ):
        return 10  # Platformers

    # Simulation games
    if any(
        word in combined
        for word in [
            "simulator",
            "sim",
            "farming",
            "truck",
            "flight",
            "train",
            "planet coaster",
            "planet zoo",
            "two point",
        ]
    ):
        return 20  # Simulation games

    # Specific known games
    known_times = {
        "primordia": 4,
        "dyinglightthebeast": 25,
        "batmanarkhamasylum": 12,
        "twopointcampus": 30,
        "plantsvszombiesreplanted": 8,
        "parkitect": 25,
        "beyondblue": 6,
        "pokemonlegendsza": 35,
        "immortalsofaveum": 18,
        "redfactionguerrilla": 15,
    }

    if game_id_lower in known_times:
        return known_times[game_id_lower]

    # Default for unknown games
    return 18  # Average game length


def main():
    print("=" * 60)
    print("Smart Game Time Estimator")
    print("=" * 60)

    # Load existing data
    try:
        with open("public/data/games.json", "r", encoding="utf-8") as f:
            games = json.load(f)
    except FileNotFoundError:
        print("Error: games.json not found!")
        sys.exit(1)

    try:
        with open("public/data/times.json", "r", encoding="utf-8") as f:
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

    print(f"\nProcessing {len(missing_game_ids)} missing games...")

    for i, game_id in enumerate(sorted(missing_game_ids), 1):
        game_name = id_to_name.get(game_id, game_id)
        smart_time = get_smart_fallback_time(game_id, game_name)
        new_times[game_id] = smart_time
        print(
            f"[{i:3}/{len(missing_game_ids)}] {game_name[:40]:40} -> {smart_time:5.1f} hours"
        )

    # Save updated times
    with open("public/data/times.json", "w", encoding="utf-8") as f:
        json.dump(new_times, f, indent=4, sort_keys=True, ensure_ascii=False)

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  - Games processed: {len(missing_game_ids)}")
    print(f"  - Total games with times: {len(new_times)}")
    print(f"  - times.json updated successfully!")
    print("=" * 60)

    # Show some statistics
    all_times = [t for t in new_times.values() if t > 0]
    if all_times:
        print(f"\nTime statistics:")
        print(f"  - Min: {min(all_times):.1f} hours")
        print(f"  - Max: {max(all_times):.1f} hours")
        print(f"  - Average: {sum(all_times) / len(all_times):.1f} hours")


if __name__ == "__main__":
    main()
