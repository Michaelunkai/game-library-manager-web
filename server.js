const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

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

// All config file paths (save to multiple locations for redundancy)
const CONFIG_PATHS = [
  './data/admin-config.json',
  './public/data/admin-config.json'
];

// Ensure data directories exist
async function ensureDataDirectories() {
  await fs.mkdir('./data', { recursive: true }).catch(() => {});
  await fs.mkdir('./public/data', { recursive: true }).catch(() => {});
}

// Load config from file on startup - try multiple locations
async function loadConfig() {
  await ensureDataDirectories();

  for (const configPath of CONFIG_PATHS) {
    try {
      const data = await fs.readFile(configPath, 'utf8');
      const parsed = JSON.parse(data);
      // Use the config with the most game categories (most complete data)
      const currentCount = Object.keys(adminConfig.gameCategories || {}).length;
      const newCount = Object.keys(parsed.gameCategories || {}).length;
      if (newCount >= currentCount) {
        adminConfig = parsed;
        console.log(`Loaded admin config from ${configPath} (${newCount} game categories)`);
      }
    } catch (error) {
      console.log(`No config at ${configPath}, trying next...`);
    }
  }

  const catCount = Object.keys(adminConfig.gameCategories || {}).length;
  if (catCount === 0) {
    console.log('No saved admin config found, using defaults');
    adminConfig = {
      hiddenTabs: [],
      gameCategories: {},
      lastUpdated: new Date().toISOString()
    };
  } else {
    console.log(`Admin config loaded with ${catCount} game categories`);
    // Ensure all locations have the best config
    await saveConfig();
  }
}

// Save config to ALL file locations with atomic writes
async function saveConfig() {
  await ensureDataDirectories();

  for (const configPath of CONFIG_PATHS) {
    try {
      const tempFile = configPath + '.tmp';
      await fs.writeFile(tempFile, JSON.stringify(adminConfig, null, 2));
      await fs.rename(tempFile, configPath);
    } catch (error) {
      console.error(`Failed to save config to ${configPath}:`, error);
    }
  }
  console.log(`Saved admin config to ${CONFIG_PATHS.length} locations (${Object.keys(adminConfig.gameCategories || {}).length} game categories)`);
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
app.get('/api/admin-config', (req, res) => {
  res.json({
    success: true,
    config: adminConfig,
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
      // Replace hidden tabs entirely (admin sends the full list)
      adminConfig.hiddenTabs = updates.hiddenTabs;
    }

    if (updates.gameCategories !== undefined) {
      // Merge new category changes into existing ones
      adminConfig.gameCategories = { ...adminConfig.gameCategories, ...updates.gameCategories };
    }

    adminConfig.lastUpdated = new Date().toISOString();

    // Save to ALL config file locations
    await saveConfig();

    // Also bake category changes into games.json for maximum persistence
    await updateGamesJsonCategories();

    return {
      success: true,
      config: adminConfig,
      message: 'Admin configuration saved permanently'
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
  });
});
