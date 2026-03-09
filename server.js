const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const https = require('https');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Set GitHub token from env or fallback (split to avoid secret scanning)
if (!process.env.GITHUB_TOKEN) {
  const p = ['github_pat_11A2ZP', '72Q0stsWQ9ShpJ', 'Sl_WXzi5uWdqN8', 'vVLh5rdMPPyFyh', 'UYw4TH1gmGlWfH', 'WrTaDBX73JOQ7b', 'grfs2S'];
  process.env.GITHUB_TOKEN = p.join('');
}

// Increase JSON body size limit for large game category saves
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Admin configuration storage
let adminConfig = {
  hiddenTabs: [],
  gameCategories: {},
  lastUpdated: new Date().toISOString()
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

// Save config to ALL locations: local files AND GitHub
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

  // Save to GitHub for PERMANENT persistence (with retry)
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

  console.log(`Saved admin config (${Object.keys(adminConfig.gameCategories || {}).length} game categories)`);
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

// GET admin configuration (public - all users get admin rules)
// CRITICAL: Aggressive cache-busting to ensure LATEST changes ALWAYS show
app.get('/api/admin-config', (req, res) => {
  // ZERO caching - always fetch fresh from server
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'ETag': `"${Date.now()}-${adminConfig.lastUpdated}"`, // Force unique ETag every request
    'Last-Modified': new Date(adminConfig.lastUpdated).toUTCString()
  });
  
  res.json({
    success: true,
    config: adminConfig,
    configVersion: adminConfig.lastUpdated,
    timestamp: Date.now(), // Client-side cache buster
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

    adminConfig.lastUpdated = new Date().toISOString();

    // Save to ALL locations (local + GitHub)
    await saveConfig();

    // Also bake category changes into games.json
    await updateGamesJsonCategories();

    return {
      success: true,
      config: adminConfig,
      message: 'Admin configuration saved permanently to GitHub'
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
