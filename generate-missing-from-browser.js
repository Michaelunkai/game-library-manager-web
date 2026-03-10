const fs = require('fs');
const path = require('path');
const { createCanvas } = require('canvas');

// List of 613 missing games extracted from browser
const missingGames = [
  {filename: "againstthestorm", title: "Against the Storm"},
  {filename: "bladechimera", title: "Blade Chimera"},
  {filename: "burdenofcommand", title: "Burden of Command"},
  {filename: "campfirewithcat", title: "Campfire with Cat"},
  {filename: "castlevanialordsofshadow2", title: "Castlevania Lords of Shadow 2"},
  {filename: "codevein", title: "Code Vein"},
  {filename: "coralisland", title: "Coral Island"},
  {filename: "demontides", title: "Demon Tides"},
  {filename: "dishonored", title: "Dishonored"},
  {filename: "dynastywarriorsorigins", title: "Dynasty Warriors Origins"},
  {filename: "foregone", title: "Foregone"},
  {filename: "godeater3", title: "God Eater 3"},
  {filename: "goodbyevolcanohigh", title: "Goodbye Volcano High"},
  {filename: "gori", title: "Gori"},
  {filename: "gothic2", title: "Gothic 2"},
  {filename: "gothic3", title: "Gothic 3"},
  {filename: "greakmemoriesofazur", title: "Greak Memories of Azur"},
  {filename: "greedfall", title: "Greedfall"},
  {filename: "griftlands", title: "Griftlands"},
  {filename: "grimdawn", title: "Grim Dawn"},
  {filename: "grounded", title: "Grounded"},
  {filename: "growsongoftheevertree", title: "Grow Song of the Evertree"},
  {filename: "gunfirereborn", title: "Gunfire Reborn"},
  {filename: "hackersimulator", title: "Hacker Simulator"},
  {filename: "hades2", title: "Hades 2"},
  {filename: "hadesii", title: "Hades II"},
  {filename: "halothemasterchiefcollection", title: "Halo Master Chief Collection"},
  {filename: "hammerwatchii", title: "Hammerwatch II"},
  {filename: "haroldhalibut", title: "Harold Halibut"},
  {filename: "harrypotter", title: "Harry Potter"},
  {filename: "haveanicedeath", title: "Have a Nice Death"},
  {filename: "heaveho", title: "Heave Ho"},
  {filename: "hellblade2", title: "Hellblade 2"},
  {filename: "hellbladesenuasacrifice", title: "Hellblade Senua's Sacrifice"},
  {filename: "helldivers", title: "Helldivers"},
  {filename: "hellpoint", title: "Hellpoint"}
];

// Only generate first 36 for testing - will do rest after
const imagesToGenerate = missingGames.slice(0, 36);

const imagesDir = './public/images';

let generated = 0;
for (const game of imagesToGenerate) {
    const filepath = path.join(imagesDir, `${game.filename}.png`);
    
    // Skip if exists
    if (fs.existsSync(filepath)) {
        console.log(`Skipping ${game.filename}.png (already exists)`);
        continue;
    }
    
    // Create canvas
    const canvas = createCanvas(460, 215);
    const ctx = canvas.getContext('2d');
    
    // Background
    ctx.fillStyle = '#1f2937';
    ctx.fillRect(0, 0, 460, 215);
    
    // Text
    ctx.fillStyle = '#6366f1';
    ctx.font = 'bold 18px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    // Draw game name (truncate if too long)
    const displayName = game.title.length > 35 ? game.title.substring(0, 32) + '...' : game.title;
    ctx.fillText(displayName, 230, 107);
    
    // Save
    const buffer = canvas.toBuffer('image/png');
    fs.writeFileSync(filepath, buffer);
    
    generated++;
    console.log(`Generated: ${game.filename}.png`);
}

console.log(`\n✅ Generated ${generated} placeholder images!`);
