const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Permit the HTTPS-hosted UI to query only this local companion endpoint.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Private-Network', 'true');
  next();
});

// Increase JSON body size limit for large game category saves
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Admin configuration storage
let adminConfig = {
  hiddenTabs: [],
  gameCategories: {},
  tabs: null,
  lastUpdated: 'bootstrap-v1'
};

// Mutex for concurrent admin operations
let configMutex = Promise.resolve();

// GitHub API settings for permanent storage
const GITHUB_REPO = 'Michaelunkai/game-library-manager-web';
const GITHUB_CONFIG_PATHS = [
  'data/admin-config.json',
  'public/data/admin-config.json'
];
let githubShas = {};

// All local config file paths (save to multiple locations for redundancy)
const CONFIG_PATHS = [
  './data/admin-config.json',
  './public/data/admin-config.json'
];

function githubRequest(method, filePath, body) {
  return new Promise((resolve, reject) => {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return reject(new Error('GITHUB_TOKEN not set'));
    }

    const options = {
      hostname: 'api.github.com',
      path: `/repos/${GITHUB_REPO}/contents/${filePath}`,
      method: method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'game-library-manager',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch (e) {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Load config from GitHub first, then fall back to local files
async function loadConfigFromGitHub() {
  try {
    const primaryPath = GITHUB_CONFIG_PATHS[0];
    const result = await githubRequest('GET', primaryPath);
    if (result.status === 200 && result.data.content) {
      const content = Buffer.from(result.data.content, 'base64').toString('utf8');
      const parsed = JSON.parse(content);
      githubShas[primaryPath] = result.data.sha;
      console.log(`Loaded admin config from GitHub (${Object.keys(parsed.gameCategories || {}).length} game categories)`);
      return parsed;
    }
  } catch (error) {
    console.log('GitHub load failed:', error.message);
  }
  return null;
}

// Save config to GitHub permanently (both paths)
async function saveConfigToGitHub() {
  const content = Buffer.from(JSON.stringify(adminConfig, null, 2)).toString('base64');
  let success = false;

  for (const filePath of GITHUB_CONFIG_PATHS) {
    try {
      if (!githubShas[filePath]) {
        const current = await githubRequest('GET', filePath);
        if (current.status === 200) {
          githubShas[filePath] = current.data.sha;
        }
      }

      const body = {
        message: `Update admin config - ${new Date().toISOString()}`,
        content: content,
        branch: 'main'
      };
      if (githubShas[filePath]) {
        body.sha = githubShas[filePath];
      }

      const result = await githubRequest('PUT', filePath, body);
      if (result.status === 200 || result.status === 201) {
        githubShas[filePath] = result.data.content.sha;
        console.log(`Admin config saved to GitHub: ${filePath}`);
        success = true;
      } else {
        console.error(`GitHub save error for ${filePath}:`, result.status);
        githubShas[filePath] = null;
      }
    } catch (error) {
      console.error(`GitHub save failed for ${filePath}:`, error.message);
      githubShas[filePath] = null;
    }
  }

  if (success) console.log('Admin config saved to GitHub PERMANENTLY');
  return success;
}

// Ensure data directories exist
async function ensureDataDirectories() {
  await fs.mkdir('./data', { recursive: true }).catch(() => {});
  await fs.mkdir('./public/data', { recursive: true }).catch(() => {});
}

// Load config on startup - GitHub first, then local files
async function loadConfig() {
  await ensureDataDirectories();

  // Try GitHub first (most authoritative, permanent source)
  const githubConfig = await loadConfigFromGitHub();
  if (githubConfig) {
    adminConfig = githubConfig;
    console.log('Using GitHub config as primary source');
  }

  // Also check local files - use if they have MORE data than current
  for (const configPath of CONFIG_PATHS) {
    try {
      const data = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(data);
      const currentCats = Object.keys(adminConfig.gameCategories || {}).length;
      const currentTabs = (adminConfig.hiddenTabs || []).length;
      const newCats = Object.keys(parsed.gameCategories || {}).length;
      const newTabs = (parsed.hiddenTabs || []).length;
      // Use local if it has more total data
      if ((newCats + newTabs) > (currentCats + currentTabs)) {
        adminConfig = parsed;
        console.log(`Loaded admin config from ${configPath} (${newCats} categories, ${newTabs} hidden tabs)`);
      }
    } catch (error) {
      // ignore
    }
  }

  // Merge: if GitHub had hiddenTabs that local didn't, keep them
  if (githubConfig && (githubConfig.hiddenTabs || []).length > (adminConfig.hiddenTabs || []).length) {
    adminConfig.hiddenTabs = githubConfig.hiddenTabs;
  }

  const catCount = Object.keys(adminConfig.gameCategories || {}).length;
  if (catCount === 0 && (!adminConfig.hiddenTabs || adminConfig.hiddenTabs.length === 0)) {
    console.log('No saved admin config found, using defaults');
  } else {
    console.log(`Admin config loaded: ${catCount} game categories, ${(adminConfig.hiddenTabs || []).length} hidden tabs`);
    // Sync to all locations
    await saveConfig();
  }
}

// Save config to the local files and, when configured, GitHub.
async function saveConfig() {
  await ensureDataDirectories();

  // Save locally for fast reads
  for (const configPath of CONFIG_PATHS) {
    try {
      const tempFile = configPath + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(adminConfig, null, 2));
      await fs.rename(tempFile, configPath);
    } catch (error) {
      console.error(`Failed to save config to ${configPath}:`, error);
    }
  }

  // GitHub is optional for the local companion server. Do not delay the
  // installed-game scanner when no explicit credential is configured.
  if (process.env.GITHUB_TOKEN) {
    let githubSaved = await saveConfigToGitHub();
    if (!githubSaved) {
      console.log('GitHub save failed, retrying in 2s...');
      await new Promise(r => setTimeout(r, 2000));
      githubSaved = await saveConfigToGitHub();
      if (!githubSaved) {
        console.log('GitHub save retry failed, will retry in 10s...');
        await new Promise(r => setTimeout(r, 10000));
        await saveConfigToGitHub();
      }
    }
  } else {
    console.log('GitHub save skipped: GITHUB_TOKEN is not configured; local config files remain available.');
  }

  console.log(`Saved admin config (${Object.keys(adminConfig.gameCategories || {}).length} game categories)`);
}

// Local-only installed-game scanner. Browsers cannot read arbitrary Windows
// drives, so the companion server exposes this narrowly-scoped read-only route.
const INSTALLED_SCAN_ROOTS = ['C:\\Games', 'F:\\Games', 'E:\\Games'];
const SCAN_IGNORED_DIRECTORIES = new Set([
  '.git', 'node_modules', '$recycle.bin', 'system volume information',
  '.glm-extracting'
]);
let installedScanCache = null;
let installedScanPromise = null;

function isIgnoredScanDirectory(name) {
  const lower = String(name || '').toLowerCase();
  return SCAN_IGNORED_DIRECTORIES.has(lower) || lower.startsWith('.glm-extracting-');
}

async function scanInstalledRoot(root) {
  const games = new Map();
  let exists = false;
  try {
    const rootStat = await fs.stat(root);
    exists = rootStat.isDirectory();
  } catch (error) {
    return { root, exists: false, games: [] };
  }
  if (!exists) return { root, exists: false, games: [] };

  async function walk(currentPath) {
    let directory;
    try {
      directory = await fs.opendir(currentPath);
    } catch (error) {
      return;
    }

    for await (const entry of directory) {
      if (entry.isDirectory()) {
        if (!isIgnoredScanDirectory(entry.name)) await walk(path.join(currentPath, entry.name));
        continue;
      }
      if (!entry.isFile()) continue;

      const lowerName = entry.name.toLowerCase();
      const isExecutable = /\.(exe|com|cmd|bat)$/i.test(entry.name);
      const isMarker = lowerName === '.glm-extract-ok' || lowerName === 'steam_appid.txt';
      if (!isExecutable && !isMarker) continue;

      const relativeDirectory = path.relative(root, currentPath);
      const firstSegment = relativeDirectory ? relativeDirectory.split(path.sep)[0] : '';
      const gamePath = firstSegment ? path.join(root, firstSegment) : root;
      const key = gamePath.toLowerCase();
      const current = games.get(key) || {
        name: firstSegment || path.basename(entry.name, path.extname(entry.name)),
        path: gamePath,
        root,
        executable: null,
        marker: null
      };
      if (isExecutable && !current.executable) current.executable = path.join(currentPath, entry.name);
      if (isMarker && !current.marker) current.marker = path.join(currentPath, entry.name);
      games.set(key, current);
    }
  }

  await walk(root);
  return { root, exists: true, games: [...games.values()] };
}

async function getInstalledGames() {
  const now = Date.now();
  if (installedScanCache && installedScanCache.expiresAt > now) return installedScanCache.data;
  if (installedScanPromise) return installedScanPromise;

  installedScanPromise = Promise.all(INSTALLED_SCAN_ROOTS.map(scanInstalledRoot)).then(rootResults => {
    const games = rootResults.flatMap(result => result.games)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }) || a.path.localeCompare(b.path));
    const data = {
      success: true,
      scannedAt: new Date().toISOString(),
      roots: rootResults.map(({ root, exists }) => ({ root, exists })),
      games
    };
    installedScanCache = { expiresAt: Date.now() + 5000, data };
    return data;
  }).finally(() => {
    installedScanPromise = null;
  });

  return installedScanPromise;
}

