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

// Load config from file on startup
async function loadConfig() {
  try {
    const data = await fs.readFile('./data/admin-config.json', 'utf8');
    adminConfig = JSON.parse(data);
    console.log('Loaded admin config from file');
  } catch (error) {
    console.log('Using default admin config');
  }
}

// Save config to file
async function saveConfig() {
  try {
    await fs.writeFile('./data/admin-config.json', JSON.stringify(adminConfig, null, 2));
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

  // Update configuration
  const updates = req.body;
  
  if (updates.hiddenTabs !== undefined) {
    adminConfig.hiddenTabs = updates.hiddenTabs;
  }
  
  if (updates.gameCategories !== undefined) {
    adminConfig.gameCategories = { ...adminConfig.gameCategories, ...updates.gameCategories };
  }

  adminConfig.lastUpdated = new Date().toISOString();
  
  // Save to file
  await saveConfig();

  res.json({
    success: true,
    config: adminConfig,
    message: 'Admin configuration updated successfully'
  });
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