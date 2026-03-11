#!/usr/bin/env python3
import json
from PIL import Image, ImageDraw, ImageFont
import os

# Load missing games list
missing_games = json.loads(open('missing_games.json').read())

# Create output directory
os.makedirs('public/images', exist_ok=True)

# Image settings
WIDTH = 460
HEIGHT = 215
BG_COLOR = (31, 41, 55)  # #1f2937
TEXT_COLOR = (99, 102, 241)  # #6366f1

def create_placeholder(filename, title):
    # Create image
    img = Image.new('RGB', (WIDTH, HEIGHT), BG_COLOR)
    draw = ImageDraw.Draw(img)
    
    # Try to use a nice font, fall back to default
    try:
        font_large = ImageFont.truetype("arial.ttf", 32)
        font_small = ImageFont.truetype("arial.ttf", 20)
    except:
        font_large = ImageFont.load_default()
        font_small = ImageFont.load_default()
    
    # Draw game icon (controller emoji substitute)
    draw.text((WIDTH//2, HEIGHT//3), "🎮", fill=TEXT_COLOR, font=font_large, anchor="mm")
    
    # Draw game title (truncate if too long)
    title_display = title if len(title) <= 30 else title[:27] + "..."
    draw.text((WIDTH//2, HEIGHT//2 + 20), title_display, fill=TEXT_COLOR, font=font_small, anchor="mm")
    
    # Save
    img.save(f'public/images/{filename}.png', 'PNG')
    print(f'Created: {filename}.png')

# Generate all missing images
for game in missing_games:
    create_placeholder(game['filename'], game['title'])

print(f"\\n✅ Generated {len(missing_games)} placeholder images!")
