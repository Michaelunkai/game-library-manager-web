/**
 * Complete Docker Hub Sync Script
 * Fetches ALL tags from michadockermisha/backup with full metadata
 * Regenerates games.json, image-sizes.json, dates-added.json
 * Preserves existing category assignments
 */

const https = require("https");
const fs = require("fs");
const path = require("path");

const CONFIG = {
    dockerUser: "michadockermisha",
    repoName: "backup",
    pageSize: 100,
    outputDir: path.join(__dirname, "public", "data"),
    docsDir: path.join(__dirname, "docs", "data")
};

// Helper to format game names from tag names
function formatGameName(tagName) {
    let name = tagName;
    // Add spaces before numbers
    name = name.replace(/(\d+)/g, ' $1');
    // Add spaces before capital letters
    name = name.replace(/([a-z])([A-Z])/g, '$1 $2');
    // Capitalize first letter of each word
    name = name.split(' ').map(word =>
        word.charAt(0).toUpperCase() + word.slice(1)
    ).join(' ');
    // Clean up multiple spaces
    name = name.replace(/\s+/g, ' ').trim();
    return name;
}

// Fetch a single page from Docker Hub
async function fetchPage(page) {
    const url = `https://hub.docker.com/v2/repositories/${CONFIG.dockerUser}/${CONFIG.repoName}/tags?page=${page}&page_size=${CONFIG.pageSize}`;
    
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            let body = "";
            res.on("data", chunk => body += chunk);
            res.on("end", () => {
                try {
                    resolve(JSON.parse(body));
                } catch (e) {
                    reject(e);
                }
            });
            res.on("error", reject);
        }).on("error", reject);
    });
}

// Fetch ALL tags with full metadata
async function fetchAllTags() {
    const allTags = [];
    let page = 1;
    
    console.log("🔄 Fetching all tags from Docker Hub...\n");
    
    while (true) {
        process.stdout.write(`   Page ${page}... `);
        const data = await fetchPage(page);
        
        if (!data.results || data.results.length === 0) {
            console.log("(end)");
            break;
        }
        
        // Store full tag data including size and date
        for (const tag of data.results) {
            allTags.push({
                name: tag.name,
                full_size: tag.full_size || 0,
                last_updated: tag.last_updated || null
            });
        }
        
        console.log(`${data.results.length} tags (total: ${allTags.length})`);
        
        if (!data.next) break;
        page++;
    }
    
    console.log(`\n✅ Total tags fetched: ${allTags.length}`);
    return allTags;
}

// Load existing games.json to preserve categories
function loadExistingCategories() {
    const gamesPath = path.join(CONFIG.outputDir, "games.json");
    const categories = new Map();
    
    try {
        const existing = JSON.parse(fs.readFileSync(gamesPath, "utf8"));
        for (const game of existing) {
            // Store by lowercase ID for case-insensitive matching
            const key = game.id.toLowerCase();
            if (game.category && game.category !== "new") {
                categories.set(key, game.category);
            }
        }
        console.log(`📂 Loaded ${categories.size} existing category assignments`);
    } catch (e) {
        console.log("⚠️ Could not load existing games.json, all games will be 'new'");
    }
    
    return categories;
}

