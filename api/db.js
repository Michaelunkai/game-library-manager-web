// Simple JSON file-based database for Vercel
// In production, use a proper database like MongoDB or PostgreSQL

const fs = require('fs').promises;
const path = require('path');

// Path to store data (in /tmp on Vercel)
const DATA_FILE = '/tmp/admin-config.json';

// Default configuration
const DEFAULT_CONFIG = {
  hiddenTabs: [],
  gameCategories: {},
  lastUpdated: new Date().toISOString()
};

class Database {
  async read() {
    try {
      const data = await fs.readFile(DATA_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error) {
      // File doesn't exist or is corrupt, return default
      return DEFAULT_CONFIG;
    }
  }

  async write(data) {
    try {
      await fs.writeFile(DATA_FILE, JSON.stringify(data, null, 2));
      return true;
    } catch (error) {
      console.error('Failed to write database:', error);
      return false;
    }
  }

  async update(updates) {
    const current = await this.read();
    const updated = { ...current, ...updates, lastUpdated: new Date().toISOString() };
    await this.write(updated);
    return updated;
  }
}

module.exports = new Database();