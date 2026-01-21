const https = require("https");
const fs = require("fs");

async function fetchPage(page, pageSize) {
    const url = `https://hub.docker.com/v2/repositories/michadockermisha/backup/tags?page=${page}&page_size=${pageSize}`;
    
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

async function fetchAllTags() {
    const allTags = [];
    let page = 1;
    const pageSize = 100;
    
    while (true) {
        console.log(`Fetching page ${page}...`);
        const data = await fetchPage(page, pageSize);
        
        if (!data.results || data.results.length === 0) break;
        
        for (const tag of data.results) {
            allTags.push(tag.name);
        }
        
        console.log(`  Found ${data.results.length} tags on page ${page} (total so far: ${allTags.length})`);
        
        if (!data.next) break;
        page++;
    }
    
    console.log(`\nTotal tags found: ${allTags.length}`);
    
    const outputPath = "F:\\backup\\windowsapps\\installed\\myapps\\compiled_python\\myg\\kk\\k\\game-library-manager-web\\all_docker_tags.txt";
    fs.writeFileSync(outputPath, allTags.join("\n"), "utf8");
    console.log(`Saved to: ${outputPath}`);
}

fetchAllTags().catch(console.error);