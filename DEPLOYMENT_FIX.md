# CRITICAL: Deployment Fix Required

## Current Problem
The Node.js server (`server.js`) is NOT running on Render.com. The site is deployed as a **Static Site** instead of a **Web Service**, which means:
- `/api/admin-config` endpoint returns 404
- Admin features don't persist across browsers
- Hidden tabs are only stored in localStorage (browser-specific)

## Solution: Convert to Web Service on Render

### Manual Steps Required on Render Dashboard:

1. **Go to Render Dashboard**: https://dashboard.render.com
2. **Delete the current Static Site**: `game-library-manager-web`
3. **Create New Web Service**:
   - Click "New +"
   - Select "Web Service"
   - Connect to GitHub repository: `Michaelunkai/game-library-manager-web`
   - Configure:
     - **Name**: `game-library-manager-web`
     - **Environment**: Node
     - **Build Command**: `npm install`
     - **Start Command**: `npm start`
     - **Add Environment Variable**:
       - Key: `ADMIN_TOKEN`
       - Value: `glm-admin-2024`
4. **Deploy**

## Files Already Prepared:
- ✅ `server.js` - Express server with admin API endpoints
- ✅ `render.yaml` - Render configuration file (for automatic detection)
- ✅ `package.json` - Has correct `start` script: `node server.js`
- ✅ `data/admin-config.json` - Default admin configuration with 5 hidden tabs
- ✅ Admin password updated to: `admin2024`

## Testing After Deployment:
1. Check API endpoint: `curl https://game-library-manager-web.onrender.com/api/admin-config`
2. Login as admin with password: `admin2024`
3. Hide/show tabs and verify persistence across browsers
4. Open in incognito mode to verify non-admins can't see hidden tabs

## Current Hidden Tabs (for non-admins):
1. win11maintaince
2. 3th_party_tools
3. gamedownloaders
4. oporationsystems
5. music

## Local Testing (Working):
- Server runs on http://localhost:3000
- Admin features fully functional
- Cross-browser persistence confirmed locally