// Also update games.json directly with category changes so data survives full resets
async function updateGamesJsonCategories() {
  if (!adminConfig.gameCategories || Object.keys(adminConfig.gameCategories).length === 0) return;

  try {
    const gamesPath = './public/data/games.json';
    const data = await fs.readFile(gamesPath, 'utf8');
    const games = JSON.parse(data);

    let changed = 0;
    Object.entries(adminConfig.gameCategories).forEach(([gameId, category]) => {
      const game = games.find(g => g.id === gameId);
      if (game && game.category !== category) {
        game.category = category;
        changed++;
      }
    });

    if (changed > 0) {
      const tempFile = gamesPath + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(games, null, 4));
      await fs.rename(tempFile, gamesPath);
      console.log(`Updated ${changed} game categories directly in games.json`);
    }
  } catch (error) {
    console.error('Failed to update games.json:', error);
  }
}

// API Routes

// GET installed games from the three explicitly approved local roots.
app.get('/api/installed-games', async (req, res) => {
  try {
    const data = await getInstalledGames();
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      'Access-Control-Allow-Private-Network': 'true'
    });
    res.json(data);
  } catch (error) {
    console.error('Installed-game scan failed:', error);
    res.status(500).json({ success: false, error: 'Installed-game scan failed' });
  }
});

