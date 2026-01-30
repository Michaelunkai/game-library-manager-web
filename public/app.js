/**
 * Game Library Manager v4.0 - Enhanced UX Edition
 * A full-featured Docker game library manager with premium UX
 *
 * Features:
 * - Bulk selection and run multiple games
 * - .bat file download for Windows (double-click to run)
 * - Full Docker paths for michadockermisha/backup repo
 * - Custom mount path selection
 * - Enhanced animations and micro-interactions
 * - Improved mobile experience
 * - Scroll-to-top functionality
 * - Keyboard shortcuts
 * - Smooth loading states
 */

class GameLibrary {
    constructor() {
        this.games = [];
        this.tabs = [];
        this.times = {};
        this.imageSizes = {};
        this.datesAdded = {};
        this.filteredGames = [];
        this.selectedGames = new Set();
        this.installedGames = new Set();
        this.hiddenTabs = new Set();
        this.currentTab = 'all';
        this.searchQuery = '';
        this.sortBy = 'name';
        this.sortOrder = 'asc';
        this.showInstalledOnly = false;
        this.isAdmin = false;
        // SHA-256 hash of admin password - NEVER store plaintext passwords in source code
        // Password: Blackablacka3!
        this.adminHash = 'fba92b2c989a5072544ca49d7f75db2005e6479bf286a38902de90e487230762';

        // ADMIN-ONLY TABS: These tabs and ALL games within them are ONLY visible to admins
        // Regular users will NEVER see these tabs or their contents under any circumstances
        this.ADMIN_ONLY_TABS = new Set([
            'not_for_me',      // meh
            'finished',        // Finished
            'mybackup',        // MyBackup
            'oporationsystems', // OporationSystems
            'music',           // music
            'win11maintaince', // Win11Maintaince
            '3th_party_tools', // 3th party tools
            'gamedownloaders'  // GameDownloaders
        ]);

        this.settings = this.loadSettings();

        this.init();
    }

    async init() {
        this.showLoading(true);
        this.detectOS();
        this.bindEvents();
        this.applySettings();
        this.setupScrollEffects();
        this.setupMobileSidebar();
        this.setupKeyboardHints();

        // CRITICAL: Ensure non-admin state on page load - users must login to get admin access
        this.ensureNonAdminState();

        // Load admin configuration from SERVER (not localStorage) - this affects ALL users
        await this.loadAdminConfigFromServer();

        try {
            await this.loadData();
            this.renderTabs();
            this.filterAndRender();
            this.showLoading(false);
            this.updateSelectedCount();

            // Start automatic Docker Hub sync (every 30 seconds)
            this.startAutoSync();
            
            // Start polling for admin config changes (every 5 seconds)
            this.startAdminConfigPolling();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showToast('Failed to load game data', 'error');
            this.showLoading(false);
        }
    }
    
    // Poll server for admin configuration changes
    startAdminConfigPolling() {
        // Check for updates every 5 seconds
        this.configPollInterval = setInterval(async () => {
            if (!this.isAdmin) { // Non-admins need to check for updates
                const previousHiddenCount = this.hiddenTabs.size;
                await this.loadAdminConfigFromServer();
                
                // If config changed, re-render
                if (previousHiddenCount !== this.hiddenTabs.size) {
                    this.renderTabs();
                    this.filterAndRender();
                    this.showToast('📡 Admin rules updated from server', 'info');
                }
            }
        }, 5000);
        
        console.log('🔄 Admin config polling started: checking every 5 seconds');
    }

    startAutoSync() {
        // Poll every 60 seconds for new tags - Reduced rate limiting on CORS proxies
        this.syncInterval = setInterval(() => {
            this.autoSyncDockerHub();
        }, 60000);

        // Also update sync button to show auto-sync is active
        const syncBtn = document.getElementById('syncDockerBtn');
        if (syncBtn) {
            syncBtn.title = 'Auto-syncing every 60s (click to sync now)';
        }

        console.log('🔄 Auto-sync started: checking Docker Hub every 60 seconds');
    }

    async autoSyncDockerHub() {
        try {
            const dockerUser = this.settings.dockerUsername || 'michadockermisha';
            const repoName = this.settings.repoName || 'backup';

            const allTags = await this.fetchAllDockerTags(dockerUser, repoName);
            if (allTags.length === 0) return;

            const existingIds = new Set(this.games.map(g => g.id.toLowerCase()));
            const newTags = allTags.filter(tag => !existingIds.has(tag.name.toLowerCase()));

            if (newTags.length > 0) {
                console.log(`🆕 Auto-sync found ${newTags.length} new tags!`);

                for (const tag of newTags) {
                    this.games.push({
                        id: tag.name,
                        name: this.formatGameName(tag.name),
                        category: 'new'
                    });

                    if (tag.full_size) {
                        this.imageSizes[tag.name] = Math.round(tag.full_size / 1073741824 * 100) / 100;
                    }
                    this.datesAdded[tag.name] = new Date().toISOString().split('T')[0];
                }

                // Add 'new' tab if needed
                if (!this.tabs.find(t => t.id === 'new')) {
                    this.tabs.push({ id: 'new', name: 'New', icon: '🆕' });
                    this.renderTabs();
                }

                this.saveNewGames(newTags.map(t => t.name));
                document.getElementById('gameCount').textContent = this.games.length;
                this.filterAndRender();

                // Show notification
                this.showToast(`🆕 ${newTags.length} new game(s) synced from Docker Hub!`, 'success');
            }
        } catch (error) {
            console.error('Auto-sync error:', error);
        }
    }

    async loadData() {
        // Cache-bust to always get fresh data
        const cacheBuster = `?_=${Date.now()}`;

        const [gamesData, tabsData, timesData, imageSizesData, datesAddedData] = await Promise.all([
            fetch('data/games.json' + cacheBuster).then(r => r.json()),
            fetch('data/tabs.json' + cacheBuster).then(r => r.json()),
            fetch('data/times.json' + cacheBuster).then(r => r.json()),
            fetch('data/image-sizes.json' + cacheBuster).then(r => r.json()),
            fetch('data/dates-added.json' + cacheBuster).then(r => r.json())
        ]);

        this.games = gamesData;
        this.tabs = tabsData;
        this.times = timesData;
        this.imageSizes = imageSizesData;
        this.datesAdded = datesAddedData;

        console.log(`📦 Loaded ${this.games.length} games from games.json`);

        // Clear old localStorage if game count changed significantly (new version deployed)
        const savedCount = localStorage.getItem('lastGameCount');
        if (savedCount && Math.abs(parseInt(savedCount) - this.games.length) > 10) {
            console.log(`🔄 Game count changed (${savedCount} → ${this.games.length}), clearing cache`);
            localStorage.removeItem('gameLibraryGames');
            localStorage.removeItem('newGamesFromDocker');
        }
        localStorage.setItem('lastGameCount', this.games.length.toString());

        // Load any saved game category changes from localStorage (only categories, not game list)
        this.loadSavedGameChanges();

        // Load installed games from localStorage
        this.loadInstalledGames();

        // Update counts immediately
        document.getElementById('gameCount').textContent = this.games.length;
        document.getElementById('tabCount').textContent = `${this.tabs.length} tabs`;

        // Sync with Docker Hub IMMEDIATELY for any new tags not in games.json yet
        await this.syncDockerHubTags();
    }

    async syncDockerHubTags() {
        try {
            const dockerUser = this.settings.dockerUsername || 'michadockermisha';
            const repoName = this.settings.repoName || 'backup';

            // Fetch all tags from Docker Hub
            const allTags = await this.fetchAllDockerTags(dockerUser, repoName);

            if (allTags.length === 0) {
                console.log('No tags fetched from Docker Hub');
                return;
            }

            console.log(`Fetched ${allTags.length} tags from Docker Hub`);

            // Get existing game IDs
            const existingIds = new Set(this.games.map(g => g.id.toLowerCase()));

            // Update dates and sizes for ALL tags (including existing ones)
            let datesUpdated = 0;
            for (const tag of allTags) {
                if (tag.last_updated) {
                    const date = tag.last_updated.split('T')[0];
                    if (this.datesAdded[tag.name] !== date) {
                        this.datesAdded[tag.name] = date;
                        datesUpdated++;
                    }
                }
                if (tag.full_size) {
                    this.imageSizes[tag.name] = Math.round(tag.full_size / 1073741824 * 100) / 100;
                }
            }

            // Find new tags
            const newTags = allTags.filter(tag => !existingIds.has(tag.name.toLowerCase()));

            if (newTags.length > 0) {
                console.log(`Found ${newTags.length} new tags from Docker Hub`);

                // Add new games
                for (const tag of newTags) {
                    const newGame = {
                        id: tag.name,
                        name: this.formatGameName(tag.name),
                        category: 'new'
                    };

                    this.games.push(newGame);

                    // Use actual Docker Hub date if available
                    if (tag.last_updated) {
                        this.datesAdded[tag.name] = tag.last_updated.split('T')[0];
                    } else {
                        this.datesAdded[tag.name] = new Date().toISOString().split('T')[0];
                    }
                }

                // Add 'new' tab if it doesn't exist
                if (!this.tabs.find(t => t.id === 'new')) {
                    this.tabs.push({ id: 'new', name: 'New', icon: '🆕' });
                }

                // Save new games to localStorage
                this.saveNewGames(newTags.map(t => t.name));

                // Update UI
                document.getElementById('gameCount').textContent = this.games.length;
                this.renderTabs();
                this.filterAndRender();

                this.showToast(`Found ${newTags.length} new games from Docker Hub!`, 'success');
            } else if (datesUpdated > 0) {
                // Re-render if dates were updated for proper sorting
                this.filterAndRender();
            }
        } catch (error) {
            console.error('Failed to sync Docker Hub tags:', error);
        }
    }

    async fetchAllDockerTags(dockerUser, repoName) {
        const pageSize = 100;
        const cacheBuster = Date.now();

        // ROBUST CORS proxy list - multiple fallbacks for reliability
        // Prioritized by reliability and speed
        const corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://proxy.cors.sh/',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://corsproxy.org/?',
            'https://thingproxy.freeboard.io/fetch/',
            'https://cors-anywhere.herokuapp.com/'
        ];

        // Track which proxy works best (persisted in memory for this session)
        if (!this._workingProxyIndex) this._workingProxyIndex = 0;

