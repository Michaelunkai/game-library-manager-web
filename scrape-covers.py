#!/usr/bin/env python3
import requests
import os
import time
from pathlib import Path

games = {
    "dishonored": "Dishonored",
    "untildawn": "Until Dawn",
    "codevein": "Code Vein",
    "grimdawn": "Grim Dawn",
    "godeater3": "God Eater 3",
    "nioh3": "Nioh 3",
    "trialsofmana": "Trials of Mana",
    "againstthestorm": "Against the Storm",
    "coralisland": "Coral Island",
    "tunic": "TUNIC",
    "hadesii": "Hades II",
    "gothic3": "Gothic 3",
    "octopathtraveler": "Octopath Traveler",
    "princeofpersiathelostcrown": "Prince of Persia The Lost Crown",
    "titanquestanniversaryedition": "Titan Quest Anniversary Edition",
    "jackal": "Jackal 1988",
    "styxbladesofgreed": "Styx Master of Shadows",
    "supermarioodyssey": "Super Mario Odyssey",
    "kirbyandtheforgottenland": "Kirby and the Forgotten Land",
    "myheroacademiaallsjustice": "My Hero Academia One's Justice",
    "strangerofparadisefinalfantasyorigin": "Stranger of Paradise Final Fantasy Origin",
    "theouterworlds2": "The Outer Worlds 2",
    "dynastywarriorsorigins": "Dynasty Warriors Origins"
}

# Steam CDN URLs (when AppID is known)
steam_appids = {
    "dishonored": "205100",
    "codevein": "678960",
    "grimdawn": "219990",
    "untildawn": "1180690",
    "godeater3": "1071010",
    "tunic": "553420",
    "gothic3": "39500",
    "titanquestanniversaryedition": "475150",
    "octopathtraveler": "921570",
    "princeofpersiathelostcrown": "2231490"
}

def download_steam_cover(game_id, app_id):
    urls = [
        f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/library_600x900_2x.jpg",
        f"https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/header.jpg",
        f"https://cdn.akamai.steamstatic.com/steam/apps/{app_id}/library_600x900.jpg"
    ]
    
    for url in urls:
        try:
            print(f"Trying: {url}")
            response = requests.get(url, timeout=10)
            if response.status_code == 200 and len(response.content) > 10000:
                output_path = f"public/images/{game_id}.png"
                with open(output_path, 'wb') as f:
                    f.write(response.content)
                print(f"✓ Downloaded {game_id}")
                return True
        except Exception as e:
            print(f"✗ Failed: {e}")
    
    return False

def main():
    downloaded = 0
    failed = []
    
    for game_id, app_id in steam_appids.items():
        print(f"\n[{downloaded+1}/{len(steam_appids)}] {game_id}...")
        success = download_steam_cover(game_id, app_id)
        if success:
            downloaded += 1
        else:
            failed.append(game_id)
        time.sleep(1)  # Rate limit
    
    print(f"\n✓ Downloaded: {downloaded}")
    print(f"✗ Failed: {len(failed)}")
    if failed:
        print("Failed games:", ", ".join(failed))

if __name__ == "__main__":
    main()
