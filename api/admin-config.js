// Vercel serverless function for admin configuration
// This handles GET and POST requests for admin settings

const db = require('./db');

// CORS headers for client access
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Token',
  'Content-Type': 'application/json'
};

// Simple admin token check (in production, use proper JWT/session management)
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'glm-admin-2024';

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Set CORS headers
  Object.entries(corsHeaders).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  try {
    if (req.method === 'GET') {
      // Return current admin configuration from database
      // This is public - all users get the admin's rules
      const adminConfig = await db.read();
      return res.status(200).json({
        success: true,
        config: adminConfig,
        message: 'Admin configuration retrieved'
      });
    }

    if (req.method === 'POST') {
      // Check admin authentication
      const adminToken = req.headers['x-admin-token'];
      
      if (adminToken !== ADMIN_TOKEN) {
        return res.status(401).json({
          success: false,
          message: 'Unauthorized - invalid admin token'
        });
      }

      // Update admin configuration in database
      const updates = req.body;
      const currentConfig = await db.read();
      
      if (updates.hiddenTabs !== undefined) {
        currentConfig.hiddenTabs = updates.hiddenTabs;
      }
      
      if (updates.gameCategories !== undefined) {
        currentConfig.gameCategories = { ...currentConfig.gameCategories, ...updates.gameCategories };
      }

      // Save to database
      const updatedConfig = await db.update(currentConfig);

      return res.status(200).json({
        success: true,
        config: updatedConfig,
        message: 'Admin configuration updated successfully and saved to database'
      });
    }

    return res.status(405).json({
      success: false,
      message: 'Method not allowed'
    });

  } catch (error) {
    console.error('Admin config error:', error);
    return res.status(500).json({
      success: false,
      message: 'Internal server error',
      error: error.message
    });
  }
};