// Generate all data files
async function generateDataFiles() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  Docker Hub Complete Sync - Game Library Manager");
    console.log("═══════════════════════════════════════════════════════════\n");
    
    // 1. Fetch all tags from Docker Hub
    const allTags = await fetchAllTags();
    
    // 2. Load existing categories to preserve them
    const existingCategories = loadExistingCategories();
    
    // 3. Build new data structures
    const games = [];
    const imageSizes = {};
    const datesAdded = {};
    
    // Track which tag names we've seen (for de-duplication, case-insensitive)
    const seenTags = new Set();
    
    console.log("\n📝 Building data files...\n");
    
    for (const tag of allTags) {
        const tagNameLower = tag.name.toLowerCase();
        
        // Skip duplicates (case-insensitive)
        if (seenTags.has(tagNameLower)) {
            continue;
        }
        seenTags.add(tagNameLower);
        
        // Determine category: use existing if available, otherwise 'new'
        const category = existingCategories.get(tagNameLower) || "new";
        
        // Build game entry
        const game = {
            id: tag.name,
            name: formatGameName(tag.name),
            category: category
        };
        games.push(game);
        
        // Image size in GB (convert from bytes)
        if (tag.full_size && tag.full_size > 0) {
            const sizeGB = Math.round(tag.full_size / 1073741824 * 100) / 100;
            imageSizes[tag.name] = sizeGB;
        }
        
        // Date added (from last_updated)
        if (tag.last_updated) {
            datesAdded[tag.name] = tag.last_updated.split('T')[0];
        }
    }
    
    console.log(`   Games: ${games.length} (unique tags)`);
    console.log(`   Image sizes: ${Object.keys(imageSizes).length} entries`);
    console.log(`   Dates: ${Object.keys(datesAdded).length} entries`);
    
    // Count categories
    const categoryCounts = {};
    for (const game of games) {
        categoryCounts[game.category] = (categoryCounts[game.category] || 0) + 1;
    }
    console.log("\n📊 Category breakdown:");
    const sortedCategories = Object.entries(categoryCounts).sort((a, b) => b[1] - a[1]);
    for (const [cat, count] of sortedCategories.slice(0, 10)) {
        console.log(`   ${cat}: ${count}`);
    }
    if (sortedCategories.length > 10) {
        console.log(`   ... and ${sortedCategories.length - 10} more categories`);
    }
    
    // 4. Write to public/data/
    console.log("\n💾 Writing to public/data/...");
    fs.mkdirSync(CONFIG.outputDir, { recursive: true });
    
    fs.writeFileSync(
        path.join(CONFIG.outputDir, "games.json"),
        JSON.stringify(games, null, 4),
        "utf8"
    );
    console.log(`   ✅ games.json (${games.length} games)`);
    
    fs.writeFileSync(
        path.join(CONFIG.outputDir, "image-sizes.json"),
        JSON.stringify(imageSizes, null, 4),
        "utf8"
    );
    console.log(`   ✅ image-sizes.json (${Object.keys(imageSizes).length} sizes)`);
    
    fs.writeFileSync(
        path.join(CONFIG.outputDir, "dates-added.json"),
        JSON.stringify(datesAdded, null, 4),
        "utf8"
    );
    console.log(`   ✅ dates-added.json (${Object.keys(datesAdded).length} dates)`);
    
    // 5. Copy to docs/data/ for GitHub Pages
    console.log("\n📋 Copying to docs/data/...");
    fs.mkdirSync(CONFIG.docsDir, { recursive: true });
    
    fs.copyFileSync(
        path.join(CONFIG.outputDir, "games.json"),
        path.join(CONFIG.docsDir, "games.json")
    );
    console.log("   ✅ docs/data/games.json");
    
    fs.copyFileSync(
        path.join(CONFIG.outputDir, "image-sizes.json"),
        path.join(CONFIG.docsDir, "image-sizes.json")
    );
    console.log("   ✅ docs/data/image-sizes.json");
    
    fs.copyFileSync(
        path.join(CONFIG.outputDir, "dates-added.json"),
        path.join(CONFIG.docsDir, "dates-added.json")
    );
    console.log("   ✅ docs/data/dates-added.json");
    
    // Summary
    console.log("\n═══════════════════════════════════════════════════════════");
    console.log("  ✅ SYNC COMPLETE!");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`  Total games: ${games.length}`);
    console.log(`  New (uncategorized): ${categoryCounts['new'] || 0}`);
    console.log(`  With real sizes: ${Object.keys(imageSizes).length}`);
    console.log(`  With real dates: ${Object.keys(datesAdded).length}`);
    console.log("═══════════════════════════════════════════════════════════\n");
    
    return { games, imageSizes, datesAdded };
}

// Run the sync
generateDataFiles().catch(err => {
    console.error("❌ Sync failed:", err);
    process.exit(1);
});