// GET admin configuration (public - all users get admin rules)
// CRITICAL: No caching, but keep the version stable while data is unchanged.
app.get('/api/admin-config', (req, res) => {
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'ETag': `"${adminConfig.lastUpdated}"`,
    'Last-Modified': adminConfig.lastUpdated && !Number.isNaN(Date.parse(adminConfig.lastUpdated))
      ? new Date(adminConfig.lastUpdated).toUTCString()
      : new Date(0).toUTCString()
  });
  
  res.json({
    success: true,
    config: adminConfig,
    configVersion: adminConfig.lastUpdated,
    message: 'Admin configuration retrieved'
  });
});

// POST admin configuration (requires admin token)
app.post('/api/admin-config', async (req, res) => {
  const adminToken = req.headers['x-admin-token'];
  const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'glm-admin-2024';

  if (adminToken !== ADMIN_TOKEN) {
    return res.status(401).json({
      success: false,
      message: 'Unauthorized - invalid admin token'
    });
  }

  // Use mutex to serialize concurrent admin operations
  configMutex = configMutex.then(async () => {
    const updates = req.body;

    if (updates.hiddenTabs !== undefined) {
      adminConfig.hiddenTabs = updates.hiddenTabs;
    }

    if (updates.gameCategories !== undefined) {
      adminConfig.gameCategories = { ...adminConfig.gameCategories, ...updates.gameCategories };
    }

    if (Array.isArray(updates.tabs)) {
      adminConfig.tabs = updates.tabs;
    }

    adminConfig.lastUpdated = new Date().toISOString();

    // Save to ALL locations (local + GitHub)
    await saveConfig();

    // Also bake category changes into games.json
    await updateGamesJsonCategories();

    return {
      success: true,
      config: adminConfig,
      message: 'Admin configuration saved to local files and the configured persistence backend'
    };
  }).catch(error => {
    console.error('Config update error:', error);
    return {
      success: false,
      message: 'Failed to update configuration',
      error: error.message
    };
  });

  const result = await configMutex;
  res.json(result);
});

// Serve static files from public (with no-cache for data files to always get fresh data)
app.use('/data', (req, res, next) => {
  res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
  next();
}, express.static(path.join(__dirname, 'public', 'data')));

// API: Save times.json (update HLTB data)
app.post('/api/save-times', async (req, res) => {
  try {
    const times = req.body;
    const timesPath = './public/data/times.json';
    await fs.writeFile(timesPath, JSON.stringify(times, null, 4));

    // Also save to GitHub for persistence
    try {
      const content = Buffer.from(JSON.stringify(times, null, 4)).toString('base64');
      const ghPath = 'public/data/times.json';
      const current = await githubRequest('GET', ghPath);
      const body = {
        message: `Update times data - ${new Date().toISOString()}`,
        content: content,
        branch: 'main'
      };
      if (current.status === 200) {
        body.sha = current.data.sha;
      }
      await githubRequest('PUT', ghPath, body);
    } catch (e) {
      console.log('GitHub times save failed:', e.message);
    }

    res.json({ success: true, count: Object.keys(times).length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Save games.json
app.post('/api/save-games', async (req, res) => {
  try {
    const games = req.body;
    const gamesPath = './public/data/games.json';
    await fs.writeFile(gamesPath, JSON.stringify(games, null, 4));
    res.json({ success: true, count: games.length });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.use(express.static('public'));

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
loadConfig().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin config endpoint: http://localhost:${PORT}/api/admin-config`);
    console.log(`Game categories tracked: ${Object.keys(adminConfig.gameCategories || {}).length}`);
    console.log(`GitHub persistence: ${process.env.GITHUB_TOKEN ? 'ENABLED' : 'DISABLED (set GITHUB_TOKEN)'}`);
  });
});
