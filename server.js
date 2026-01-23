const express = require('express');
const path = require('path');
const fs = require('fs').promises;
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Admin configuration storage
let adminConfig = {
  hiddenTabs: [],
  gameCategories: {},
  lastUpdated: new Date().toISOString()
};

// Mutex for concurrent admin operations
let configMutex = Promise.resolve();

// Ensure data directory exists
async function ensureDataDirectory() {
  try {
    await fs.mkdir('./data', { recursive: true });
  } catch (error) {
    // Directory might already exist, that's ok
  }
}

// Load config from file on startup
async function loadConfig() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile('./data/admin-config.json', 'utf8');
    adminConfig = JSON.parse(data);
    console.log('Loaded admin config from file');
  } catch (error) {
    console.log('Using default admin config, will create file on first save');
    // Initialize with default hidden tabs
    adminConfig = {
      hiddenTabs: [],
      gameCategories: {},
      lastUpdated: new Date().toISOString()
    };
  }
}

// Save config to file with atomic write
async function saveConfig() {
  try {
    await ensureDataDirectory();
    const tempFile = './data/admin-config.json.tmp';
    // Write to temp file first
    await fs.writeFile(tempFile, JSON.stringify(adminConfig, null, 2));
    // Atomic rename
    await fs.rename(tempFile, './data/admin-config.json');
    console.log('Saved admin config to file');
  } catch (error) {
    console.error('Failed to save config:', error);
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
    // Reload config from file to get latest state
    try {
      const data = await fs.readFile('./data/admin-config.json', 'utf8');
      adminConfig = JSON.parse(data);
    } catch (error) {
      // If file doesn't exist yet, use current in-memory config
    }

    // Update configuration with merge logic
    const updates = req.body;

    if (updates.hiddenTabs !== undefined) {
      // Merge with existing hidden tabs instead of replacing
      const existingTabs = new Set(adminConfig.hiddenTabs || []);
      updates.hiddenTabs.forEach(tab => existingTabs.add(tab));
      adminConfig.hiddenTabs = Array.from(existingTabs);
    }

    if (updates.gameCategories !== undefined) {
      adminConfig.gameCategories = { ...adminConfig.gameCategories, ...updates.gameCategories };
    }

    adminConfig.lastUpdated = new Date().toISOString();

    // Save to file atomically
    await saveConfig();

    return {
      success: true,
      config: adminConfig,
      message: 'Admin configuration updated successfully'
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

// Serve static files from public/data
app.use('/data', express.static(path.join(__dirname, 'public', 'data')));

// Catch-all route to serve index.html
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize and start server
loadConfig().then(() => {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin config endpoint: http://localhost:${PORT}/api/admin-config`);
  });
});