const fs = require('fs');
const https = require('https');
const http = require('http');
const path = require('path');

const placeholders = {
    "dishonored": "Dishonored",
    "jackal": "Jackal",
    "againstthestorm": "Against the Storm",
    "bladechimera": "Blade Chimera",
    "burdenofcommand": "Burden of Command",
    "campfirewithcat": "Campfire with Cat",
    "codevein": "Code Vein",
    "coralisland": "Coral Island",
    "demontides": "Demon Tides",
    "untildawn": "Until Dawn",
    "godeater3": "God Eater 3",
    "grimdawn": "Grim Dawn",
    "nioh3": "Nioh 3",
    "trialsofmana": "Trials of Mana"
};

// Steam AppID database (sample - would need full database)
const steamAppIds = {
    "dishonored": "205100",
    "codevein": "678960",
    "grimdawn": "219990",
    "untildawn": "1180690"
};

async function downloadImage(url, filepath) {
    return new Promise((resolve, reject) => {
        const protocol = url.startsWith('https') ? https : http;
        const file = fs.createWriteStream(filepath);
        
        protocol.get(url, (response) => {
            if (response.statusCode !== 200) {
                reject(new Error(`Failed: ${response.statusCode}`));
                return;
            }
            
            response.pipe(file);
            file.on('finish', () => {
                file.close();
                resolve();
            });
        }).on('error', (err) => {
            fs.unlink(filepath, () => {});
            reject(err);
        });
    });
}

async function downloadSteamCover(gameId, appId) {
    const steamUrl = `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/library_600x900_2x.jpg`;
    const outputPath = `public/images/${gameId}.png`;
    
    try {
        console.log(`Downloading ${gameId} from Steam...`);
        await downloadImage(steamUrl, outputPath);
        console.log(`✓ ${gameId}`);
        return true;
    } catch (error) {
        console.log(`✗ ${gameId}: ${error.message}`);
        return false;
    }
}

async function main() {
    let downloaded = 0;
    
    for (const [gameId, appId] of Object.entries(steamAppIds)) {
        const success = await downloadSteamCover(gameId, appId);
        if (success) downloaded++;
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit
    }
    
    console.log(`\nDownloaded ${downloaded}/${Object.keys(steamAppIds).length} covers`);
}

main().catch(console.error);
