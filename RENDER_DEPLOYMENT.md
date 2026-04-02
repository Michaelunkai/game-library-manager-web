# 🚀 Render.com Deployment Instructions

## URGENT: Convert from Static Site to Web Service

### Current Problem
The site is deployed as a **Static Site** on Render.com, which means:
- ❌ No server running (server.js not executed)
- ❌ API endpoints return 404
- ❌ Admin features don't persist
- ❌ No cross-browser synchronization

### Solution: Deploy as Web Service (FREE)

## Step-by-Step Instructions

### Method 1: Using render.yaml (Automatic)
1. **Delete current Static Site** on Render Dashboard
2. **Create New > Web Service**
3. **Connect GitHub repository**: `Michaelunkai/game-library-manager-web`
4. Render will detect `render.yaml` and configure automatically
5. Click **Create Web Service**

### Method 2: Manual Configuration
1. **Go to**: https://dashboard.render.com
2. **Delete** the current Static Site deployment
3. **Click** "New +" → "Web Service"
4. **Connect** to GitHub repository: `Michaelunkai/game-library-manager-web`
5. **Configure**:
   - **Name**: `game-library-manager-web`
   - **Region**: Choose closest to you
   - **Branch**: `main`
   - **Runtime**: Node
   - **Build Command**: `npm install`
   - **Start Command**: `node server.js`
   - **Plan**: FREE ($0/month)
6. **Add Environment Variables**:
   - `NODE_ENV` = `production`
   - `ADMIN_TOKEN` = `glm-admin-2024`
   - `PORT` = `10000`
7. **Click** "Create Web Service"

## Deployment will take 5-10 minutes

### After Deployment
The site URL will change from:
- Old: `https://game-library-manager-web.onrender.com` (Static)
- New: `https://game-library-manager-web.onrender.com` (Web Service)

## Testing the Deployment

### 1. Check API is working:
```bash
curl https://game-library-manager-web.onrender.com/api/admin-config
```

Should return:
```json
{
  "success": true,
  "config": {
    "hiddenTabs": [],
    "gameCategories": {},
    "lastUpdated": "..."
  }
}
```

### 2. Test Admin Features:
1. Go to: https://game-library-manager-web.onrender.com
2. Enter admin password: `Blackablacka3!`
3. Click eye icons to hide/show tabs
4. Changes should persist across browsers

## Files Ready for Deployment
- ✅ `server.js` - Express server with API
- ✅ `package.json` - Dependencies and start script
- ✅ `render.yaml` - Render configuration
- ✅ `public/` - Frontend files
- ✅ `data/admin-config.json` - Admin configuration

## Important Notes
- **FREE tier** includes 750 hours/month (enough for 24/7 operation)
- Server may sleep after 15 minutes of inactivity
- First request after sleep takes ~30 seconds (cold start)
- Data persists in `data/` directory

## Admin Credentials
- **Password**: `Blackablacka3!`
- **API Token**: `glm-admin-2024`

## Support
If deployment fails, check:
1. Build logs in Render dashboard
2. Ensure all files are committed to GitHub
3. Verify environment variables are set

Last updated: January 22, 2025