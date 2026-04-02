from PIL import Image, ImageDraw, ImageFont
import os, math

IMAGES_DIR = r"C:\Users\micha\.openclaw\workspace-moltbot\game-library-manager-web\public\images"

games = {
    'hydra': 'HYDRA',
    'driversanfrancisco': 'DRIVER\nSAN FRANCISCO',
    'displaydriveruninstaller': 'DISPLAY DRIVER\nUNINSTALLER',
    'mygdocker': 'MYG DOCKER',
    'ccleaner': 'CCLEANER',
    'driverbooster': 'DRIVER\nBOOSTER',
    'win11drivers': 'WIN 11\nDRIVERS',
}

bg_colors = [(31, 41, 55), (17, 24, 39), (15, 23, 42)]
accent_colors = [(99, 102, 241), (139, 92, 246), (6, 182, 212), (16, 185, 129)]

for i, (id_, name) in enumerate(games.items()):
    out_path = os.path.join(IMAGES_DIR, f"{id_}.png")
    if os.path.exists(out_path):
        print(f"✓ {id_} already exists")
        continue
    
    img = Image.new('RGB', (300, 400), bg_colors[i % len(bg_colors)])
    draw = ImageDraw.Draw(img)
    
    accent = accent_colors[i % len(accent_colors)]
    
    # Draw gradient-like background bars
    for y in range(400):
        alpha = max(0, min(255, int(30 * math.sin(y * math.pi / 400))))
        r = min(255, bg_colors[i % len(bg_colors)][0] + alpha)
        draw.line([(0, y), (300, y)], fill=(r, bg_colors[i % len(bg_colors)][1], bg_colors[i % len(bg_colors)][2]))
    
    # Accent border
    draw.rectangle([10, 10, 290, 390], outline=accent, width=2)
    
    # Game controller icon (simple rectangles)
    cx, cy = 150, 160
    draw.ellipse([cx-40, cy-25, cx+40, cy+25], fill=accent, outline=None)
    draw.rectangle([cx-25, cy-15, cx+25, cy+15], fill=accent)
    # buttons
    draw.ellipse([cx+18, cy-8, cx+28, cy+2], fill=(255,255,255,128))
    draw.ellipse([cx-28, cy-8, cx-18, cy+2], fill=(255,255,255,128))
    # dpad
    draw.rectangle([cx-5, cy-20, cx+5, cy-8], fill=(255,255,255))
    draw.rectangle([cx-12, cy-13, cx+12, cy-3], fill=(255,255,255))
    
    # Text
    lines = name.split('\n')
    y_start = 250 if len(lines) > 1 else 260
    for j, line in enumerate(lines):
        # Estimate text width (7 pixels per char roughly)
        tw = len(line) * 10
        tx = max(10, (300 - tw) // 2)
        draw.text((tx, y_start + j * 28), line, fill=(255, 255, 255))
    
    # Small accent line below text
    draw.rectangle([80, 320, 220, 323], fill=accent)
    
    img.save(out_path)
    print(f"✅ Created {id_}.png")

print("\nVerification:")
for id_ in games:
    p = os.path.join(IMAGES_DIR, f"{id_}.png")
    size = os.path.getsize(p) if os.path.exists(p) else 0
    print(f"  {id_}: {'✅' if size > 0 else '❌'} ({size} bytes)")
