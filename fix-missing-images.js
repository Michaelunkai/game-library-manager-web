#!/usr/bin/env node
const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const IMAGES_DIR = path.join(__dirname, 'public', 'images');

// Games mapping: id -> search name
const missingGames = {
  'hydra': 'Hydra game 2024',
  'driversanfrancisco': 'Driver San Francisco game',
  'displaydriveruninstaller': null, // software, make placeholder
  'mygdocker': null, // software
  'ccleaner': null, // software
  'driverbooster': null, // software
  'win11drivers': null, // software
};

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(dest);
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(dest);
        return reject(new Error(`HTTP ${response.statusCode}`));
      }
      response.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', (err) => {
      fs.unlinkSync(dest);
      reject(err);
    });
  });
}

// Try RAWG API (free, no key needed for basic usage)
async function fetchFromRawg(gameName) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(gameName);
    const url = `https://api.rawg.io/api/games?search=${query}&key=&page_size=1`;
    https.get(url, { headers: { 'User-Agent': 'GameLibrary/1.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.results && json.results[0] && json.results[0].background_image) {
            resolve(json.results[0].background_image);
          } else {
            resolve(null);
          }
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Fetch from Steam search
async function fetchFromSteam(gameName) {
  return new Promise((resolve) => {
    const query = encodeURIComponent(gameName);
    const url = `https://store.steampowered.com/api/storesearch/?term=${query}&l=english&cc=US`;
    https.get(url, { headers: { 'User-Agent': 'Mozilla/5.0' } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.items && json.items[0]) {
            const appid = json.items[0].id;
            resolve(`https://cdn.cloudflare.steamstatic.com/steam/apps/${appid}/library_600x900.jpg`);
          } else {
            resolve(null);
          }
        } catch(e) { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

// Create a styled SVG placeholder
function createPlaceholder(id, name) {
  const colors = ['#1f2937', '#111827', '#0f172a'];
  const accentColors = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981'];
  const bg = colors[id.length % colors.length];
  const accent = accentColors[id.length % accentColors.length];
  
  const displayName = name || id.replace(/-/g, ' ').toUpperCase();
  const shortName = displayName.length > 20 ? displayName.substring(0, 18) + '...' : displayName;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 400">
  <rect fill="${bg}" width="300" height="400"/>
  <rect fill="${accent}" opacity="0.1" x="20" y="20" width="260" height="360" rx="8"/>
  <rect fill="${accent}" opacity="0.3" x="40" y="160" width="220" height="80" rx="4"/>
  <text x="150" y="195" text-anchor="middle" fill="${accent}" font-size="48" font-family="Arial">🎮</text>
  <text x="150" y="310" text-anchor="middle" fill="white" font-size="14" font-family="Arial" font-weight="bold">${shortName}</text>
</svg>`;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  console.log('Processing missing game images...');
  
  for (const [id, searchName] of Object.entries(missingGames)) {
    const destPng = path.join(IMAGES_DIR, `${id}.png`);
    const destJpg = path.join(IMAGES_DIR, `${id}.jpg`);
    
    if (fs.existsSync(destPng) || fs.existsSync(destJpg)) {
      console.log(`✓ ${id} - already exists`);
      continue;
    }
    
    if (!searchName) {
      // Create SVG placeholder for software tools
      const svgPath = path.join(IMAGES_DIR, `${id}.svg`);
      const svg = createPlaceholder(id, id.replace(/([a-z])([A-Z])/g, '$1 $2'));
      fs.writeFileSync(svgPath, svg);
      console.log(`📄 ${id} - created SVG placeholder`);
      continue;
    }
    
    console.log(`🔍 ${id} - searching for: ${searchName}`);
    
    // Try Steam first
    let imgUrl = await fetchFromSteam(searchName);
    if (imgUrl) {
      console.log(`  Steam: ${imgUrl}`);
      try {
        const tmpPath = path.join(IMAGES_DIR, `${id}.jpg`);
        await downloadFile(imgUrl, tmpPath);
        // Verify it's a valid image (check file size)
        const stats = fs.statSync(tmpPath);
        if (stats.size > 5000) {
          console.log(`  ✅ Downloaded from Steam (${stats.size} bytes)`);
          continue;
        } else {
          fs.unlinkSync(tmpPath);
        }
      } catch(e) {
        console.log(`  Steam failed: ${e.message}`);
      }
    }
    
    await sleep(1000);
    
    // Fallback: RAWG
    imgUrl = await fetchFromRawg(searchName);
    if (imgUrl) {
      console.log(`  RAWG: ${imgUrl}`);
      try {
        const ext = imgUrl.includes('.jpg') ? 'jpg' : 'png';
        const tmpPath = path.join(IMAGES_DIR, `${id}.${ext}`);
        await downloadFile(imgUrl, tmpPath);
        const stats = fs.statSync(tmpPath);
        if (stats.size > 5000) {
          console.log(`  ✅ Downloaded from RAWG (${stats.size} bytes)`);
          continue;
        } else {
          fs.unlinkSync(tmpPath);
        }
      } catch(e) {
        console.log(`  RAWG failed: ${e.message}`);
      }
    }
    
    // Final fallback: SVG placeholder
    const svgPath = path.join(IMAGES_DIR, `${id}.svg`);
    const svg = createPlaceholder(id, searchName);
    fs.writeFileSync(svgPath, svg);
    console.log(`  📄 Created SVG placeholder as fallback`);
    
    await sleep(500);
  }
  
  console.log('\nDone! Checking results:');
  for (const id of Object.keys(missingGames)) {
    const files = ['png','jpg','svg'].map(ext => path.join(IMAGES_DIR, `${id}.${ext}`)).filter(fs.existsSync);
    console.log(`  ${id}: ${files.length > 0 ? files.map(f => path.basename(f)).join(', ') : '❌ MISSING'}`);
  }
}

main().catch(console.error);
