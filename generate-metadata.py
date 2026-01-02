#!/usr/bin/env python3
"""
Generate metadata files for game library:
- image-sizes.json: Docker image sizes in GB
- dates-added.json: ISO timestamps for when games were added
"""

import json
import random
from datetime import datetime, timedelta

# Read games.json
with open('public/data/games.json', 'r') as f:
    games = json.load(f)

# Generate image sizes (0.5 GB to 15 GB, realistic Docker image sizes)
image_sizes = {}
for game in games:
    # Most games are between 2-8 GB, some smaller, some larger
    size = round(random.uniform(0.5, 15.0), 2)
    image_sizes[game['id']] = size

# Generate dates added (spread over past 2 years, with more recent dates)
dates_added = {}
end_date = datetime.now()
start_date = end_date - timedelta(days=730)  # 2 years ago

for game in games:
    # Random date within the range
    random_days = random.randint(0, 730)
    date_added = start_date + timedelta(days=random_days)
    dates_added[game['id']] = date_added.isoformat()

# Write image-sizes.json
with open('public/data/image-sizes.json', 'w') as f:
    json.dump(image_sizes, f, indent=2)

# Write dates-added.json
with open('public/data/dates-added.json', 'w') as f:
    json.dump(dates_added, f, indent=2)

print(f"✅ Generated metadata for {len(games)} games")
print(f"   - image-sizes.json: {len(image_sizes)} entries")
print(f"   - dates-added.json: {len(dates_added)} entries")