        // Show sync status
        const syncBtn = document.getElementById('syncDockerBtn');
        const updateSyncStatus = (msg) => {
            if (syncBtn) {
                syncBtn.classList.add('syncing');
                syncBtn.textContent = msg;
            }
        };
        updateSyncStatus('🔄 Syncing...');

        // Helper to fetch with timeout
        const fetchWithTimeout = async (url, timeout = 15000) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal,
                    cache: 'no-store'
                });
                clearTimeout(timeoutId);
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const data = await response.json();
                if (!data || typeof data !== 'object') throw new Error('Invalid JSON');
                return data;
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        };

        // Try a single proxy for a URL
        const tryProxy = async (proxy, url) => {
            const fullUrl = proxy + encodeURIComponent(url);
            return await fetchWithTimeout(fullUrl);
        };

        // Fetch a page with AGGRESSIVE retry logic - NEVER give up easily
        const fetchPageWithRetry = async (page, maxRetries = 5) => {
            const dockerUrl = `https://hub.docker.com/v2/repositories/${dockerUser}/${repoName}/tags?page=${page}&page_size=${pageSize}&_=${cacheBuster}_${page}`;
            
            // Try 1: Race all proxies (fastest wins)
            try {
                const racePromises = corsProxies.map((proxy, idx) => 
                    tryProxy(proxy, dockerUrl).then(data => ({ data, proxyIdx: idx }))
                );
                const result = await Promise.any(racePromises);
                if (result.data && result.data.results) {
                    this._workingProxyIndex = result.proxyIdx; // Remember working proxy
                    return result.data;
                }
            } catch (e) {
                console.log(`Page ${page}: Race failed, trying sequential...`);
            }

            // Try 2: Sequential fallback with retries - start with last working proxy
            for (let retry = 0; retry < maxRetries; retry++) {
                const startIdx = this._workingProxyIndex || 0;
                for (let i = 0; i < corsProxies.length; i++) {
                    const proxyIdx = (startIdx + i) % corsProxies.length;
                    const proxy = corsProxies[proxyIdx];
                    try {
                        const data = await tryProxy(proxy, dockerUrl);
                        if (data && data.results) {
                            this._workingProxyIndex = proxyIdx;
                            console.log(`Page ${page}: Success with proxy ${proxyIdx} on retry ${retry}`);
                            return data;
                        }
                    } catch (e) {
                        // Continue to next proxy
                    }
                }
                // Wait before retry with exponential backoff
                if (retry < maxRetries - 1) {
                    const delay = Math.min(1000 * Math.pow(2, retry), 8000);
                    await new Promise(r => setTimeout(r, delay));
                }
            }

            console.error(`Page ${page}: ALL retries exhausted!`);
            return null;
        };

        try {
            // Step 1: Fetch first page to get total count (CRITICAL - retry more)
            updateSyncStatus('🔄 Connecting...');
            let firstPage = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                firstPage = await fetchPageWithRetry(1, 3);
                if (firstPage && firstPage.results) break;
                console.log(`First page attempt ${attempt + 1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
            }

            if (!firstPage || !firstPage.results) {
                console.error('❌ Failed to fetch first page from Docker Hub after all retries');
                this.showToast('Failed to connect to Docker Hub. Try again later.', 'error');
                return [];
            }

            const totalCount = firstPage.count || 0;
            const totalPages = Math.ceil(totalCount / pageSize);
            console.log(`📦 Docker Hub: ${totalCount} total tags across ${totalPages} pages`);
            updateSyncStatus(`🔄 0/${totalPages}`);

            // Step 2: Collect all tags, tracking which pages we got
            const tagsByPage = new Map();
            tagsByPage.set(1, firstPage.results);

            // Fetch remaining pages in small batches with retry
            if (totalPages > 1) {
                const remainingPages = [];
                for (let p = 2; p <= totalPages; p++) {
                    remainingPages.push(p);
                }

                // Process in batches of 3 (conservative to avoid rate limits)
                const batchSize = 3;
                for (let i = 0; i < remainingPages.length; i += batchSize) {
                    const batch = remainingPages.slice(i, i + batchSize);
                    updateSyncStatus(`🔄 ${tagsByPage.size}/${totalPages}`);
                    
                    const batchResults = await Promise.all(
                        batch.map(p => fetchPageWithRetry(p, 5).then(data => ({ page: p, data })))
                    );

                    for (const { page, data } of batchResults) {
                        if (data && data.results && data.results.length > 0) {
                            tagsByPage.set(page, data.results);
                        }
                    }

                    // Small delay between batches to be nice to proxies
                    if (i + batchSize < remainingPages.length) {
                        await new Promise(r => setTimeout(r, 500));
                    }
                }
            }

            // Step 3: Check for missing pages and retry them
            const missingPages = [];
            for (let p = 1; p <= totalPages; p++) {
                if (!tagsByPage.has(p)) {
                    missingPages.push(p);
                }
            }

            if (missingPages.length > 0) {
                console.log(`⚠️ Missing ${missingPages.length} pages: ${missingPages.join(', ')}. Retrying...`);
                updateSyncStatus(`🔄 Retrying ${missingPages.length} pages...`);
                
                for (const page of missingPages) {
                    // Extra aggressive retry for missing pages
                    const data = await fetchPageWithRetry(page, 10);
                    if (data && data.results) {
                        tagsByPage.set(page, data.results);
                        console.log(`✅ Recovered page ${page}`);
                    } else {
                        console.error(`❌ Could not recover page ${page}`);
                    }
                    await new Promise(r => setTimeout(r, 1000));
                }
            }

            // Step 4: Combine all tags in page order
            const allTags = [];
            for (let p = 1; p <= totalPages; p++) {
                const pageTags = tagsByPage.get(p);
                if (pageTags) {
                    allTags.push(...pageTags);
                }
            }

            // Final verification
            const expectedCount = totalCount;
            const actualCount = allTags.length;
            const missingCount = expectedCount - actualCount;

            if (missingCount > 0) {
                console.warn(`⚠️ Fetched ${actualCount}/${expectedCount} tags (${missingCount} missing)`);
            } else {
                console.log(`✅ Successfully fetched ALL ${actualCount} tags from Docker Hub!`);
            }

            return allTags;
        } catch (error) {
            console.error('Error fetching Docker tags:', error);
            return [];
        } finally {
            // Reset sync button
            if (syncBtn) {
                syncBtn.classList.remove('syncing');
                syncBtn.textContent = '🔄 Sync';
            }
        }
    }

    formatGameName(tagName) {
        // Convert tag name to readable game name
        let name = tagName;

        // Add spaces before numbers
        name = name.replace(/(\d+)/g, ' $1');

        // Add spaces before capital letters
        name = name.replace(/([a-z])([A-Z])/g, '$1 $2');

        // Capitalize first letter of each word
        name = name.split(' ').map(word =>
            word.charAt(0).toUpperCase() + word.slice(1)
        ).join(' ');

        // Clean up multiple spaces
        name = name.replace(/\s+/g, ' ').trim();

        return name;
    }

    saveNewGames(newGameIds) {
        try {
            const saved = localStorage.getItem('newGamesFromDocker') || '[]';
            const existing = JSON.parse(saved);
            const combined = [...new Set([...existing, ...newGameIds])];
            localStorage.setItem('newGamesFromDocker', JSON.stringify(combined));
        } catch (e) {
            console.error('Failed to save new games:', e);
        }
    }

    loadSavedNewGames() {
        try {
            const saved = localStorage.getItem('newGamesFromDocker');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    async manualSync() {
        const btn = document.getElementById('syncDockerBtn');
        const originalText = btn.textContent;

        btn.textContent = '⏳ Syncing...';
        btn.disabled = true;

        try {
            await this.syncDockerHubTags();
            document.getElementById('gameCount').textContent = this.games.length;
            this.renderTabs();
            this.filterAndRender();
        } catch (error) {
            this.showToast('Sync failed: ' + error.message, 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    }

    detectOS() {
        const platform = navigator.platform.toLowerCase();
        const userAgent = navigator.userAgent.toLowerCase();

        if (platform.includes('win') || userAgent.includes('windows')) {
            this.os = 'windows';
        } else if (platform.includes('mac') || userAgent.includes('mac')) {
            this.os = 'mac';
        } else {
            this.os = 'linux';
        }

        document.getElementById('detectedOS').textContent =
            this.os.charAt(0).toUpperCase() + this.os.slice(1);
    }

    bindEvents() {
        // Admin login
        const adminPassword = document.getElementById('adminPassword');
        adminPassword.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.attemptAdminLogin(e.target.value);
                e.target.value = '';
            }
        });

        // Admin logout
        document.getElementById('logoutBtn').addEventListener('click', () => {
            this.adminLogout();
        });

        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndRender();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
            if (e.key === 'Escape') {
                this.closeAllModals();
            }
        });

        // Theme toggle
        document.getElementById('themeBtn').addEventListener('click', () => {
            this.toggleTheme();
        });

        // Settings
        document.getElementById('settingsBtn').addEventListener('click', () => {
            this.openSettings();
        });

        document.getElementById('settingsClose').addEventListener('click', () => {
            this.closeModal('settingsModal');
        });

        // Sort button
        document.getElementById('sortBtn').addEventListener('click', (e) => {
            this.toggleSortMenu(e);
        });

        // Sort options
        document.querySelectorAll('.sort-option').forEach(btn => {
            btn.addEventListener('click', (e) => {
                this.handleSort(e.target.dataset.sort, e.target.dataset.order);
            });
        });

        // Modal close
        document.getElementById('modalClose').addEventListener('click', () => {
            this.closeModal('gameModal');
        });

        // Copy command
        document.getElementById('copyCommand').addEventListener('click', () => {
            this.copyToClipboard();
        });

        // Run Docker (single game)
        document.getElementById('runDockerBtn').addEventListener('click', () => {
            this.runInTerminal();
        });

        // Copy Script
        document.getElementById('copyScriptBtn').addEventListener('click', () => {
            this.copyScript();
        });

        // Action bar buttons
        document.getElementById('syncDockerBtn').addEventListener('click', () => {
            this.manualSync();
        });

        document.getElementById('showInstalledBtn').addEventListener('click', () => {
            this.toggleInstalledFilter();
        });

        document.getElementById('selectAllBtn').addEventListener('click', () => {
            this.selectAllVisible();
        });

        document.getElementById('deselectAllBtn').addEventListener('click', () => {
            this.deselectAll();
        });

        document.getElementById('runSelectedBtn').addEventListener('click', () => {
            this.runSelectedGames();
        });

        document.getElementById('killContainersBtn').addEventListener('click', () => {
            this.downloadKillScript();
        });

        // Format dropdown for Run Selected button
        document.getElementById('runFormatBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleRunFormatMenu(e);
        });

        // Format dropdown for Kill All button
        document.getElementById('killFormatBtn').addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleKillFormatMenu(e);
        });

        // Format options click handlers for Run menu
        document.querySelectorAll('#runFormatMenu .format-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = e.target.dataset.format;
                if (this.selectedGames.size > 0) {
                    this.downloadRunScript([...this.selectedGames], format);
                } else {
                    this.showToast('No games selected', 'error');
                }
                document.getElementById('runFormatMenu').style.display = 'none';
            });
        });

        // Format options click handlers for Kill menu
        document.querySelectorAll('#killFormatMenu .format-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const format = e.target.dataset.format;
                this.downloadKillScript(format);
                document.getElementById('killFormatMenu').style.display = 'none';
            });
        });

        // Modal .BAT download button
        document.getElementById('runDockerBatBtn').addEventListener('click', () => {
            this.runInTerminal('bat');
        });

        // Move To button
        document.getElementById('moveToBtn').addEventListener('click', (e) => {
            this.toggleMoveToMenu(e);
        });

        // Global mount path
        document.getElementById('globalMountPath').addEventListener('change', (e) => {
            this.settings.mountPath = e.target.value;
            this.saveSettings();
            document.getElementById('mountPath').value = e.target.value;
        });

        // Settings controls
        document.getElementById('gridSize').addEventListener('change', (e) => {
            this.settings.gridSize = e.target.value;
            this.saveSettings();
            this.applySettings();
        });

        document.getElementById('showTimes').addEventListener('change', (e) => {
            this.settings.showTimes = e.target.checked;
            this.saveSettings();
            this.filterAndRender();
        });

        document.getElementById('showCategories').addEventListener('change', (e) => {
            this.settings.showCategories = e.target.checked;
            this.saveSettings();
            this.filterAndRender();
        });

        document.getElementById('dockerUsername').addEventListener('change', (e) => {
            this.settings.dockerUsername = e.target.value;
            this.saveSettings();
        });

        document.getElementById('repoName').addEventListener('change', (e) => {
            this.settings.repoName = e.target.value;
            this.saveSettings();
        });

        document.getElementById('mountPath').addEventListener('change', (e) => {
            this.settings.mountPath = e.target.value;
            this.saveSettings();
            document.getElementById('globalMountPath').value = e.target.value;
        });

        // Export/Import
        document.getElementById('exportData').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('importData').addEventListener('click', () => {
            this.importData();
        });

        // Click outside to close menus
        document.addEventListener('click', (e) => {
            const sortMenu = document.getElementById('sortMenu');
            const sortBtn = document.getElementById('sortBtn');
            if (!sortMenu.contains(e.target) && !sortBtn.contains(e.target)) {
                sortMenu.style.display = 'none';
            }

            const moveToMenu = document.getElementById('moveToMenu');
            const moveToBtn = document.getElementById('moveToBtn');
            if (!moveToMenu.contains(e.target) && !moveToBtn.contains(e.target)) {
                moveToMenu.style.display = 'none';
            }

            // Close format menus
            const runFormatMenu = document.getElementById('runFormatMenu');
            const runFormatBtn = document.getElementById('runFormatBtn');
            if (runFormatMenu && !runFormatMenu.contains(e.target) && !runFormatBtn.contains(e.target)) {
                runFormatMenu.style.display = 'none';
            }

            const killFormatMenu = document.getElementById('killFormatMenu');
            const killFormatBtn = document.getElementById('killFormatBtn');
            if (killFormatMenu && !killFormatMenu.contains(e.target) && !killFormatBtn.contains(e.target)) {
                killFormatMenu.style.display = 'none';
            }
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });
    }

    // Check if a tab is admin-only (hardcoded, cannot be changed by toggling)
    isTabAdminOnly(tabId) {
        return this.ADMIN_ONLY_TABS.has(tabId);
    }

    // Check if a tab should be hidden from non-admin users
    // This includes both admin-only tabs AND tabs marked as hidden by admin
    isTabHiddenForUser(tabId) {
        // Admin-only tabs are ALWAYS hidden for non-admins
        if (this.isTabAdminOnly(tabId) && !this.isAdmin) {
            return true;
        }
        // Regular hidden tabs (toggleable by admin)
        if (this.hiddenTabs.has(tabId) && !this.isAdmin) {
            return true;
        }
        return false;
    }

    renderTabs() {
        const container = document.getElementById('tabsContainer');
        container.innerHTML = '';

        this.tabs.forEach(tab => {
            const isAdminOnly = this.isTabAdminOnly(tab.id);
            const isHidden = this.hiddenTabs.has(tab.id);

            // CRITICAL: Admin-only tabs are NEVER shown to non-admins
            if (isAdminOnly && !this.isAdmin) {
                return;
            }

            // Skip other hidden tabs for non-admins
            if (isHidden && !this.isAdmin) {
                return;
            }

            const count = this.getTabCount(tab.id);
            const btn = document.createElement('button');
            btn.className = `tab-btn ${tab.id === this.currentTab ? 'active' : ''} ${isHidden ? 'hidden-tab' : ''} ${isAdminOnly ? 'admin-only-tab' : ''}`;

            // ONLY admins see visibility controls - NEVER show to non-admins
            if (this.isAdmin === true && tab.id !== 'all') {
                if (isAdminOnly) {
                    // Admin-only tabs show lock icon (cannot be toggled, permanently admin-only)
                    btn.innerHTML = `
                        <span>${tab.name}</span>
                        <span class="count">${count}</span>
                        <span class="admin-only-indicator" title="Admin-only tab (cannot be made public)">🔒</span>
                    `;
                } else {
                    // Regular tabs show visibility toggle
                    btn.innerHTML = `
                        <span>${tab.name}</span>
                        <span class="count">${count}</span>
                        <span class="tab-visibility-toggle" data-tab="${tab.id}" title="${isHidden ? 'Show to all' : 'Hide from non-admins'}">${isHidden ? '👁️‍🗨️' : '👁️'}</span>
                    `;
                }
            } else {
                btn.innerHTML = `
                    <span>${tab.name}</span>
                    <span class="count">${count}</span>
                `;
            }

            btn.addEventListener('click', (e) => {
                if (e.target.classList.contains('tab-visibility-toggle')) {
                    e.stopPropagation();
                    this.toggleTabVisibility(e.target.dataset.tab);
                } else {
                    this.selectTab(tab.id);
                }
            });
            container.appendChild(btn);
        });
    }

    getTabCount(tabId) {
        if (tabId === 'all') {
            // For non-admins, exclude games from admin-only tabs in the total count
            if (!this.isAdmin) {
                return this.games.filter(g => !this.ADMIN_ONLY_TABS.has(g.category)).length;
            }
            return this.games.length;
        }
        return this.games.filter(g => g.category === tabId).length;
    }

    selectTab(tabId) {
        // CRITICAL: Prevent non-admins from selecting admin-only tabs
        if (!this.isAdmin && this.isTabAdminOnly(tabId)) {
            this.showToast('Access denied: Admin-only tab', 'error');
            return;
        }
        this.currentTab = tabId;
        this.renderTabs();
        this.filterAndRender();
    }

    filterAndRender() {
        let filtered = this.currentTab === 'all'
            ? [...this.games]
            : this.games.filter(g => g.category === this.currentTab);

        // CRITICAL: Hide games from admin-only tabs for non-admins - this is MANDATORY
        if (!this.isAdmin) {
            filtered = filtered.filter(g => !this.ADMIN_ONLY_TABS.has(g.category));
        }

        // Hide games from other hidden tabs for non-admins
        if (!this.isAdmin && this.hiddenTabs.size > 0) {
            filtered = filtered.filter(g => !this.hiddenTabs.has(g.category));
        }

        if (this.searchQuery) {
            filtered = filtered.filter(g =>
                g.name.toLowerCase().includes(this.searchQuery) ||
                g.id.toLowerCase().includes(this.searchQuery) ||
                (g.category && g.category.toLowerCase().includes(this.searchQuery))
            );
        }

        // Filter by installed status if enabled
        if (this.showInstalledOnly) {
            filtered = filtered.filter(g => this.installedGames.has(g.id));
        }

        filtered.sort((a, b) => {
            let valA, valB;
            let hasA, hasB; // Track if values exist for proper fallback handling

            switch (this.sortBy) {
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    hasA = hasB = true;
                    break;
                case 'time':
                    hasA = this.times[a.id] !== undefined && this.times[a.id] !== null;
                    hasB = this.times[b.id] !== undefined && this.times[b.id] !== null;
                    valA = hasA ? this.times[a.id] : null;
                    valB = hasB ? this.times[b.id] : null;
                    break;
                case 'category':
                    valA = a.category || 'zzz';
                    valB = b.category || 'zzz';
                    hasA = hasB = true;
                    break;
                case 'size':
                    hasA = this.imageSizes[a.id] !== undefined && this.imageSizes[a.id] !== null;
                    hasB = this.imageSizes[b.id] !== undefined && this.imageSizes[b.id] !== null;
                    valA = hasA ? this.imageSizes[a.id] : null;
                    valB = hasB ? this.imageSizes[b.id] : null;
                    break;
                case 'date':
                    // Use current timestamp for comparison so "new" category games appear first when sorting newest-to-oldest
                    const nowTimestamp = Date.now();
                    
                    hasA = !!this.datesAdded[a.id];
                    hasB = !!this.datesAdded[b.id];
                    valA = hasA ? new Date(this.datesAdded[a.id]).getTime() : null;
                    valB = hasB ? new Date(this.datesAdded[b.id]).getTime() : null;
                    
                    // Games with "new" category but no date should be treated as newest (Date.now())
                    if (a.category === 'new' && !hasA) {
                        valA = nowTimestamp;
                        hasA = true;
                    }
                    if (b.category === 'new' && !hasB) {
                        valB = nowTimestamp;
                        hasB = true;
                    }
                    break;
                default:
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    hasA = hasB = true;
            }

            // Items without values always go to the end, regardless of sort order
            if (!hasA && !hasB) {
                // Both missing: sort by name for stability
                return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
            }
            if (!hasA) return 1;  // a goes to end
            if (!hasB) return -1; // b goes to end

            // Normal comparison for items with values
            if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;

            // Equal values: sort by name for stability
            return a.name.toLowerCase().localeCompare(b.name.toLowerCase());
        });

        this.filteredGames = filtered;
        document.getElementById('filteredCount').textContent = filtered.length;

        this.renderGames();
    }

    renderGames() {
        const grid = document.getElementById('gamesGrid');
        const noResults = document.getElementById('noResults');

        if (this.filteredGames.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            return;
        }

        noResults.style.display = 'none';
        grid.innerHTML = this.filteredGames.map(game => this.createGameCard(game)).join('');

        // Add click handlers for info button
        grid.querySelectorAll('.game-card').forEach(card => {
            const infoBtn = card.querySelector('.info-btn');
            const installBtn = card.querySelector('.install-btn');
            const checkbox = card.querySelector('.select-checkbox');

            // Info button opens modal
            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const gameId = card.dataset.id;
                const game = this.games.find(g => g.id === gameId);
                if (game) this.openGameModal(game);
            });

            // Install button toggles installed status
            installBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const gameId = card.dataset.id;
                this.toggleInstalled(gameId);
            });

            // Checkbox toggles selection
            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                const gameId = card.dataset.id;
                this.toggleGameSelection(gameId, e.target.checked);
            });

            // Card click toggles selection
            card.addEventListener('click', (e) => {
                if (e.target !== checkbox && !e.target.closest('.info-btn') && !e.target.closest('.install-btn')) {
                    const gameId = card.dataset.id;
                    checkbox.checked = !checkbox.checked;
                    this.toggleGameSelection(gameId, checkbox.checked);
                }
            });
        });

        this.lazyLoadImages();
    }

    createGameCard(game) {
        const time = this.times[game.id];
        const timeStr = time ? `${time}h` : 'N/A';
        const size = this.imageSizes[game.id];
        const sizeStr = size ? `${size} GB` : 'N/A';
        const imageName = game.id.toLowerCase();
        const isSelected = this.selectedGames.has(game.id);
        const isInstalled = this.installedGames.has(game.id);
        const isNew = game.category === 'new';

        return `
            <div class="game-card ${isSelected ? 'selected' : ''} ${isInstalled ? 'installed' : ''} ${isNew ? 'new-game' : ''}" data-id="${game.id}" role="article" aria-label="${game.name}">
                <input type="checkbox" class="select-checkbox" ${isSelected ? 'checked' : ''} aria-label="Select ${game.name}">
                ${isSelected ? '<span class="checkmark-icon">✓</span>' : ''}
                <button class="info-btn" title="View details" aria-label="View details for ${game.name}">ℹ️</button>
                <button class="install-btn ${isInstalled ? 'is-installed' : ''}" title="${isInstalled ? 'Mark as not installed' : 'Mark as installed'}" aria-label="${isInstalled ? 'Mark as not installed' : 'Mark as installed'}">${isInstalled ? '✅' : '📥'}</button>
                ${isNew ? '<div class="new-badge">🆕 NEW</div>' : ''}
                ${isInstalled ? '<div class="installed-badge">✓ Installed</div>' : ''}
                <div class="image-container">
                    <img
                        data-src="images/${imageName}.png"
                        src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect fill='%231f2937' width='300' height='400'/%3E%3Ctext x='150' y='200' text-anchor='middle' fill='%236366f1' font-size='40'%3E🎮%3C/text%3E%3C/svg%3E"
                        alt="${game.name}"
                        loading="lazy"
                        onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 300 400%22%3E%3Crect fill=%22%231f2937%22 width=%22300%22 height=%22400%22/%3E%3Ctext x=%22150%22 y=%22200%22 text-anchor=%22middle%22 fill=%22%236366f1%22 font-size=%2240%22%3E🎮%3C/text%3E%3C/svg%3E'"
                    >
                </div>
                <div class="card-info">
                    <div class="title" title="${game.name}">${game.name}</div>
                    <div class="meta">
                        ${this.settings.showCategories ? `<span class="category-badge">${game.category || 'uncategorized'}</span>` : ''}
                        ${this.settings.showTimes ? `<span class="time-badge">⏱️ ${timeStr}</span>` : ''}
                        <span class="size-badge">💾 ${sizeStr}</span>
                    </div>
                </div>
            </div>
        `;
    }

    toggleGameSelection(gameId, isSelected) {
        if (isSelected) {
            this.selectedGames.add(gameId);
        } else {
            this.selectedGames.delete(gameId);
        }

        // Update card visual
        const card = document.querySelector(`.game-card[data-id="${gameId}"]`);
        if (card) {
            card.classList.toggle('selected', isSelected);
        }

        this.updateSelectedCount();
    }

    updateSelectedCount() {
        const count = this.selectedGames.size;
        document.getElementById('selectedCount').textContent = count;

        const runBtn = document.getElementById('runSelectedBtn');
        runBtn.textContent = `▶️ Run Selected (${count})`;
        runBtn.disabled = count === 0;

        // Enable/disable the format dropdown button for Run Selected
        const runFormatBtn = document.getElementById('runFormatBtn');
        if (runFormatBtn) {
            runFormatBtn.disabled = count === 0;
        }

        const moveToBtn = document.getElementById('moveToBtn');
        const moveToContainer = document.querySelector('.move-to-container');

        // Hide Move To button for non-admins
        if (moveToContainer) {
            moveToContainer.style.display = this.isAdmin ? 'block' : 'none';
        }

        if (moveToBtn) {
            moveToBtn.disabled = count === 0 || !this.isAdmin;
        }
    }

    selectAllVisible() {
        this.filteredGames.forEach(game => {
            this.selectedGames.add(game.id);
        });
        this.filterAndRender();
        this.updateSelectedCount();
        this.showToast(`Selected ${this.filteredGames.length} games`, 'success');
    }

    deselectAll() {
        this.selectedGames.clear();
        this.filterAndRender();
        this.updateSelectedCount();
        this.showToast('All games deselected', 'info');
    }

    getDockerCommand(gameId) {
        const dockerUser = this.settings.dockerUsername || 'michadockermisha';
        const repoName = this.settings.repoName || 'backup';
        const mountPath = document.getElementById('globalMountPath').value || this.settings.mountPath || 'F:/Games';

        // Parse mountPath to get Docker mount format for Windows
        // e.g., "F:/Games" -> drive mount "F:/:/f/", internal path "/f/Games/"
        const driveLetter = mountPath.match(/^([A-Za-z]):/)?.[1]?.toLowerCase() || 'f';
        const pathAfterDrive = mountPath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/') || '/Games';
        const dockerMount = `${driveLetter.toUpperCase()}:/:/${driveLetter}/`;
        const internalPath = `/${driveLetter}${pathAfterDrive}`;

        // Full docker command with volume mount
        return `docker run -v "${dockerMount}" --rm --name ${gameId} ${dockerUser}/${repoName}:${gameId} sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home ${internalPath}/ && cd ${internalPath} && mv home ${gameId}"`;
    }

    openGameModal(game) {
        const modal = document.getElementById('gameModal');
        const time = this.times[game.id];
        const size = this.imageSizes[game.id];
        const imageName = game.id.toLowerCase();

        document.getElementById('modalTitle').textContent = game.name;
        document.getElementById('modalCategory').textContent = game.category || 'uncategorized';
        document.getElementById('modalTime').textContent = time ? `~${time} hours` : 'N/A';
        document.getElementById('modalSize').textContent = size ? `${size} GB` : 'N/A';
        document.getElementById('modalImage').src = `images/${imageName}.png`;
        document.getElementById('modalImage').onerror = function() {
            this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect fill='%231f2937' width='300' height='400'/%3E%3Ctext x='150' y='200' text-anchor='middle' fill='%236366f1' font-size='40'%3E🎮%3C/text%3E%3C/svg%3E";
        };

        const dockerCmd = this.getDockerCommand(game.id);
        document.getElementById('dockerCommand').textContent = dockerCmd;

        this.currentGame = game;
        modal.classList.add('active');
    }

    closeModal(modalId) {
        document.getElementById(modalId).classList.remove('active');
    }

    closeAllModals() {
        document.querySelectorAll('.modal').forEach(m => m.classList.remove('active'));
        document.getElementById('sortMenu').style.display = 'none';
    }

    copyToClipboard() {
        const command = document.getElementById('dockerCommand').textContent;
        navigator.clipboard.writeText(command).then(() => {
            this.showToast('Command copied to clipboard!', 'success');
        }).catch(() => {
            this.showToast('Failed to copy', 'error');
        });
    }

    runInTerminal(format = 'ps1') {
        if (!this.currentGame) return;
        this.downloadRunScript([this.currentGame.id], format);
    }

    runSelectedGames() {
        if (this.selectedGames.size === 0) {
            this.showToast('No games selected', 'error');
            return;
        }
        this.downloadRunScript([...this.selectedGames]);
    }

    downloadRunScript(gameIds, format = 'ps1') {
        const dockerUser = this.settings.dockerUsername || 'michadockermisha';
        const repoName = this.settings.repoName || 'backup';
        const mountPath = document.getElementById('globalMountPath').value || this.settings.mountPath || 'F:/Games';

        // Normalize the mount path for Docker on Windows
        // Docker Desktop accepts paths like "E:/Games" or "E:\Games"
        // We normalize to forward slashes for consistency
        const normalizedPath = mountPath.replace(/\\/g, '/');

        // For Windows Docker, we mount the user's chosen folder directly to /output inside container
        // This is simpler and more reliable than mounting the entire drive
        const dockerVolume = `"${normalizedPath}:/output"`;

        let script, filename;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const gameCount = gameIds.length;

        if (this.os === 'windows' && format === 'bat') {
            // Windows Batch script (.bat) - double-click to run!
            // Build combined pull+extract commands for each game (single-phase approach)
            const gameCommands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                return `
echo.
echo ############################################################
echo  GAME ${idx + 1}/${gameCount}: ${gameName}
echo ############################################################
echo [%date% %time%] Starting...
echo.

REM ============================================================
REM STEP 1: Pull the Docker image
REM ============================================================
echo [STEP 1/2] Pulling Docker image for ${gameName}...
set "PULL_SUCCESS=0"
set "RETRY_DELAY=5"
for /L %%i in (1,1,5) do (
    if !PULL_SUCCESS! EQU 0 (
        docker info >nul 2>&1
        if !ERRORLEVEL! NEQ 0 (
            echo [WARNING] Docker not responding, attempting recovery...
            call :recover_docker
        )

        docker pull ${dockerUser}/${repoName}:${id}
        if !ERRORLEVEL! EQU 0 (
            set "PULL_SUCCESS=1"
            echo [OK] Image pulled successfully!
        ) else (
            echo [RETRY %%i/5] Pull failed, retrying...
            ipconfig /flushdns >nul 2>&1
            call :recover_docker
            echo [INFO] Waiting !RETRY_DELAY! seconds...
            timeout /t !RETRY_DELAY! /nobreak >nul
            set /a "RETRY_DELAY=RETRY_DELAY*2"
            if !RETRY_DELAY! GTR 60 set "RETRY_DELAY=60"
        )
    )
)

if !PULL_SUCCESS! EQU 0 (
    echo [ERROR] Failed to pull ${gameName} after 5 attempts. Skipping...
    goto :next_game_${idx}
)

REM ============================================================
REM STEP 2: Extract game files to destination
REM ============================================================
echo.
echo [STEP 2/2] Extracting files to: ${normalizedPath}\\${id}
echo.

REM Clean up any existing container with same name
docker stop ${id} >nul 2>&1
docker rm -f ${id} >nul 2>&1

set "RUN_SUCCESS=0"
for /L %%a in (1,1,3) do (
    if !RUN_SUCCESS! EQU 0 (
        echo [ATTEMPT %%a/3] Running extraction container...
        echo.

        REM Run container: mount user's folder to /output, copy game files there
        REM Using cp instead of rsync for simplicity and reliability
        docker run -v ${dockerVolume} --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "echo '=== CONTAINER STARTED ===' && echo 'Copying game files to /output/${id}...' && mkdir -p /output/${id} && cp -rv /home/* /output/${id}/ 2>&1 && echo '' && echo '=== COPY COMPLETE ===' && ls -la /output/${id}/ && echo '' && echo 'Total size:' && du -sh /output/${id}/"

        if !ERRORLEVEL! EQU 0 (
            set "RUN_SUCCESS=1"
            echo.
            echo ============================================================
            echo [SUCCESS] ${gameName} extracted successfully!
            echo [SAVED TO] ${normalizedPath}\\${id}
            echo ============================================================
        ) else (
            echo.
            echo [WARNING] Attempt %%a/3 failed with error code !ERRORLEVEL!
            docker stop ${id} >nul 2>&1
            docker rm -f ${id} >nul 2>&1
            if %%a LSS 3 (
                echo [INFO] Waiting 10 seconds before retry...
                timeout /t 10 /nobreak >nul
                call :recover_docker
            )
        )
    )
)

if !RUN_SUCCESS! EQU 0 (
    echo.
    echo [ERROR] ${gameName} extraction FAILED after 3 attempts!
    echo [ERROR] Check Docker status and try again.
)

:next_game_${idx}
if ${idx + 1} LSS ${gameCount} (
    echo.
    echo [NEXT] Moving to next game in 3 seconds...
    timeout /t 3 /nobreak >nul
)`;
            }).join('\n');

            script = `@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM Game Library Manager - Docker Runner (Batch)
REM Generated: ${new Date().toISOString()}
REM Games: ${gameCount}
REM ============================================================
REM
REM INSTRUCTIONS:
REM 1. Make sure Docker Desktop is running
REM 2. Double-click this .bat file to run
REM 3. Games will be downloaded to ${mountPath}
REM
REM Each game is fully processed (pull + extract) before moving
REM to the next one, so you can see real-time progress.
REM
REM ============================================================

echo.
echo  ====================================
echo   Game Library Manager v5.0
echo   Processing ${gameCount} game(s)
echo   Destination: ${mountPath}
echo  ====================================
echo.

REM Initial Docker health check with recovery
echo Checking Docker status...
docker info >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Docker is not responding, attempting to start/restart...
    call :recover_docker
    docker info >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [ERROR] Docker is not running! Please start Docker Desktop manually.
        pause
        exit /b 1
    )
)

echo [OK] Docker is running
echo.

REM Test network connectivity first
echo Testing network connectivity...
ping -n 1 registry-1.docker.io >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [WARNING] Cannot reach Docker Hub, resetting network...
    ipconfig /flushdns >nul 2>&1
    netsh winsock reset >nul 2>&1
    timeout /t 5 /nobreak >nul

    ping -n 1 registry-1.docker.io >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [WARNING] Still cannot reach Docker Hub, will retry during processing...
    )
)

echo.
echo ============================================================
echo Starting game processing...
echo Each game: Pull image -^> Extract files -^> Next game
echo ============================================================

${gameCommands}

echo.
echo ############################################################
echo  ALL DONE!
echo  ${gameCount} game(s) processed.
echo  Check ${mountPath} for your games.
echo ############################################################
echo.
goto :end

REM ============================================================
REM Docker Recovery Function
REM Handles Docker Desktop pipe errors and connection issues
REM ============================================================
:recover_docker
echo [RECOVERY] Attempting Docker Desktop recovery...

REM First, try to restart the Docker service
echo [RECOVERY] Restarting Docker service...
net stop com.docker.service >nul 2>&1
timeout /t 3 /nobreak >nul
net start com.docker.service >nul 2>&1
timeout /t 5 /nobreak >nul

REM Check if Docker is responding now
docker info >nul 2>&1
if !ERRORLEVEL! EQU 0 (
    echo [RECOVERY] Docker service restart successful!
    goto :eof
)

REM If service restart didn't work, try killing and restarting Docker Desktop
echo [RECOVERY] Restarting Docker Desktop application...
taskkill /f /im "Docker Desktop.exe" >nul 2>&1
taskkill /f /im "com.docker.backend.exe" >nul 2>&1
taskkill /f /im "com.docker.proxy.exe" >nul 2>&1
timeout /t 5 /nobreak >nul

REM Try to start Docker Desktop
start "" "C:\\Program Files\\Docker\\Docker\\Docker Desktop.exe" >nul 2>&1
if !ERRORLEVEL! NEQ 0 (
    start "" "%PROGRAMFILES%\\Docker\\Docker\\Docker Desktop.exe" >nul 2>&1
)

echo [RECOVERY] Waiting for Docker to initialize (up to 60 seconds)...
set "DOCKER_READY=0"
for /L %%w in (1,1,12) do (
    if !DOCKER_READY! EQU 0 (
        timeout /t 5 /nobreak >nul
        docker info >nul 2>&1
        if !ERRORLEVEL! EQU 0 (
            set "DOCKER_READY=1"
            echo [RECOVERY] Docker Desktop is ready!
        ) else (
            echo [RECOVERY] Waiting... %%w/12
        )
    )
)

if !DOCKER_READY! EQU 0 (
    echo [RECOVERY] Docker Desktop recovery may have failed, will continue trying...
)
goto :eof

:end
endlocal
pause
`;
            filename = gameCount === 1
                ? `run_${gameIds[0]}.bat`
                : `run_${gameCount}_games_${timestamp}.bat`;

        } else if (this.os === 'windows') {
            // Windows PowerShell script (.ps1) - runs natively in PowerShell
            // Build combined pull+extract commands for each game (single-phase approach)
            const gameCommands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                const isLastGame = idx === gameCount - 1;
                return `
Write-Host ""
Write-Host "############################################################" -ForegroundColor Cyan
Write-Host " GAME ${idx + 1}/${gameCount}: ${gameName}" -ForegroundColor Cyan
Write-Host "############################################################" -ForegroundColor Cyan
Write-Host "[$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Starting..."
Write-Host ""

# ============================================================
# STEP 1: Pull the Docker image
# ============================================================
Write-Host "[STEP 1/2] Pulling Docker image..." -ForegroundColor Yellow
\$pullSuccess = \$false
\$retryDelay = 5
for (\$i = 1; \$i -le 5 -and -not \$pullSuccess; \$i++) {
    docker info 2>\$null | Out-Null
    if (\$LASTEXITCODE -ne 0) {
        Write-Host "[WARNING] Docker not responding, waiting 10 seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds 10
    }

    docker pull ${dockerUser}/${repoName}:${id}
    if (\$LASTEXITCODE -eq 0) {
        \$pullSuccess = \$true
        Write-Host "[OK] Image pulled successfully!" -ForegroundColor Green
    } else {
        Write-Host "[RETRY \$i/5] Pull failed, retrying in \$retryDelay seconds..." -ForegroundColor Yellow
        Start-Sleep -Seconds \$retryDelay
        \$retryDelay = [Math]::Min(\$retryDelay * 2, 60)
    }
}

if (-not \$pullSuccess) {
    Write-Host "[ERROR] Failed to pull ${gameName} after 5 attempts. Skipping..." -ForegroundColor Red
    continue
}

# ============================================================
# STEP 2: Extract game files to destination
# ============================================================
Write-Host ""
Write-Host "[STEP 2/2] Extracting files to: ${normalizedPath}\\${id}" -ForegroundColor Yellow
Write-Host ""

# Clean up any existing container
docker stop ${id} 2>\$null | Out-Null
docker rm -f ${id} 2>\$null | Out-Null

\$runSuccess = \$false
for (\$attempt = 1; \$attempt -le 3 -and -not \$runSuccess; \$attempt++) {
    Write-Host "[ATTEMPT \$attempt/3] Running extraction container..." -ForegroundColor Gray
    Write-Host ""

    # Run container: mount user's folder to /output, copy game files there
    docker run -v ${dockerVolume} --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "echo '=== CONTAINER STARTED ===' && echo 'Copying game files to /output/${id}...' && mkdir -p /output/${id} && cp -rv /home/* /output/${id}/ 2>&1 && echo '' && echo '=== COPY COMPLETE ===' && ls -la /output/${id}/ && echo '' && echo 'Total size:' && du -sh /output/${id}/"

    if (\$LASTEXITCODE -eq 0) {
        \$runSuccess = \$true
        Write-Host ""
        Write-Host "============================================================" -ForegroundColor Green
        Write-Host "[SUCCESS] ${gameName} extracted successfully!" -ForegroundColor Green
        Write-Host "[SAVED TO] ${normalizedPath}\\${id}" -ForegroundColor Green
        Write-Host "============================================================" -ForegroundColor Green
    } else {
        Write-Host ""
        Write-Host "[WARNING] Attempt \$attempt/3 failed with exit code \$LASTEXITCODE" -ForegroundColor Yellow
        docker stop ${id} 2>\$null | Out-Null
        docker rm -f ${id} 2>\$null | Out-Null
        if (\$attempt -lt 3) {
            Write-Host "[INFO] Waiting 10 seconds before retry..." -ForegroundColor Gray
            Start-Sleep -Seconds 10
        }
    }
}

if (-not \$runSuccess) {
    Write-Host ""
    Write-Host "[ERROR] ${gameName} extraction FAILED after 3 attempts!" -ForegroundColor Red
    Write-Host "[ERROR] Check Docker status and try again." -ForegroundColor Red
}${!isLastGame ? `

Write-Host ""
Write-Host "[NEXT] Moving to next game in 3 seconds..." -ForegroundColor Gray
Start-Sleep -Seconds 3` : ''}`;
            }).join('\n');

            script = `# ============================================================
# Game Library Manager - Docker Runner (PowerShell)
# Generated: ${new Date().toISOString()}
# Games: ${gameCount}
# ============================================================
#
# INSTRUCTIONS:
# 1. Make sure Docker Desktop is running
# 2. Run: .\\${gameCount === 1 ? `run_${gameIds[0]}.ps1` : `run_${gameCount}_games.ps1`}
# 3. Games will be downloaded to ${mountPath}
#
# Each game is fully processed (pull + extract) before moving
# to the next one, so you can see real-time progress.
#
# If you get execution policy error, run:
#   Set-ExecutionPolicy -ExecutionPolicy Bypass -Scope Process
#
# ============================================================

Write-Host ""
Write-Host "  ====================================" -ForegroundColor Cyan
Write-Host "   Game Library Manager v5.0"
Write-Host "   Processing ${gameCount} game(s)"
Write-Host "   Destination: ${mountPath}"
Write-Host "  ====================================" -ForegroundColor Cyan
Write-Host ""

# Check if Docker is running
Write-Host "Checking Docker status..."
docker info 2>\$null | Out-Null
if (\$LASTEXITCODE -ne 0) {
    Write-Host "[ERROR] Docker is not running! Please start Docker Desktop and try again." -ForegroundColor Red
    Read-Host "Press Enter to exit"
    exit 1
}
Write-Host "[OK] Docker is running" -ForegroundColor Green
Write-Host ""

Write-Host "============================================================"
Write-Host "Starting game processing..."
Write-Host "Each game: Pull image -> Extract files -> Next game"
Write-Host "============================================================"

${gameCommands}

Write-Host ""
Write-Host "############################################################" -ForegroundColor Green
Write-Host " ALL DONE!"
Write-Host " ${gameCount} game(s) processed."
Write-Host " Check ${mountPath} for your games."
Write-Host "############################################################" -ForegroundColor Green
Write-Host ""

Read-Host "Press Enter to exit"
`;
            filename = gameCount === 1
                ? `run_${gameIds[0]}.ps1`
                : `run_${gameCount}_games_${timestamp}.ps1`;

        } else {
            // macOS / Linux .sh file
            // Build combined pull+extract commands for each game (single-phase approach)
            const gameCommands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                const isLastGame = idx === gameCount - 1;
                return `
echo ""
echo "############################################################"
echo " GAME $((${idx} + 1))/${gameCount}: ${gameName}"
echo "############################################################"
echo "[$(date)] Starting..."
echo ""

# ============================================================
# STEP 1: Pull the Docker image
# ============================================================
echo "[STEP 1/2] Pulling Docker image..."
PULL_SUCCESS=0
RETRY_DELAY=5
for i in 1 2 3 4 5; do
    if [ \$PULL_SUCCESS -eq 0 ]; then
        if ! docker info > /dev/null 2>&1; then
            echo "[WARNING] Docker not responding, attempting recovery..."
            recover_docker
        fi

        if docker pull ${dockerUser}/${repoName}:${id}; then
            PULL_SUCCESS=1
            echo "[OK] Image pulled successfully!"
        else
            echo "[RETRY \$i/5] Pull failed, retrying in \$RETRY_DELAY seconds..."
            sleep \$RETRY_DELAY
            RETRY_DELAY=\$((RETRY_DELAY * 2))
            if [ \$RETRY_DELAY -gt 60 ]; then
                RETRY_DELAY=60
            fi
        fi
    fi
done

if [ \$PULL_SUCCESS -eq 0 ]; then
    echo "[ERROR] Failed to pull ${gameName} after 5 attempts. Skipping..."
    ${!isLastGame ? `echo "[NEXT] Moving to next game in 3 seconds..."
    sleep 3` : ''}
    continue 2>/dev/null || true
fi

# ============================================================
# STEP 2: Extract game files to destination
# ============================================================
echo ""
echo "[STEP 2/2] Extracting files to: ${mountPath}/${id}"
echo ""

# Clean up any existing container
docker stop ${id} 2>/dev/null || true
docker rm -f ${id} 2>/dev/null || true

RUN_SUCCESS=0
for attempt in 1 2 3; do
    if [ \$RUN_SUCCESS -eq 0 ]; then
        echo "[ATTEMPT \$attempt/3] Running extraction container..."
        echo ""

        # Run container: mount user's folder to /output, copy game files there
        if docker run -v "${mountPath}:/output" --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "echo '=== CONTAINER STARTED ===' && echo 'Copying game files to /output/${id}...' && mkdir -p /output/${id} && cp -rv /home/* /output/${id}/ 2>&1 && echo '' && echo '=== COPY COMPLETE ===' && ls -la /output/${id}/ && echo '' && echo 'Total size:' && du -sh /output/${id}/"; then
            RUN_SUCCESS=1
            echo ""
            echo "============================================================"
            echo "[SUCCESS] ${gameName} extracted successfully!"
            echo "[SAVED TO] ${mountPath}/${id}"
            echo "============================================================"
        else
            echo ""
            echo "[WARNING] Attempt \$attempt/3 failed."
            docker stop ${id} 2>/dev/null || true
            docker rm -f ${id} 2>/dev/null || true
            if [ \$attempt -lt 3 ]; then
                echo "[INFO] Waiting 10 seconds before retry..."
                sleep 10
                recover_docker
            fi
        fi
    fi
done

if [ \$RUN_SUCCESS -eq 0 ]; then
    echo ""
    echo "[ERROR] ${gameName} extraction FAILED after 3 attempts!"
    echo "[ERROR] Check Docker status and try again."
fi${!isLastGame ? `

echo ""
echo "[NEXT] Moving to next game in 3 seconds..."
sleep 3` : ''}`;
            }).join('\n');

            // Determine filename early for instructions
            const scriptFilename = gameCount === 1
                ? `run_${gameIds[0]}.sh`
                : `run_${gameCount}_games.sh`;

            script = `#!/bin/bash
# ============================================================
# Game Library Manager - Docker Runner
# Generated: ${new Date().toISOString()}
# Games: ${gameCount}
# ============================================================
#
# INSTRUCTIONS:
# 1. Make sure Docker is running
# 2. Make this script executable: chmod +x ${scriptFilename}
# 3. Run: ./${scriptFilename}
#
# Each game is fully processed (pull + extract) before moving
# to the next one, so you can see real-time progress.
#
# ============================================================

# ============================================================
# Docker Recovery Function
# Handles Docker daemon issues and connection errors
# ============================================================
recover_docker() {
    echo "[RECOVERY] Attempting Docker recovery..."

    # Detect if running Docker Desktop or native Docker
    if [ -d "/Applications/Docker.app" ] || command -v "Docker" &> /dev/null; then
        # macOS Docker Desktop
        echo "[RECOVERY] Restarting Docker Desktop (macOS)..."
        osascript -e 'quit app "Docker"' 2>/dev/null || true
        sleep 3
        open -a Docker 2>/dev/null || true
        echo "[RECOVERY] Waiting for Docker to initialize..."
        for w in 1 2 3 4 5 6 7 8 9 10 11 12; do
            sleep 5
            if docker info > /dev/null 2>&1; then
                echo "[RECOVERY] Docker is ready!"
                return 0
            fi
            echo "[RECOVERY] Waiting... \$w/12"
        done
    elif command -v systemctl &> /dev/null && systemctl list-unit-files | grep -q docker; then
        # Linux with systemd
        echo "[RECOVERY] Restarting Docker service (Linux)..."
        sudo systemctl restart docker 2>/dev/null || true
        sleep 5
        if docker info > /dev/null 2>&1; then
            echo "[RECOVERY] Docker service restart successful!"
            return 0
        fi
    elif command -v service &> /dev/null; then
        # Linux with init.d
        echo "[RECOVERY] Restarting Docker service..."
        sudo service docker restart 2>/dev/null || true
        sleep 5
        if docker info > /dev/null 2>&1; then
            echo "[RECOVERY] Docker service restart successful!"
            return 0
        fi
    fi

    echo "[RECOVERY] Docker recovery attempted, continuing..."
    return 1
}

echo ""
echo " ===================================="
echo "  Game Library Manager v5.0"
echo "  Processing ${gameCount} game(s)"
echo "  Destination: ${mountPath}"
echo " ===================================="
echo ""

# Initial Docker health check with recovery
echo "Checking Docker status..."
if ! docker info > /dev/null 2>&1; then
    echo "[WARNING] Docker is not responding, attempting to start/restart..."
    recover_docker
    if ! docker info > /dev/null 2>&1; then
        echo "[ERROR] Docker is not running! Please start Docker manually."
        exit 1
    fi
fi

echo "[OK] Docker is running"
echo ""

# Test network connectivity first
echo "Testing network connectivity..."
if ! ping -c 1 registry-1.docker.io > /dev/null 2>&1; then
    echo "[WARNING] Cannot reach Docker Hub, resetting network..."

    # Flush DNS cache
    if command -v systemd-resolve &> /dev/null; then
        sudo systemd-resolve --flush-caches 2>/dev/null || true
    elif command -v resolvectl &> /dev/null; then
        sudo resolvectl flush-caches 2>/dev/null || true
    elif command -v dscacheutil &> /dev/null; then
        sudo dscacheutil -flushcache 2>/dev/null || true
        sudo killall -HUP mDNSResponder 2>/dev/null || true
    fi

    sleep 5

    if ! ping -c 1 registry-1.docker.io > /dev/null 2>&1; then
        echo "[WARNING] Still cannot reach Docker Hub, will retry during processing..."
    fi
fi

echo ""
echo "============================================================"
echo "Starting game processing..."
echo "Each game: Pull image -> Extract files -> Next game"
echo "============================================================"

${gameCommands}

echo ""
echo "############################################################"
echo " ALL DONE!"
echo " ${gameCount} game(s) processed."
echo " Check ${mountPath} for your games."
echo "############################################################"
echo ""
`;
            filename = gameCount === 1
                ? `run_${gameIds[0]}.sh`
                : `run_${gameCount}_games_${timestamp}.sh`;
        }

        // Download the file
        const blob = new Blob([script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        const runHint = this.os === 'windows'
            ? `Run with: .\\${filename}`
            : `Run with: ./${filename}`;
        this.showToast(`Downloaded: ${filename} - ${runHint}`, 'success');
    }

    downloadKillScript(format = 'ps1') {
        let script, filename;

        if (this.os === 'windows' && format === 'bat') {
            script = `@echo off
REM Kill all Docker containers (Batch)
echo Stopping and removing all Docker containers...
for /f "tokens=*" %%i in ('docker ps -aq') do docker rm -f %%i 2>nul
echo Done!
pause
`;
            filename = 'kill_all_containers.bat';
        } else if (this.os === 'windows') {
            script = `# Kill all Docker containers (PowerShell)
Write-Host "Stopping and removing all Docker containers..." -ForegroundColor Yellow
docker rm -f $(docker ps -aq) 2>\$null
Write-Host "Done!" -ForegroundColor Green
Read-Host "Press Enter to exit"
`;
            filename = 'kill_all_containers.ps1';
        } else {
            script = `#!/bin/bash
# Kill all Docker containers
echo "Stopping and removing all Docker containers..."
docker rm -f $(docker ps -aq) 2>/dev/null
echo "Done!"
`;
            filename = 'kill_all_containers.sh';
        }

        const blob = new Blob([script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`Downloaded: ${filename}`, 'success');
    }

    toggleRunFormatMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('runFormatMenu');
        const btn = document.getElementById('runFormatBtn');
        const rect = btn.getBoundingClientRect();

        // Close other menus
        document.getElementById('killFormatMenu').style.display = 'none';

        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    toggleKillFormatMenu(e) {
        e.stopPropagation();
        const menu = document.getElementById('killFormatMenu');
        const btn = document.getElementById('killFormatBtn');
        const rect = btn.getBoundingClientRect();

        // Close other menus
        document.getElementById('runFormatMenu').style.display = 'none';

        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    toggleMoveToMenu(e) {
        e.stopPropagation();
        
        // CRITICAL: Only admins can access Move To functionality
        if (!this.isAdmin) {
            this.showToast('Admin access required to move games', 'error');
            return;
        }
        
        const menu = document.getElementById('moveToMenu');
        const btn = document.getElementById('moveToBtn');
        const rect = btn.getBoundingClientRect();

        // Populate the menu with tabs
        menu.innerHTML = this.tabs.map(tab => `
            <button class="move-to-option" data-tab="${tab.id}">
                ${tab.name} (${this.getTabCount(tab.id)})
            </button>
        `).join('');

        // Add click handlers
        menu.querySelectorAll('.move-to-option').forEach(option => {
            option.addEventListener('click', (e) => {
                const tabId = e.target.dataset.tab;
                this.moveSelectedGamesToTab(tabId);
                menu.style.display = 'none';
            });
        });

        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.left = `${rect.left}px`;
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    moveSelectedGamesToTab(tabId) {
        // CRITICAL: Only admins can move games between categories
        if (!this.isAdmin) {
            this.showToast('Admin access required to move games', 'error');
            return;
        }

        if (this.selectedGames.size === 0) {
            this.showToast('No games selected', 'error');
            return;
        }

        const tab = this.tabs.find(t => t.id === tabId);
        const tabName = tab ? tab.name : tabId;
        let movedCount = 0;

        // Update each selected game's category
        this.selectedGames.forEach(gameId => {
            const game = this.games.find(g => g.id === gameId);
            if (game && game.category !== tabId) {
                game.category = tabId;
                movedCount++;
            }
        });

        if (movedCount > 0) {
            // Save changes to localStorage for persistence
            this.saveGameChanges();

            // Refresh UI
            this.renderTabs();
            this.filterAndRender();

            this.showToast(`Moved ${movedCount} game(s) to "${tabName}"`, 'success');
        } else {
            this.showToast('Games are already in this category', 'info');
        }

        // Optionally clear selection after move
        this.deselectAll();
    }

    saveGameChanges() {
        // Save modified games to localStorage for immediate UI update
        localStorage.setItem('gameLibraryGames', JSON.stringify(this.games));
        
        // If admin, also save to server to affect all users
        if (this.isAdmin) {
            this.saveAdminConfigToServer();
        }
    }

    loadSavedGameChanges() {
        // Load any saved game modifications from localStorage
        const savedGames = localStorage.getItem('gameLibraryGames');
        if (savedGames) {
            try {
                const savedGameData = JSON.parse(savedGames);
                // Merge saved changes with loaded games (preserve saved categories)
                savedGameData.forEach(savedGame => {
                    const game = this.games.find(g => g.id === savedGame.id);
                    if (game) {
                        game.category = savedGame.category;
                    }
                });
            } catch (e) {
                console.error('Failed to load saved game changes:', e);
            }
        }
    }

    copyScript() {
        if (!this.currentGame) return;
        const cmd = this.getDockerCommand(this.currentGame.id);
        navigator.clipboard.writeText(cmd).then(() => {
            this.showToast('Docker command copied! Paste in your terminal.', 'success');
        });
    }

    toggleSortMenu(e) {
        const menu = document.getElementById('sortMenu');
        const btn = document.getElementById('sortBtn');
        const rect = btn.getBoundingClientRect();

        menu.style.top = `${rect.bottom + 5}px`;
        menu.style.right = `${window.innerWidth - rect.right}px`;
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }

    handleSort(sortBy, order) {
        this.sortBy = sortBy;
        this.sortOrder = order;

        document.querySelectorAll('.sort-option').forEach(btn => {
            btn.classList.toggle('active',
                btn.dataset.sort === sortBy && btn.dataset.order === order);
        });

        const indicators = {
            'name-asc': '↓ Name',
            'name-desc': '↑ Name',
            'time-asc': '↓ Time',
            'time-desc': '↑ Time',
            'category-asc': '↓ Cat',
            'size-asc': '↓ Size',
            'size-desc': '↑ Size',
            'date-desc': '↓ Date',  // Newest-Oldest (descending = highest date first)
            'date-asc': '↑ Date'    // Oldest-Newest (ascending = lowest date first)
        };
        document.getElementById('sortIndicator').textContent = indicators[`${sortBy}-${order}`] || '↓ Name';

        document.getElementById('sortMenu').style.display = 'none';
        this.filterAndRender();
    }

    toggleTheme() {
        const currentTheme = document.body.dataset.theme || 'dark';
        const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
        document.body.dataset.theme = newTheme;
        document.getElementById('themeBtn').textContent = newTheme === 'dark' ? '🌙' : '☀️';
        this.settings.theme = newTheme;
        this.saveSettings();
    }

    openSettings() {
        document.getElementById('gridSize').value = this.settings.gridSize;
        document.getElementById('showTimes').checked = this.settings.showTimes;
        document.getElementById('showCategories').checked = this.settings.showCategories;
        document.getElementById('dockerUsername').value = this.settings.dockerUsername;
        document.getElementById('repoName').value = this.settings.repoName;
        document.getElementById('mountPath').value = this.settings.mountPath;
        document.getElementById('settingsModal').classList.add('active');
    }

    loadSettings() {
        const defaults = {
            theme: 'dark',
            gridSize: 'medium',
            showTimes: true,
            showCategories: true,
            dockerUsername: 'michadockermisha',
            repoName: 'backup',
            mountPath: 'F:/Games'
        };

        try {
            const saved = localStorage.getItem('gameLibrarySettings');
            const settings = saved ? { ...defaults, ...JSON.parse(saved) } : defaults;

            // Sync global mount path input
            setTimeout(() => {
                const globalPath = document.getElementById('globalMountPath');
                if (globalPath) {
                    globalPath.value = settings.mountPath;
                }
            }, 100);

            return settings;
        } catch {
            return defaults;
        }
    }

    saveSettings() {
        localStorage.setItem('gameLibrarySettings', JSON.stringify(this.settings));
    }

    loadInstalledGames() {
        try {
            const saved = localStorage.getItem('installedGames');
            if (saved) {
                this.installedGames = new Set(JSON.parse(saved));
            }
        } catch {
            this.installedGames = new Set();
        }
    }

    saveInstalledGames() {
        localStorage.setItem('installedGames', JSON.stringify([...this.installedGames]));
    }

    // Admin authentication using SHA-256 hash comparison
    async attemptAdminLogin(password) {
        // Hash the input password and compare to stored hash
        // This prevents plaintext password exposure in source code
        const inputHash = await this.hashPassword(password);

        if (inputHash === this.adminHash) {
            this.isAdmin = true;
            document.body.classList.add('is-admin');
            document.getElementById('adminLoginBox').style.display = 'none';
            document.getElementById('adminLoggedBox').style.display = 'flex';
            
            // Show admin-only features
            const moveToContainer = document.querySelector('.move-to-container');
            if (moveToContainer) {
                moveToContainer.style.display = 'block';
            }
            
            this.loadHiddenTabs();
            this.renderTabs();
            this.filterAndRender(); // Re-render to show admin features
            this.updateSelectedCount(); // Update UI to show admin features
            this.showToast('👑 Admin access granted!', 'success');
        } else {
            this.showToast('❌ Invalid password', 'error');
        }
    }

    // SHA-256 hash function using Web Crypto API
    async hashPassword(password) {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    adminLogout() {
        this.isAdmin = false;
        document.body.classList.remove('is-admin');
        document.getElementById('adminLoginBox').style.display = 'flex';
        document.getElementById('adminLoggedBox').style.display = 'none';
        
        // Hide admin-only features
        const moveToContainer = document.querySelector('.move-to-container');
        if (moveToContainer) {
            moveToContainer.style.display = 'none';
        }
        
        this.renderTabs();
        this.filterAndRender();
        this.updateSelectedCount(); // Update UI to hide admin features
        this.showToast('Logged out', 'info');
    }

    // Ensures non-admin state on page load - CRITICAL for security
    ensureNonAdminState() {
        this.isAdmin = false;
        document.body.classList.remove('is-admin');
        const loginBox = document.getElementById('adminLoginBox');
        const loggedBox = document.getElementById('adminLoggedBox');
        if (loginBox) loginBox.style.display = 'flex';
        if (loggedBox) loggedBox.style.display = 'none';
        
        // CRITICAL: Hide all admin-only features on page load
        const moveToContainer = document.querySelector('.move-to-container');
        if (moveToContainer) {
            moveToContainer.style.display = 'none';
        }
    }

    // Load admin configuration from server - affects ALL users immediately
    async loadAdminConfigFromServer() {
        try {
            const response = await fetch('/api/admin-config', {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json'
                }
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.config) {
                    // Apply server admin rules to ALL users
                    this.hiddenTabs = new Set(data.config.hiddenTabs || []);
                    
                    // Apply game category overrides from admin
                    if (data.config.gameCategories) {
                        Object.entries(data.config.gameCategories).forEach(([gameId, category]) => {
                            const game = this.games.find(g => g.id === gameId);
                            if (game) {
                                game.category = category;
                            }
                        });
                    }
                    
                    console.log('📡 Loaded admin config from server:', data.config);
                }
            }
        } catch (error) {
            console.error('Failed to load admin config from server:', error);
            // Fallback to localStorage for offline mode
            this.loadHiddenTabs();
        }
    }

    // Save admin configuration to server - immediately affects ALL users
    async saveAdminConfigToServer() {
        if (!this.isAdmin) {
            console.error('Only admins can save configuration');
            return;
        }

        try {
            // Collect all game category changes
            const gameCategories = {};
            this.games.forEach(game => {
                if (game.category) {
                    gameCategories[game.id] = game.category;
                }
            });

            const response = await fetch('/api/admin-config', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Admin-Token': 'glm-admin-2024' // In production, use secure token from login
                },
                body: JSON.stringify({
                    hiddenTabs: [...this.hiddenTabs],
                    gameCategories: gameCategories
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                console.log('✅ Admin config saved to server:', data);
                this.showToast('🌐 Changes saved to server - affecting all users!', 'success');
            } else {
                throw new Error('Failed to save to server');
            }
        } catch (error) {
            console.error('Failed to save admin config to server:', error);
            this.showToast('❌ Failed to save to server', 'error');
        }
    }

    // Legacy localStorage methods (kept for fallback)
    loadHiddenTabs() {
        try {
            const saved = localStorage.getItem('hiddenTabs');
            if (saved) {
                this.hiddenTabs = new Set(JSON.parse(saved));
            }
        } catch {
            this.hiddenTabs = new Set();
        }
    }

    saveHiddenTabs() {
        // Save to localStorage for immediate UI update
        localStorage.setItem('hiddenTabs', JSON.stringify([...this.hiddenTabs]));
        // Then save to server to affect all users
        this.saveAdminConfigToServer();
    }

    toggleTabVisibility(tabId) {
        if (!this.isAdmin) return;

        if (this.hiddenTabs.has(tabId)) {
            this.hiddenTabs.delete(tabId);
            this.showToast(`Tab "${tabId}" is now visible to all`, 'info');
        } else {
            this.hiddenTabs.add(tabId);
            this.showToast(`Tab "${tabId}" is now hidden from non-admins`, 'warning');
        }
        this.saveHiddenTabs(); // This now saves to server and affects ALL users
        this.renderTabs();
    }

    toggleInstalled(gameId) {
        if (this.installedGames.has(gameId)) {
            this.installedGames.delete(gameId);
            this.showToast(`${gameId} marked as not installed`, 'info');
        } else {
            this.installedGames.add(gameId);
            this.showToast(`${gameId} marked as installed`, 'success');
        }
        this.saveInstalledGames();
        this.filterAndRender();
    }

    toggleInstalledFilter() {
        this.showInstalledOnly = !this.showInstalledOnly;
        const btn = document.getElementById('showInstalledBtn');
        if (this.showInstalledOnly) {
            btn.textContent = '📋 Show All';
            btn.classList.add('active');
            this.showToast(`Showing ${this.installedGames.size} installed games`, 'info');
        } else {
            btn.textContent = '✅ Show Installed';
            btn.classList.remove('active');
            this.showToast('Showing all games', 'info');
        }
        this.filterAndRender();
    }

    applySettings() {
        document.body.dataset.theme = this.settings.theme;
        document.body.dataset.grid = this.settings.gridSize;
        document.getElementById('themeBtn').textContent = this.settings.theme === 'dark' ? '🌙' : '☀️';
    }

    exportData() {
        const data = {
            settings: this.settings,
            selectedGames: [...this.selectedGames],
            exportDate: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `game-library-settings-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Settings exported!', 'success');
    }

    importData() {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = '.json';
        input.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;

            const reader = new FileReader();
            reader.onload = (e) => {
                try {
                    const data = JSON.parse(e.target.result);
                    if (data.settings) {
                        this.settings = { ...this.settings, ...data.settings };
                        this.saveSettings();
                        this.applySettings();
                    }
                    if (data.selectedGames) {
                        this.selectedGames = new Set(data.selectedGames);
                        this.updateSelectedCount();
                    }
                    this.filterAndRender();
                    this.showToast('Settings imported!', 'success');
                } catch {
                    this.showToast('Invalid file format', 'error');
                }
            };
            reader.readAsText(file);
        };
        input.click();
    }

    showLoading(show) {
        document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
        document.getElementById('gamesGrid').style.display = show ? 'none' : 'grid';
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;

        const icons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        toast.innerHTML = `
            <span>${icons[type] || icons.info}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        // Auto-dismiss with smooth exit animation
        setTimeout(() => {
            toast.style.animation = 'toastSlideIn 0.3s ease reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // ============================================
    // SCROLL EFFECTS
    // ============================================
    setupScrollEffects() {
        const header = document.querySelector('.header');
        const scrollTopBtn = document.getElementById('scrollTopBtn');
        const content = document.querySelector('.content');

        let ticking = false;

        const handleScroll = () => {
            if (!ticking) {
                window.requestAnimationFrame(() => {
                    const scrollY = window.scrollY;

                    // Header shadow on scroll
                    if (scrollY > 10) {
                        header.classList.add('scrolled');
                    } else {
                        header.classList.remove('scrolled');
                    }

                    // Scroll to top button visibility
                    if (scrollY > 300) {
                        scrollTopBtn.classList.add('visible');
                    } else {
                        scrollTopBtn.classList.remove('visible');
                    }

                    ticking = false;
                });
                ticking = true;
            }
        };

        window.addEventListener('scroll', handleScroll, { passive: true });

        // Scroll to top click handler
        scrollTopBtn.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    // ============================================
    // MOBILE SIDEBAR
    // ============================================
    setupMobileSidebar() {
        const sidebar = document.querySelector('.sidebar');
        const sidebarToggle = document.getElementById('sidebarToggle');
        const sidebarOverlay = document.getElementById('sidebarOverlay');

        const openSidebar = () => {
            sidebar.classList.add('open');
            sidebarOverlay.classList.add('active');
            sidebarToggle.innerHTML = '✕';
            document.body.style.overflow = 'hidden';
        };

        const closeSidebar = () => {
            sidebar.classList.remove('open');
            sidebarOverlay.classList.remove('active');
            sidebarToggle.innerHTML = '☰';
            document.body.style.overflow = '';
        };

        sidebarToggle.addEventListener('click', () => {
            if (sidebar.classList.contains('open')) {
                closeSidebar();
            } else {
                openSidebar();
            }
        });

        sidebarOverlay.addEventListener('click', closeSidebar);

        // Close sidebar when a tab is clicked (mobile)
        document.getElementById('tabsContainer').addEventListener('click', (e) => {
            if (e.target.closest('.tab-btn') && window.innerWidth <= 1024) {
                closeSidebar();
            }
        });

        // Close sidebar on window resize if becoming desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 1024 && sidebar.classList.contains('open')) {
                closeSidebar();
            }
        });
    }

    // ============================================
    // KEYBOARD HINTS
    // ============================================
    setupKeyboardHints() {
        const keyboardHints = document.getElementById('keyboardHints');
        let hideTimeout;

        // Show hints briefly on page load
        setTimeout(() => {
            keyboardHints.classList.add('visible');
            hideTimeout = setTimeout(() => {
                keyboardHints.classList.remove('visible');
            }, 5000);
        }, 2000);

        // Show hints when user starts typing
        document.addEventListener('keydown', (e) => {
            // Don't show if already in an input
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
                return;
            }

            clearTimeout(hideTimeout);
            keyboardHints.classList.add('visible');

            hideTimeout = setTimeout(() => {
                keyboardHints.classList.remove('visible');
            }, 3000);
        });
    }

    // ============================================
    // ENHANCED IMAGE LOADING
    // ============================================
    lazyLoadImages() {
        const images = document.querySelectorAll('img[data-src]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;

                    // Create a new image to preload
                    const tempImg = new Image();
                    tempImg.onload = () => {
                        img.src = img.dataset.src;
                        img.classList.add('loaded');

                        // Remove shimmer effect from parent
                        const container = img.closest('.image-container');
                        if (container) {
                            container.style.setProperty('--shimmer-display', 'none');
                        }
                    };
                    tempImg.onerror = () => {
                        // Keep placeholder on error
                        img.classList.add('loaded');
                    };
                    tempImg.src = img.dataset.src;

                    observer.unobserve(img);
                }
            });
        }, {
            rootMargin: '100px',
            threshold: 0.1
        });

        images.forEach(img => observer.observe(img));
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.gameLibrary = new GameLibrary();
});
