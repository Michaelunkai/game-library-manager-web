#!/usr/bin/env python3
"""
Fetch real Docker image sizes from Docker Hub for all game tags.
Updates image-sizes.json with actual sizes from Docker Hub registry.
"""

import json
import requests
import time
import sys

# Docker Hub repository info
DOCKER_USER = "michadockermisha"
REPO_NAME = "backup"

# Docker Hub API URL
BASE_URL = f"https://hub.docker.com/v2/repositories/{DOCKER_USER}/{REPO_NAME}/tags"

def fetch_all_tags():
    """Fetch all tags from Docker Hub with pagination."""
    all_tags = {}
    page = 1
    page_size = 100

    print(f"Fetching tags from {DOCKER_USER}/{REPO_NAME}...")

    while True:
        url = f"{BASE_URL}?page={page}&page_size={page_size}"

        try:
            response = requests.get(url, timeout=30)
            response.raise_for_status()
            data = response.json()
        except requests.exceptions.RequestException as e:
            print(f"Error fetching page {page}: {e}")
            # Retry with exponential backoff
            for retry in range(3):
                wait_time = 2 ** (retry + 1)
                print(f"Retrying in {wait_time}s...")
                time.sleep(wait_time)
                try:
                    response = requests.get(url, timeout=30)
                    response.raise_for_status()
                    data = response.json()
                    break
                except requests.exceptions.RequestException:
                    if retry == 2:
                        print(f"Failed to fetch page {page} after 3 retries")
                        return all_tags
                    continue

        results = data.get('results', [])
        if not results:
            break

        for tag in results:
            tag_name = tag.get('name', '')
            # Get full size from the tag info - Docker Hub provides size in bytes
            full_size = tag.get('full_size', 0)

            # If full_size is 0, try to get from images array
            if full_size == 0:
                images = tag.get('images', [])
                if images:
                    # Sum up all image layer sizes
                    full_size = sum(img.get('size', 0) for img in images)

            if tag_name and full_size > 0:
                # Convert bytes to GB with 2 decimal places
                size_gb = round(full_size / (1024 ** 3), 2)
                all_tags[tag_name] = size_gb

        print(f"Page {page}: fetched {len(results)} tags (total: {len(all_tags)})")

        # Check if there are more pages
        if not data.get('next'):
            break

        page += 1
        # Rate limiting - be nice to Docker Hub
        time.sleep(0.5)

    return all_tags

def main():
    print("=" * 60)
    print("Docker Hub Image Size Fetcher")
    print(f"Repository: {DOCKER_USER}/{REPO_NAME}")
    print("=" * 60)

    # Read existing games.json to get expected game IDs
    try:
        with open('public/data/games.json', 'r') as f:
            games = json.load(f)
        expected_ids = {game['id'] for game in games}
        print(f"Found {len(expected_ids)} games in games.json")
    except FileNotFoundError:
        print("Warning: games.json not found, will fetch all tags from Docker Hub")
        expected_ids = set()

    # Fetch all tags from Docker Hub
    hub_sizes = fetch_all_tags()

    print(f"\nFetched {len(hub_sizes)} tags from Docker Hub")

    # Read existing sizes to preserve any that aren't in Docker Hub
    try:
        with open('public/data/image-sizes.json', 'r') as f:
            existing_sizes = json.load(f)
    except FileNotFoundError:
        existing_sizes = {}

    # Create final sizes dict
    final_sizes = {}
    found_count = 0
    missing_count = 0

    for game in games:
        game_id = game['id']

        # Check if tag exists in Docker Hub
        if game_id in hub_sizes:
            final_sizes[game_id] = hub_sizes[game_id]
            found_count += 1
        else:
            # Tag not found in Docker Hub
            # Keep existing size if we have one, otherwise mark as unknown
            if game_id in existing_sizes:
                final_sizes[game_id] = existing_sizes[game_id]
            else:
                final_sizes[game_id] = 0  # Will show as N/A in UI
            missing_count += 1
            print(f"  Warning: Tag '{game_id}' not found in Docker Hub")

    # Write updated sizes
    with open('public/data/image-sizes.json', 'w') as f:
        json.dump(final_sizes, f, indent=2)

    print("\n" + "=" * 60)
    print("Summary:")
    print(f"  - Total games: {len(games)}")
    print(f"  - Tags found in Docker Hub: {found_count}")
    print(f"  - Tags missing from Docker Hub: {missing_count}")
    print(f"  - image-sizes.json updated successfully!")
    print("=" * 60)

    # Also show some size stats
    if final_sizes:
        sizes = [s for s in final_sizes.values() if s > 0]
        if sizes:
            print(f"\nSize statistics:")
            print(f"  - Min: {min(sizes):.2f} GB")
            print(f"  - Max: {max(sizes):.2f} GB")
            print(f"  - Average: {sum(sizes)/len(sizes):.2f} GB")
            print(f"  - Total: {sum(sizes):.2f} GB")

if __name__ == '__main__':
    main()
