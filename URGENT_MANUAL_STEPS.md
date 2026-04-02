# ⚠️ URGENT: Manual Steps Required on Render.com

## The Problem
Your site is currently deployed as a **Static Site** on Render.com. This CANNOT be automatically converted to a Web Service. You must do this MANUALLY.

## 🔴 IMMEDIATE ACTION REQUIRED

### Step 1: Go to Render Dashboard
👉 **Open**: https://dashboard.render.com

### Step 2: Delete Current Static Site
1. Find `game-library-manager-web` (Static Site)
2. Click on it
3. Go to **Settings** tab
4. Scroll to bottom
5. Click **Delete Static Site**
6. Confirm deletion

### Step 3: Create New Web Service
1. Click **New +** button (top right)
2. Select **Web Service**
3. Choose **Build and deploy from a Git repository**
4. Click **Next**

### Step 4: Connect Repository
1. If not connected, connect your GitHub account
2. Select repository: `Michaelunkai/game-library-manager-web`
3. Click **Connect**

### Step 5: Configure Web Service
Fill in these EXACT settings:

- **Name**: `game-library-manager-web`
- **Region**: Choose closest to you (e.g., Oregon USA)
- **Branch**: `main`
- **Runtime**: `Node`
- **Build Command**: `npm install`
- **Start Command**: `node server.js`
- **Instance Type**: **FREE** ($0/month)

### Step 6: Add Environment Variables
Click **Advanced** and add these:

| Key | Value |
|-----|-------|
| NODE_ENV | production |
| ADMIN_TOKEN | glm-admin-2024 |
| PORT | 10000 |

### Step 7: Create Web Service
Click **Create Web Service** button

## ⏳ Wait 5-10 minutes for deployment

### Step 8: Verify Deployment
After deployment completes, test:

1. **Check API**: 
   ```
   https://game-library-manager-web.onrender.com/api/admin-config
   ```
   Should return JSON, not "Not Found"

2. **Test Admin**:
   - Go to site
   - Enter password: `Blackablacka3!`
   - Hide some tabs
   - Refresh page - changes should persist

## 🎯 Expected Result
- ✅ Server running (API responds)
- ✅ Admin features work
- ✅ Changes persist across browsers
- ✅ Data saves to server

## ⚠️ Common Issues

### If you see "Service Suspended"
- Make sure you selected **FREE** tier
- Check you haven't exceeded free tier limits

### If API still returns 404
- Check Start Command is: `node server.js`
- Check Build Command is: `npm install`
- Check logs in Render dashboard

### If site doesn't load
- Wait for "Live" status in Render dashboard
- First load after deployment takes 30-60 seconds

## 📞 Need Help?
Check deployment logs in Render dashboard under **Logs** tab.

**Time Required**: 10-15 minutes total
**Cost**: FREE ($0/month)

---
⏰ **DO THIS NOW** - The admin features won't work until you complete these steps!