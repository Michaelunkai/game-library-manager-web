const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// Read games.json
const games = JSON.parse(fs.readFileSync('./public/data/games.json', 'utf8'));

// Get existing images
const imagesDir = './public/images';
const existingImages = fs.readdirSync(imagesDir)
    .filter(f => f.endsWith('.png'))
    .map(f => f.replace('.png', '').toLowerCase());

// Find missing
const missingGames = games.filter(game => 
    !existingImages.includes(game.id.toLowerCase())
);

console.log(`Found ${missingGames.length} games without images`);

// Generate placeholder for each missing game
let generated = 0;
for (const game of missingGames) {
    const filename = `${game.id.toLowerCase()}.png`;
    const filepath = path.join(imagesDir, filename);
    
    // Create canvas
    const canvas = createCanvas(460, 215);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, 460, 215);
    
    // Text
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 20px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw game name (truncate if too long)
    const displayName = game.name.length > 30 ? game.name.substring(0, 27) + '...' : game.name;
    ctx.fillText(displayName, 230, 107);
    
    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);
    
    generated++;
    if (generated % 50 === 0) {
        console.log(`Generated ${generated}/${missingGames.length}...`);
    }
}

console.log(`\n✅ Generated ${generated} placeholder images!`);
