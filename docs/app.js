/**
 * Game Library Manager v3.6 - Web Application
 * A full-featured Docker game library manager
 *
 * Features:
 * - Bulk selection and run multiple games
 * - .bat file download for Windows (double-click to run)
 * - Full Docker paths for michadockermisha/backup repo
 * - Custom mount path selection
 * - GitHub repo link
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
        this.adminHash = 'fba92b2c989a5072544ca49d7f75db2005e6479bf286a38902de90e487230762';
        this.settings = this.loadSettings();
        this.focusedCardIndex = -1; // Track currently focused card for keyboard navigation

        // Infinite scroll / pagination properties
        this.visibleGamesCount = 0; // How many games currently rendered
        this.gamesPerPage = 50; // Initial batch size
        this.gamesLoadIncrement = 30; // How many to load on scroll
        this.isLoadingMore = false; // Prevent multiple simultaneous loads
        this.allGamesLoaded = false; // Track if all games are rendered

        // Search suggestions properties
        this.recentSearches = this.loadRecentSearches();
        this.maxRecentSearches = 5;
        this.suggestionsHighlightIndex = -1;
        this.suggestionsVisible = false;

        this.init();
    }

    async init() {
        this.showLoading(true);
        this.detectOS();
        this.bindEvents();
        this.applySettings();
        
        // CRITICAL: Ensure non-admin state on page load - users must login to get admin access
        this.ensureNonAdminState();
        
        // Load hidden tabs configuration BEFORE rendering (needed even for non-admins to filter correctly)
        this.loadHiddenTabs();

        try {
            await this.loadData();
            this.renderTabs();
            this.filterAndRender();
            this.showLoading(false);
            this.updateSelectedCount();

            // Start automatic Docker Hub sync (every 30 seconds)
            this.startAutoSync();
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showToast('Failed to load game data', 'error');
            this.showLoading(false);
        }
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

    // Progress bar control methods
    showSyncProgress(show = true) {
        const container = document.getElementById('syncProgressContainer');
        if (container) {
            if (show) {
                container.classList.remove('fade-out', 'success', 'error');
                container.classList.add('active');
            } else {
                container.classList.add('fade-out');
                setTimeout(() => {
                    container.classList.remove('active', 'fade-out');
                }, 400);
            }
        }
    }

    updateSyncProgress(percent, message, stats = '', state = 'progress') {
        const fill = document.getElementById('syncProgressFill');
        const percentEl = document.getElementById('syncProgressPercentage');
        const messageEl = document.getElementById('syncProgressMessage');
        const statsEl = document.getElementById('syncProgressStats');
        const titleEl = document.getElementById('syncProgressTitle');
        const container = document.getElementById('syncProgressContainer');

        if (fill) {
            fill.classList.remove('indeterminate');
            fill.style.width = `${Math.min(100, Math.max(0, percent))}%`;
        }
        if (percentEl) percentEl.textContent = `${Math.round(percent)}%`;
        if (messageEl) messageEl.textContent = message;
        if (statsEl) statsEl.textContent = stats;

        if (container) {
            container.classList.remove('success', 'error');
            if (state === 'success') {
                container.classList.add('success');
                if (titleEl) titleEl.textContent = 'Sync Complete';
            } else if (state === 'error') {
                container.classList.add('error');
                if (titleEl) titleEl.textContent = 'Sync Failed';
            } else {
                if (titleEl) titleEl.textContent = 'Syncing with Docker Hub';
            }
        }
    }

    setSyncProgressIndeterminate(message) {
        const fill = document.getElementById('syncProgressFill');
        const messageEl = document.getElementById('syncProgressMessage');
        const percentEl = document.getElementById('syncProgressPercentage');

        if (fill) {
            fill.classList.add('indeterminate');
            fill.style.width = '100%';
        }
        if (messageEl) messageEl.textContent = message;
        if (percentEl) percentEl.textContent = '...';
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

        // Show sync progress bar
        this.showSyncProgress(true);
        this.setSyncProgressIndeterminate('Connecting to Docker Hub...');

        // Show sync status on button
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
            this.updateSyncProgress(5, 'Establishing connection...', 'Initializing');
            let firstPage = null;
            for (let attempt = 0; attempt < 10; attempt++) {
                this.updateSyncProgress(5 + attempt * 2, `Connection attempt ${attempt + 1}/10...`, 'Connecting');
                firstPage = await fetchPageWithRetry(1, 3);
                if (firstPage && firstPage.results) break;
                console.log(`First page attempt ${attempt + 1} failed, retrying...`);
                await new Promise(r => setTimeout(r, 2000));
            }

            if (!firstPage || !firstPage.results) {
                console.error('❌ Failed to fetch first page from Docker Hub after all retries');
                this.updateSyncProgress(100, 'Failed to connect to Docker Hub', '', 'error');
                this.showToast('Failed to connect to Docker Hub. Try again later.', 'error');
                setTimeout(() => this.showSyncProgress(false), 3000);
                return [];
            }

            const totalCount = firstPage.count || 0;
            const totalPages = Math.ceil(totalCount / pageSize);
            console.log(`📦 Docker Hub: ${totalCount} total tags across ${totalPages} pages`);
            updateSyncStatus(`🔄 0/${totalPages}`);
            this.updateSyncProgress(25, `Found ${totalCount} tags across ${totalPages} pages`, `0/${totalPages} pages`);

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

                    // Calculate progress (25% for connect, 60% for fetching pages, 15% for finalization)
                    const fetchProgress = 25 + ((tagsByPage.size / totalPages) * 60);
                    this.updateSyncProgress(
                        fetchProgress,
                        `Fetching page ${tagsByPage.size + 1} of ${totalPages}...`,
                        `${tagsByPage.size}/${totalPages} pages`
                    );

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
                this.updateSyncProgress(85, `Recovering ${missingPages.length} missing pages...`, `${missingPages.length} to retry`);

                for (let idx = 0; idx < missingPages.length; idx++) {
                    const page = missingPages[idx];
                    this.updateSyncProgress(
                        85 + ((idx / missingPages.length) * 10),
                        `Retrying page ${page}...`,
                        `${idx + 1}/${missingPages.length} retries`
                    );

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
            this.updateSyncProgress(95, 'Processing fetched data...', 'Finalizing');
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
                this.updateSyncProgress(100, `Fetched ${actualCount}/${expectedCount} tags`, `${missingCount} missing`, 'success');
            } else {
                console.log(`✅ Successfully fetched ALL ${actualCount} tags from Docker Hub!`);
                this.updateSyncProgress(100, `Successfully fetched all ${actualCount} tags!`, 'Complete', 'success');
            }

            // Auto-hide progress bar after 2 seconds
            setTimeout(() => this.showSyncProgress(false), 2000);

            return allTags;
        } catch (error) {
            console.error('Error fetching Docker tags:', error);
            this.updateSyncProgress(100, 'Error fetching tags', error.message, 'error');
            setTimeout(() => this.showSyncProgress(false), 3000);
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

        // Show progress indicator for manual sync
        this.showSyncProgress(true);
        this.setSyncProgressIndeterminate('Starting manual sync...');

        try {
            await this.syncDockerHubTags();
            document.getElementById('gameCount').textContent = this.games.length;
            this.renderTabs();
            this.filterAndRender();
        } catch (error) {
            this.showToast('Sync failed: ' + error.message, 'error');
            this.updateSyncProgress(100, 'Sync failed: ' + error.message, '', 'error');
            setTimeout(() => this.showSyncProgress(false), 3000);
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

        // Search with suggestions
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.updateSearchSuggestions(e.target.value);
            this.filterAndRender();
        });

        // Show suggestions on focus
        searchInput.addEventListener('focus', () => {
            this.updateSearchSuggestions(searchInput.value);
        });

        // Handle blur - delay to allow click on suggestions
        searchInput.addEventListener('blur', () => {
            setTimeout(() => this.hideSearchSuggestions(), 150);
        });

        // Search suggestions keyboard navigation
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' && this.suggestionsVisible) {
                e.preventDefault();
                this.navigateSuggestions(1);
            } else if (e.key === 'ArrowUp' && this.suggestionsVisible) {
                e.preventDefault();
                this.navigateSuggestions(-1);
            } else if (e.key === 'Enter') {
                if (this.suggestionsVisible && this.suggestionsHighlightIndex >= 0) {
                    e.preventDefault();
                    this.selectHighlightedSuggestion();
                } else if (searchInput.value.trim()) {
                    // Save search to recent when pressing Enter without highlighted suggestion
                    this.addRecentSearch(searchInput.value);
                    this.hideSearchSuggestions();
                }
            } else if (e.key === 'Escape' && this.suggestionsVisible) {
                this.hideSearchSuggestions();
            }
        });

        // Clear recent searches button
        document.getElementById('clearRecentSearches').addEventListener('click', (e) => {
            e.stopPropagation();
            this.clearRecentSearches();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
            if (e.key === 'Escape') {
                this.closeAllModals();
                this.clearCardFocus();
            }
            // Game card keyboard navigation
            this.handleKeyboardNavigation(e);
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
        });

        // Modal backdrop click
        document.querySelectorAll('.modal').forEach(modal => {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) {
                    modal.classList.remove('active');
                }
            });
        });

        // Mobile hamburger menu toggle
        this.initMobileMenu();

        // Scroll-to-top button
        const scrollToTopBtn = document.getElementById('scrollToTopBtn');
        if (scrollToTopBtn) {
            scrollToTopBtn.addEventListener('click', () => {
                this.scrollToTop();
            });
        }

        // Scroll event for scroll-to-top button and infinite scroll
        let scrollTimeout;
        window.addEventListener('scroll', () => {
            // Scroll-to-top button visibility
            if (scrollToTopBtn) {
                if (window.scrollY > 400) {
                    scrollToTopBtn.classList.add('visible');
                } else {
                    scrollToTopBtn.classList.remove('visible');
                }
            }

            // Infinite scroll - load more games when near bottom
            clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(() => {
                this.checkInfiniteScroll();
            }, 100);

            // Update pagination info visibility
            this.updatePaginationInfo();
        });
    }

    // Smooth scroll to top
    scrollToTop() {
        window.scrollTo({
            top: 0,
            behavior: 'smooth'
        });
    }

    // Initialize mobile hamburger menu and touch interactions
    initMobileMenu() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        if (!hamburgerBtn || !sidebar || !overlay) return;

        // Toggle sidebar on hamburger click
        hamburgerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.toggleMobileSidebar();
        });

        // Close sidebar when clicking overlay
        overlay.addEventListener('click', () => {
            this.closeMobileSidebar();
        });

        // Close sidebar when selecting a tab on mobile
        sidebar.addEventListener('click', (e) => {
            if (e.target.closest('.tab-btn')) {
                // Small delay to allow tab selection to process
                setTimeout(() => {
                    this.closeMobileSidebar();
                }, 150);
            }
        });

        // Swipe to close sidebar (touch gesture support)
        this.initSwipeGestures(sidebar, overlay);

        // Close sidebar on window resize to desktop
        window.addEventListener('resize', () => {
            if (window.innerWidth > 768) {
                this.closeMobileSidebar();
            }
        });

        // Close sidebar when pressing Escape
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('open')) {
                this.closeMobileSidebar();
            }
        });
    }

    // Toggle mobile sidebar open/closed
    toggleMobileSidebar() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        const isOpen = sidebar.classList.contains('open');

        if (isOpen) {
            this.closeMobileSidebar();
        } else {
            sidebar.classList.add('open');
            overlay.classList.add('visible');
            hamburgerBtn.classList.add('active');
            hamburgerBtn.setAttribute('aria-expanded', 'true');
            document.body.style.overflow = 'hidden'; // Prevent background scroll
        }
    }

    // Close mobile sidebar
    closeMobileSidebar() {
        const hamburgerBtn = document.getElementById('hamburgerBtn');
        const sidebar = document.getElementById('sidebar');
        const overlay = document.getElementById('sidebarOverlay');

        sidebar.classList.remove('open');
        overlay.classList.remove('visible');
        hamburgerBtn.classList.remove('active');
        hamburgerBtn.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = ''; // Restore scroll
    }

    // Initialize swipe gestures for mobile sidebar
    initSwipeGestures(sidebar, overlay) {
        let touchStartX = 0;
        let touchStartY = 0;
        let touchEndX = 0;
        let isSwiping = false;
        const swipeThreshold = 80; // Minimum distance for swipe

        // Track touch start on sidebar
        sidebar.addEventListener('touchstart', (e) => {
            touchStartX = e.changedTouches[0].screenX;
            touchStartY = e.changedTouches[0].screenY;
            isSwiping = true;
        }, { passive: true });

        // Track touch move
        sidebar.addEventListener('touchmove', (e) => {
            if (!isSwiping) return;
            touchEndX = e.changedTouches[0].screenX;
        }, { passive: true });

        // Detect swipe end
        sidebar.addEventListener('touchend', (e) => {
            if (!isSwiping) return;
            isSwiping = false;

            const deltaX = touchEndX - touchStartX;
            const deltaY = Math.abs(e.changedTouches[0].screenY - touchStartY);

            // Only trigger swipe if horizontal movement is dominant
            if (deltaX < -swipeThreshold && deltaY < 100) {
                // Swipe left - close sidebar
                this.closeMobileSidebar();
            }

            // Reset
            touchStartX = 0;
            touchEndX = 0;
        }, { passive: true });

        // Also allow swipe from left edge to open sidebar
        let edgeSwipeStartX = 0;
        let edgeSwipeActive = false;

        document.addEventListener('touchstart', (e) => {
            // Only detect swipe from left 30px edge
            if (e.changedTouches[0].screenX < 30 && !sidebar.classList.contains('open')) {
                edgeSwipeStartX = e.changedTouches[0].screenX;
                edgeSwipeActive = true;
            }
        }, { passive: true });

        document.addEventListener('touchend', (e) => {
            if (!edgeSwipeActive) return;
            edgeSwipeActive = false;

            const deltaX = e.changedTouches[0].screenX - edgeSwipeStartX;

            // Swipe right from edge - open sidebar
            if (deltaX > swipeThreshold) {
                this.toggleMobileSidebar();
            }

            edgeSwipeStartX = 0;
        }, { passive: true });
    }

    // Check if we should load more games (infinite scroll)
    checkInfiniteScroll() {
        if (this.isLoadingMore || this.allGamesLoaded) return;

        const scrollPosition = window.innerHeight + window.scrollY;
        const documentHeight = document.documentElement.scrollHeight;
        const threshold = 500; // Load more when 500px from bottom

        if (scrollPosition >= documentHeight - threshold) {
            this.loadMoreGames();
        }
    }

    // Load more games for infinite scroll
    loadMoreGames() {
        if (this.isLoadingMore || this.allGamesLoaded) return;

        const remainingGames = this.filteredGames.length - this.visibleGamesCount;
        if (remainingGames <= 0) {
            this.allGamesLoaded = true;
            this.showEndOfList();
            return;
        }

        this.isLoadingMore = true;
        this.showInfiniteScrollLoader(true);

        // Small delay for smooth UX
        setTimeout(() => {
            const gamesToLoad = Math.min(this.gamesLoadIncrement, remainingGames);
            const startIndex = this.visibleGamesCount;
            const endIndex = startIndex + gamesToLoad;

            // Render the next batch of games
            this.appendGames(this.filteredGames.slice(startIndex, endIndex));
            this.visibleGamesCount = endIndex;

            this.isLoadingMore = false;
            this.showInfiniteScrollLoader(false);
            this.updatePaginationInfo();

            // Check if we've loaded all games
            if (this.visibleGamesCount >= this.filteredGames.length) {
                this.allGamesLoaded = true;
                this.showEndOfList();
            }
        }, 150);
    }

    // Append games to the grid without re-rendering everything
    appendGames(games) {
        const grid = document.getElementById('gamesGrid');

        games.forEach(game => {
            const cardHtml = this.createGameCard(game);
            const tempDiv = document.createElement('div');
            tempDiv.innerHTML = cardHtml;
            const card = tempDiv.firstElementChild;

            // Add event handlers
            const infoBtn = card.querySelector('.info-btn');
            const installBtn = card.querySelector('.install-btn');
            const checkbox = card.querySelector('.select-checkbox');

            infoBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openGameModal(game);
            });

            installBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleInstalled(game.id);
            });

            checkbox.addEventListener('change', (e) => {
                e.stopPropagation();
                this.toggleGameSelection(game.id, e.target.checked);
            });

            card.addEventListener('click', (e) => {
                if (e.target !== checkbox && !e.target.closest('.info-btn') && !e.target.closest('.install-btn')) {
                    checkbox.checked = !checkbox.checked;
                    this.toggleGameSelection(game.id, checkbox.checked);
                }
            });

            grid.appendChild(card);
        });

        // Lazy load images for new cards
        this.lazyLoadImages();
    }

    // Show/hide infinite scroll loader
    showInfiniteScrollLoader(show) {
        let loader = document.getElementById('infiniteScrollLoader');
        if (!loader && show) {
            loader = document.createElement('div');
            loader.id = 'infiniteScrollLoader';
            loader.className = 'infinite-scroll-loader';
            loader.innerHTML = `
                <div class="loader-dots">
                    <span></span><span></span><span></span>
                </div>
                <span class="loader-text">Loading more games...</span>
            `;
            const content = document.querySelector('.content');
            if (content) {
                content.appendChild(loader);
            }
        }
        if (loader) {
            if (show) {
                loader.classList.add('visible');
            } else {
                loader.classList.remove('visible');
            }
        }
    }

    // Show end of list indicator
    showEndOfList() {
        let endIndicator = document.getElementById('infiniteScrollEnd');
        if (!endIndicator) {
            endIndicator = document.createElement('div');
            endIndicator.id = 'infiniteScrollEnd';
            endIndicator.className = 'infinite-scroll-end';
            endIndicator.textContent = 'All games loaded';
            const content = document.querySelector('.content');
            if (content) {
                content.appendChild(endIndicator);
            }
        }
        setTimeout(() => {
            endIndicator.classList.add('visible');
        }, 100);
    }

    // Update pagination info bar
    updatePaginationInfo() {
        const paginationInfo = document.getElementById('paginationInfo');
        const paginationShown = document.getElementById('paginationShown');
        const paginationTotal = document.getElementById('paginationTotal');

        if (!paginationInfo || !paginationShown || !paginationTotal) return;

        paginationShown.textContent = this.visibleGamesCount;
        paginationTotal.textContent = this.filteredGames.length;

        // Show pagination info when scrolling and not all games are loaded
        if (window.scrollY > 200 && !this.allGamesLoaded && this.filteredGames.length > this.gamesPerPage) {
            paginationInfo.classList.add('visible');
        } else {
            paginationInfo.classList.remove('visible');
        }
    }

    renderTabs() {
        const container = document.getElementById('tabsContainer');
        container.innerHTML = '';

        this.tabs.forEach(tab => {
            const isHidden = this.hiddenTabs.has(tab.id);

            // Skip hidden tabs for non-admins
            if (isHidden && !this.isAdmin) {
                return;
            }

            const count = this.getTabCount(tab.id);
            const btn = document.createElement('button');
            btn.className = `tab-btn ${tab.id === this.currentTab ? 'active' : ''} ${isHidden ? 'hidden-tab' : ''}`;

            // Admin sees visibility toggle
            if (this.isAdmin && tab.id !== 'all') {
                btn.innerHTML = `
                    <span>${tab.name}</span>
                    <span class="count">${count}</span>
                    <span class="tab-visibility-toggle" data-tab="${tab.id}" title="${isHidden ? 'Show to all' : 'Hide from non-admins'}">${isHidden ? '👁️‍🗨️' : '👁️'}</span>
                `;
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
        if (tabId === 'all') return this.games.length;
        return this.games.filter(g => g.category === tabId).length;
    }

    selectTab(tabId) {
        this.currentTab = tabId;
        this.renderTabs();
        this.filterAndRender();
    }

    filterAndRender() {
        let filtered = this.currentTab === 'all'
            ? [...this.games]
            : this.games.filter(g => g.category === this.currentTab);

        // Hide games from hidden tabs for non-admins
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

        // Reset infinite scroll state on filter/search change
        this.visibleGamesCount = 0;
        this.allGamesLoaded = false;
        this.isLoadingMore = false;

        // Remove any existing end indicator
        const endIndicator = document.getElementById('infiniteScrollEnd');
        if (endIndicator) {
            endIndicator.remove();
        }

        this.renderGames();
    }

    renderGames() {
        const grid = document.getElementById('gamesGrid');
        const noResults = document.getElementById('noResults');

        if (this.filteredGames.length === 0) {
            grid.innerHTML = '';
            noResults.style.display = 'block';
            this.visibleGamesCount = 0;
            this.updatePaginationInfo();
            return;
        }

        noResults.style.display = 'none';

        // Render initial batch for infinite scroll
        const initialBatch = this.filteredGames.slice(0, this.gamesPerPage);
        this.visibleGamesCount = initialBatch.length;
        this.allGamesLoaded = this.visibleGamesCount >= this.filteredGames.length;

        grid.innerHTML = initialBatch.map(game => this.createGameCard(game)).join('');
        this.updatePaginationInfo();

        // Show end of list if all games fit in initial batch
        if (this.allGamesLoaded && this.filteredGames.length > 0) {
            this.showEndOfList();
        }

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
        const dateAdded = this.datesAdded[game.id];
        const dateStr = dateAdded ? new Date(dateAdded).toLocaleDateString() : 'N/A';

        return `
            <div class="game-card ${isSelected ? 'selected' : ''} ${isInstalled ? 'installed' : ''} ${isNew ? 'new-game' : ''}" data-id="${game.id}">
                <input type="checkbox" class="select-checkbox" ${isSelected ? 'checked' : ''}>
                <button class="info-btn" title="View details">ℹ️</button>
                <button class="install-btn ${isInstalled ? 'is-installed' : ''}" title="${isInstalled ? 'Mark as not installed' : 'Mark as installed'}">${isInstalled ? '✅' : '📥'}</button>
                ${isNew ? '<div class="new-badge">🆕 NEW</div>' : ''}
                ${isInstalled ? '<div class="installed-badge">✓ Installed</div>' : ''}
                <div class="quick-tooltip">
                    <div class="tooltip-header">${game.name}</div>
                    <div class="tooltip-row"><span class="tooltip-icon">📁</span><span class="tooltip-label">Category:</span><span class="tooltip-value">${game.category || 'uncategorized'}</span></div>
                    <div class="tooltip-row"><span class="tooltip-icon">⏱️</span><span class="tooltip-label">Playtime:</span><span class="tooltip-value">${timeStr}</span></div>
                    <div class="tooltip-row"><span class="tooltip-icon">💾</span><span class="tooltip-label">Size:</span><span class="tooltip-value">${sizeStr}</span></div>
                    <div class="tooltip-row"><span class="tooltip-icon">📅</span><span class="tooltip-label">Added:</span><span class="tooltip-value">${dateStr}</span></div>
                    ${isInstalled ? '<div class="tooltip-row tooltip-installed"><span class="tooltip-icon">✅</span><span>Installed</span></div>' : ''}
                </div>
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

        const moveToBtn = document.getElementById('moveToBtn');
        moveToBtn.disabled = count === 0;
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

    lazyLoadImages() {
        const images = document.querySelectorAll('img[data-src]');
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = entry.target;
                    img.src = img.dataset.src;
                    observer.unobserve(img);
                }
            });
        }, { rootMargin: '100px' });

        images.forEach(img => observer.observe(img));
    }

    // Keyboard navigation for game cards
    handleKeyboardNavigation(e) {
        // Skip if typing in input fields or if modals are open
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        if (document.querySelector('.modal.active')) return;

        const grid = document.getElementById('gamesGrid');
        const cards = grid.querySelectorAll('.game-card');
        if (cards.length === 0) return;

        // Calculate grid columns for proper navigation
        const gridStyle = window.getComputedStyle(grid);
        const gridTemplateColumns = gridStyle.getPropertyValue('grid-template-columns');
        const columnsCount = gridTemplateColumns.split(' ').filter(col => col.trim()).length || 1;

        switch (e.key) {
            case 'ArrowRight':
                e.preventDefault();
                this.navigateCards(1, cards.length);
                break;
            case 'ArrowLeft':
                e.preventDefault();
                this.navigateCards(-1, cards.length);
                break;
            case 'ArrowDown':
                e.preventDefault();
                this.navigateCards(columnsCount, cards.length);
                break;
            case 'ArrowUp':
                e.preventDefault();
                this.navigateCards(-columnsCount, cards.length);
                break;
            case 'Enter':
                e.preventDefault();
                this.activateFocusedCard('open');
                break;
            case ' ': // Space
                e.preventDefault();
                this.activateFocusedCard('toggle');
                break;
            case 'Home':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.focusCard(0);
                }
                break;
            case 'End':
                if (e.ctrlKey) {
                    e.preventDefault();
                    this.focusCard(cards.length - 1);
                }
                break;
        }
    }

    navigateCards(delta, totalCards) {
        if (totalCards === 0) return;

        // Initialize focus if not set
        if (this.focusedCardIndex === -1) {
            this.focusCard(0);
            return;
        }

        // Calculate new index with wrapping
        let newIndex = this.focusedCardIndex + delta;

        // Clamp to valid range (no wrapping for better UX)
        if (newIndex < 0) newIndex = 0;
        if (newIndex >= totalCards) newIndex = totalCards - 1;

        this.focusCard(newIndex);
    }

    focusCard(index) {
        const grid = document.getElementById('gamesGrid');
        const cards = grid.querySelectorAll('.game-card');

        if (index < 0 || index >= cards.length) return;

        // Remove focus from previous card
        cards.forEach(card => card.classList.remove('keyboard-focused'));

        // Set new focused index
        this.focusedCardIndex = index;
        const targetCard = cards[index];

        // Add focus class
        targetCard.classList.add('keyboard-focused');

        // Scroll into view smoothly
        targetCard.scrollIntoView({
            behavior: 'smooth',
            block: 'nearest',
            inline: 'nearest'
        });

        // Show keyboard hints
        this.showKeyboardHints();

        // Announce for accessibility
        const gameId = targetCard.dataset.id;
        const game = this.games.find(g => g.id === gameId);
        if (game) {
            this.announceForScreenReader(`${game.name}, ${index + 1} of ${cards.length}`);
        }
    }

    showKeyboardHints() {
        const hints = document.getElementById('keyboardHints');
        if (hints) {
            hints.classList.add('visible');
            // Auto-hide after 5 seconds of no navigation
            clearTimeout(this._keyboardHintTimeout);
            this._keyboardHintTimeout = setTimeout(() => {
                hints.classList.remove('visible');
            }, 5000);
        }
    }

    hideKeyboardHints() {
        const hints = document.getElementById('keyboardHints');
        if (hints) {
            hints.classList.remove('visible');
            clearTimeout(this._keyboardHintTimeout);
        }
    }

    clearCardFocus() {
        this.focusedCardIndex = -1;
        const cards = document.querySelectorAll('.game-card.keyboard-focused');
        cards.forEach(card => card.classList.remove('keyboard-focused'));
        this.hideKeyboardHints();
    }

    activateFocusedCard(action) {
        if (this.focusedCardIndex === -1) return;

        const grid = document.getElementById('gamesGrid');
        const cards = grid.querySelectorAll('.game-card');
        const card = cards[this.focusedCardIndex];

        if (!card) return;

        const gameId = card.dataset.id;
        const game = this.games.find(g => g.id === gameId);

        if (!game) return;

        if (action === 'open') {
            // Enter key - open game modal
            this.openGameModal(game);
        } else if (action === 'toggle') {
            // Space key - toggle selection
            const isSelected = this.selectedGames.has(gameId);
            const checkbox = card.querySelector('.select-checkbox');
            if (checkbox) {
                checkbox.checked = !isSelected;
            }
            this.toggleGameSelection(gameId, !isSelected);
        }
    }

    announceForScreenReader(message) {
        // Create or reuse live region for screen reader announcements
        let liveRegion = document.getElementById('sr-live-region');
        if (!liveRegion) {
            liveRegion = document.createElement('div');
            liveRegion.id = 'sr-live-region';
            liveRegion.setAttribute('role', 'status');
            liveRegion.setAttribute('aria-live', 'polite');
            liveRegion.setAttribute('aria-atomic', 'true');
            liveRegion.className = 'sr-only';
            document.body.appendChild(liveRegion);
        }
        liveRegion.textContent = message;
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

    runInTerminal() {
        if (!this.currentGame) return;
        this.downloadRunScript([this.currentGame.id]);
    }

    runSelectedGames() {
        if (this.selectedGames.size === 0) {
            this.showToast('No games selected', 'error');
            return;
        }
        this.downloadRunScript([...this.selectedGames]);
    }

    downloadRunScript(gameIds) {
        const dockerUser = this.settings.dockerUsername || 'michadockermisha';
        const repoName = this.settings.repoName || 'backup';
        const mountPath = document.getElementById('globalMountPath').value || this.settings.mountPath || 'F:/Games';

        // Parse mountPath to get Docker mount format for Windows
        // e.g., "F:/Games" -> drive mount "F:/:/f/", internal path "/f/Games/"
        const driveLetter = mountPath.match(/^([A-Za-z]):/)?.[1]?.toLowerCase() || 'f';
        const pathAfterDrive = mountPath.replace(/^[A-Za-z]:/, '').replace(/\\/g, '/') || '/Games';
        const dockerMount = `${driveLetter.toUpperCase()}:/:/${driveLetter}/`;
        const internalPath = `/${driveLetter}${pathAfterDrive}`;

        let script, filename;
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const gameCount = gameIds.length;

        if (this.os === 'windows') {
            // Windows .bat file - double-click to run!
            // Build list of images to pull
            const imageList = gameIds.map(id => `${dockerUser}/${repoName}:${id}`).join(' ');

            // Build run commands for each game
            const commands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                return `
echo.
echo [%date% %time%] Running game ${idx + 1}/${gameCount}: ${gameName}
echo ============================================================
docker run -v "${dockerMount}" --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home ${internalPath}/ && cd ${internalPath} && mv home ${id}"
if %ERRORLEVEL% EQU 0 (
    echo [SUCCESS] ${gameName} completed successfully!
) else (
    echo [ERROR] ${gameName} failed with error code %ERRORLEVEL%
)
REM Small delay to let network settle before next game
if ${idx + 1} LSS ${gameCount} (
    echo.
    echo Waiting 3 seconds before next game...
    timeout /t 3 /nobreak >nul
)`;
            }).join('\n');

            // Build pull commands with robust retry logic for Docker Desktop issues
            const pullCommands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                return `
echo.
echo [%date% %time%] Pulling image ${idx + 1}/${gameCount}: ${gameName}
set "PULL_SUCCESS=0"
set "RETRY_DELAY=5"
for /L %%i in (1,1,5) do (
    if !PULL_SUCCESS! EQU 0 (
        REM Check Docker health before attempting pull
        docker info >nul 2>&1
        if !ERRORLEVEL! NEQ 0 (
            echo [WARNING] Docker not responding, attempting recovery...
            call :recover_docker
        )

        REM Attempt the pull and capture output for error detection
        docker pull ${dockerUser}/${repoName}:${id} 2>&1
        if !ERRORLEVEL! EQU 0 (
            set "PULL_SUCCESS=1"
            echo [OK] Image pulled successfully!
        ) else (
            echo [RETRY %%i/5] Pull failed, attempting recovery...

            REM Flush DNS cache
            ipconfig /flushdns >nul 2>&1

            REM Reset Windows network stack
            netsh winsock reset >nul 2>&1
            netsh int ip reset >nul 2>&1

            REM Try to restart Docker Desktop if it's having issues
            call :recover_docker

            REM Exponential backoff: 5, 10, 20, 40, 60 seconds
            echo [INFO] Waiting !RETRY_DELAY! seconds before retry...
            timeout /t !RETRY_DELAY! /nobreak >nul
            set /a "RETRY_DELAY=RETRY_DELAY*2"
            if !RETRY_DELAY! GTR 60 set "RETRY_DELAY=60"
        )
    )
)
if !PULL_SUCCESS! EQU 0 (
    echo [WARNING] Failed to pull ${gameName} after 5 attempts, will try during run...
)`;
            }).join('\n');

            script = `@echo off
setlocal EnableDelayedExpansion
REM ============================================================
REM Game Library Manager - Docker Runner
REM Generated: ${new Date().toISOString()}
REM Games: ${gameCount}
REM ============================================================
REM
REM INSTRUCTIONS:
REM 1. Make sure Docker Desktop is running
REM 2. Double-click this .bat file to run
REM 3. Games will be downloaded to ${mountPath}
REM
REM This script includes:
REM - Pre-pulling all images with robust retry logic
REM - Automatic Docker Desktop recovery on pipe/connection errors
REM - Network stack reset on failures
REM - Exponential backoff between retries
REM
REM ============================================================

echo.
echo  ====================================
echo   Game Library Manager v3.6
echo   Running ${gameCount} game(s)
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

    REM Test again
    ping -n 1 registry-1.docker.io >nul 2>&1
    if !ERRORLEVEL! NEQ 0 (
        echo [WARNING] Still cannot reach Docker Hub, will retry during pulls...
    )
)

REM ============================================================
REM PHASE 1: Pre-pull all images with retry logic
REM ============================================================
echo.
echo ============================================================
echo PHASE 1: Pre-pulling ${gameCount} Docker image(s)...
echo This helps prevent network issues during the run phase.
echo ============================================================

${pullCommands}

echo.
echo ============================================================
echo PHASE 2: Running games and extracting files
echo Starting downloads to: ${mountPath}
echo ============================================================

${commands}

echo.
echo ============================================================
echo All ${gameCount} game(s) processed!
echo Check ${mountPath} for your games.
echo ============================================================
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

        } else {
            // macOS / Linux .sh file
            // Build run commands with delays between games
            const commands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                const isLastGame = idx === gameCount - 1;
                return `
echo ""
echo "[$(date)] Running game $((${idx} + 1))/${gameCount}: ${gameName}"
echo "============================================================"
docker run -v "${mountPath}:/games" -it --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home /games/ && cd /games && mv home ${id}"
if [ $? -eq 0 ]; then
    echo "[SUCCESS] ${gameName} completed successfully!"
else
    echo "[ERROR] ${gameName} failed!"
fi${!isLastGame ? `
# Small delay to let network settle before next game
echo ""
echo "Waiting 3 seconds before next game..."
sleep 3` : ''}`;
            }).join('\n');

            // Build pull commands with robust retry logic for Docker issues
            const pullCommands = gameIds.map((id, idx) => {
                const game = this.games.find(g => g.id === id);
                const gameName = game ? game.name : id;
                return `
echo ""
echo "[$(date)] Pulling image $((${idx} + 1))/${gameCount}: ${gameName}"
PULL_SUCCESS=0
RETRY_DELAY=5
for i in 1 2 3 4 5; do
    if [ $PULL_SUCCESS -eq 0 ]; then
        # Check Docker health before attempting pull
        if ! docker info > /dev/null 2>&1; then
            echo "[WARNING] Docker not responding, attempting recovery..."
            recover_docker
        fi

        # Attempt the pull
        if docker pull ${dockerUser}/${repoName}:${id} 2>&1; then
            PULL_SUCCESS=1
            echo "[OK] Image pulled successfully!"
        else
            echo "[RETRY $i/5] Pull failed, attempting recovery..."

            # Flush DNS cache (works on most systems)
            if command -v systemd-resolve &> /dev/null; then
                sudo systemd-resolve --flush-caches 2>/dev/null || true
            elif command -v resolvectl &> /dev/null; then
                sudo resolvectl flush-caches 2>/dev/null || true
            elif command -v dscacheutil &> /dev/null; then
                sudo dscacheutil -flushcache 2>/dev/null || true
                sudo killall -HUP mDNSResponder 2>/dev/null || true
            fi

            # Attempt Docker recovery
            recover_docker

            # Exponential backoff
            echo "[INFO] Waiting $RETRY_DELAY seconds before retry..."
            sleep $RETRY_DELAY
            RETRY_DELAY=$((RETRY_DELAY * 2))
            if [ $RETRY_DELAY -gt 60 ]; then
                RETRY_DELAY=60
            fi
        fi
    fi
done
if [ $PULL_SUCCESS -eq 0 ]; then
    echo "[WARNING] Failed to pull ${gameName} after 5 attempts, will try during run..."
fi`;
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
# This script includes:
# - Pre-pulling all images with robust retry logic
# - Automatic Docker recovery on connection errors
# - DNS cache flush on network failures
# - Exponential backoff between retries
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
            echo "[RECOVERY] Waiting... $w/12"
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
echo "  Game Library Manager v3.6"
echo "  Running ${gameCount} game(s)"
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

    # Test again
    if ! ping -c 1 registry-1.docker.io > /dev/null 2>&1; then
        echo "[WARNING] Still cannot reach Docker Hub, will retry during pulls..."
    fi
fi

# ============================================================
# PHASE 1: Pre-pull all images with retry logic
# ============================================================
echo ""
echo "============================================================"
echo "PHASE 1: Pre-pulling ${gameCount} Docker image(s)..."
echo "This helps prevent network issues during the run phase."
echo "============================================================"

${pullCommands}

echo ""
echo "============================================================"
echo "PHASE 2: Running games and extracting files"
echo "Starting downloads to: ${mountPath}"
echo "============================================================"

${commands}

echo ""
echo "============================================================"
echo "All ${gameCount} game(s) processed!"
echo "Check ${mountPath} for your games."
echo "============================================================"
echo ""
`;
            filename = gameCount === 1
                ? `run_${gameIds[0]}.sh`
                : `run_${gameCount}_games_${timestamp}.sh`;
        }

        // Download the file
        // For Windows .bat files, convert LF to CRLF line endings
        const finalScript = this.os === 'windows' 
            ? script.replace(/\r?\n/g, '\r\n')  // Normalize to CRLF for Windows batch files
            : script;
        
        const blob = new Blob([finalScript], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`Downloaded: ${filename} - Double-click to run!`, 'success');
    }

    downloadKillScript() {
        let script, filename;

        if (this.os === 'windows') {
            script = `@echo off
REM Kill all Docker containers
echo Stopping and removing all Docker containers...
docker rm -f $(docker ps -aq) 2>nul
echo Done!
pause
`;
            filename = 'kill_all_containers.bat';
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

    toggleMoveToMenu(e) {
        e.stopPropagation();
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
        // Save modified games to localStorage
        localStorage.setItem('gameLibraryGames', JSON.stringify(this.games));
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

    // ============================================================
    // Search Suggestions with Fuzzy Matching
    // ============================================================

    loadRecentSearches() {
        try {
            const saved = localStorage.getItem('recentSearches');
            return saved ? JSON.parse(saved) : [];
        } catch {
            return [];
        }
    }

    saveRecentSearches() {
        localStorage.setItem('recentSearches', JSON.stringify(this.recentSearches));
    }

    addRecentSearch(query) {
        if (!query || query.trim().length < 2) return;

        const trimmed = query.trim();
        // Remove if already exists
        this.recentSearches = this.recentSearches.filter(s => s.toLowerCase() !== trimmed.toLowerCase());
        // Add to beginning
        this.recentSearches.unshift(trimmed);
        // Keep only max recent searches
        if (this.recentSearches.length > this.maxRecentSearches) {
            this.recentSearches = this.recentSearches.slice(0, this.maxRecentSearches);
        }
        this.saveRecentSearches();
    }

    clearRecentSearches() {
        this.recentSearches = [];
        this.saveRecentSearches();
        this.updateSearchSuggestions(document.getElementById('searchInput').value);
        this.showToast('Recent searches cleared', 'info');
    }

    removeRecentSearch(index) {
        this.recentSearches.splice(index, 1);
        this.saveRecentSearches();
        this.updateSearchSuggestions(document.getElementById('searchInput').value);
    }

    // Fuzzy matching algorithm - returns score (higher = better match)
    fuzzyMatch(query, text) {
        if (!query || !text) return 0;

        query = query.toLowerCase();
        text = text.toLowerCase();

        // Exact match
        if (text === query) return 100;

        // Starts with query
        if (text.startsWith(query)) return 90;

        // Contains query
        if (text.includes(query)) return 80;

        // Fuzzy matching - check if all characters appear in order
        let queryIndex = 0;
        let matchScore = 0;
        let lastMatchIndex = -1;
        let consecutiveBonus = 0;

        for (let i = 0; i < text.length && queryIndex < query.length; i++) {
            if (text[i] === query[queryIndex]) {
                matchScore += 10;
                // Bonus for consecutive matches
                if (lastMatchIndex === i - 1) {
                    consecutiveBonus += 5;
                }
                // Bonus for matching at word boundaries
                if (i === 0 || text[i - 1] === ' ' || text[i - 1] === '-' || text[i - 1] === '_') {
                    matchScore += 15;
                }
                lastMatchIndex = i;
                queryIndex++;
            }
        }

        // If not all characters matched
        if (queryIndex < query.length) return 0;

        // Calculate final score
        const completionRatio = query.length / text.length;
        return Math.min(79, matchScore + consecutiveBonus + (completionRatio * 20));
    }

    // Highlight matching parts in text
    highlightMatch(text, query) {
        if (!query || !text) return text;

        const lowerText = text.toLowerCase();
        const lowerQuery = query.toLowerCase();

        // Try to find exact substring first
        const exactIndex = lowerText.indexOf(lowerQuery);
        if (exactIndex !== -1) {
            return text.substring(0, exactIndex) +
                '<span class="match-highlight">' +
                text.substring(exactIndex, exactIndex + query.length) +
                '</span>' +
                text.substring(exactIndex + query.length);
        }

        // Fuzzy highlight - highlight matching characters
        let result = '';
        let queryIndex = 0;

        for (let i = 0; i < text.length; i++) {
            if (queryIndex < lowerQuery.length && text[i].toLowerCase() === lowerQuery[queryIndex]) {
                result += '<span class="match-highlight">' + text[i] + '</span>';
                queryIndex++;
            } else {
                result += text[i];
            }
        }

        return result;
    }

    updateSearchSuggestions(query) {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        const recentSection = document.getElementById('recentSearchesSection');
        const recentList = document.getElementById('recentSearchesList');
        const suggestionsSection = document.getElementById('suggestionsSection');
        const suggestionsList = document.getElementById('suggestionsList');

        // Reset highlight index
        this.suggestionsHighlightIndex = -1;

        // Clear previous suggestions
        recentList.innerHTML = '';
        suggestionsList.innerHTML = '';

        const trimmedQuery = query.trim();

        // Show recent searches when query is empty
        if (!trimmedQuery) {
            if (this.recentSearches.length > 0) {
                recentSection.style.display = 'flex';
                this.recentSearches.forEach((search, index) => {
                    const item = this.createRecentSearchItem(search, index);
                    recentList.appendChild(item);
                });
            } else {
                recentSection.style.display = 'none';
            }
            suggestionsSection.style.display = 'none';
            this.showSearchSuggestions();
            return;
        }

        // Get fuzzy-matched games
        const matches = [];
        for (const game of this.games) {
            const nameScore = this.fuzzyMatch(trimmedQuery, game.name);
            const idScore = this.fuzzyMatch(trimmedQuery, game.id);
            const categoryScore = game.category ? this.fuzzyMatch(trimmedQuery, game.category) * 0.5 : 0;

            const bestScore = Math.max(nameScore, idScore, categoryScore);
            if (bestScore > 0) {
                matches.push({ game, score: bestScore });
            }
        }

        // Sort by score (descending)
        matches.sort((a, b) => b.score - a.score);

        // Take top 8 results
        const topMatches = matches.slice(0, 8);

        if (topMatches.length > 0) {
            suggestionsSection.style.display = 'flex';
            topMatches.forEach((match, index) => {
                const item = this.createSuggestionItem(match.game, trimmedQuery, index);
                suggestionsList.appendChild(item);
            });
        } else {
            suggestionsSection.style.display = 'none';
            // Show no results message
            const noResults = document.createElement('div');
            noResults.className = 'search-no-results';
            noResults.innerHTML = '<div class="no-results-icon">🔍</div><div>No games found for "' + this.escapeHtml(trimmedQuery) + '"</div>';
            suggestionsList.appendChild(noResults);
        }

        // Filter recent searches that match the query
        const matchingRecent = this.recentSearches.filter(s =>
            s.toLowerCase().includes(trimmedQuery.toLowerCase()) && s.toLowerCase() !== trimmedQuery.toLowerCase()
        );

        if (matchingRecent.length > 0) {
            recentSection.style.display = 'flex';
            matchingRecent.slice(0, 3).forEach((search, index) => {
                const item = this.createRecentSearchItem(search, this.recentSearches.indexOf(search));
                recentList.appendChild(item);
            });
        } else {
            recentSection.style.display = 'none';
        }

        this.showSearchSuggestions();
    }

    createRecentSearchItem(search, index) {
        const item = document.createElement('div');
        item.className = 'search-suggestion-item recent';
        item.dataset.type = 'recent';
        item.dataset.index = index;
        item.dataset.value = search;

        item.innerHTML = `
            <div class="search-suggestion-icon">🕐</div>
            <div class="search-suggestion-content">
                <div class="search-suggestion-name">${this.escapeHtml(search)}</div>
            </div>
            <button class="search-suggestion-remove" data-index="${index}" title="Remove">×</button>
        `;

        // Click to search
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('search-suggestion-remove')) {
                document.getElementById('searchInput').value = search;
                this.searchQuery = search.toLowerCase();
                this.filterAndRender();
                this.hideSearchSuggestions();
            }
        });

        // Remove button click
        const removeBtn = item.querySelector('.search-suggestion-remove');
        removeBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.removeRecentSearch(index);
        });

        return item;
    }

    createSuggestionItem(game, query, index) {
        const item = document.createElement('div');
        item.className = 'search-suggestion-item';
        item.dataset.type = 'game';
        item.dataset.gameId = game.id;
        item.dataset.index = index;

        const imageUrl = `https://images.igdb.com/igdb/image/upload/t_cover_big/${game.id}.jpg`;
        const time = this.times[game.id] ? `${this.times[game.id]}h` : '';
        const size = this.imageSizes[game.id] ? `${this.imageSizes[game.id]} GB` : '';
        const category = game.category || '';

        item.innerHTML = `
            <div class="search-suggestion-icon">
                <img src="${imageUrl}" alt="" onerror="this.parentElement.innerHTML='🎮'">
            </div>
            <div class="search-suggestion-content">
                <div class="search-suggestion-name">${this.highlightMatch(game.name, query)}</div>
                <div class="search-suggestion-meta">
                    ${category ? `<span>📁 ${category}</span>` : ''}
                    ${time ? `<span>⏱️ ${time}</span>` : ''}
                    ${size ? `<span>💾 ${size}</span>` : ''}
                </div>
            </div>
        `;

        // Click to open game modal and save search
        item.addEventListener('click', () => {
            this.addRecentSearch(query);
            this.hideSearchSuggestions();
            this.openGameModal(game);
        });

        return item;
    }

    showSearchSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        suggestionsContainer.classList.add('visible');
        this.suggestionsVisible = true;
    }

    hideSearchSuggestions() {
        const suggestionsContainer = document.getElementById('searchSuggestions');
        suggestionsContainer.classList.remove('visible');
        this.suggestionsVisible = false;
        this.suggestionsHighlightIndex = -1;
    }

    navigateSuggestions(direction) {
        const items = document.querySelectorAll('#searchSuggestions .search-suggestion-item');
        if (items.length === 0) return;

        // Remove current highlight
        items.forEach(item => item.classList.remove('highlighted'));

        // Calculate new index
        this.suggestionsHighlightIndex += direction;

        if (this.suggestionsHighlightIndex < 0) {
            this.suggestionsHighlightIndex = items.length - 1;
        } else if (this.suggestionsHighlightIndex >= items.length) {
            this.suggestionsHighlightIndex = 0;
        }

        // Apply highlight
        const highlightedItem = items[this.suggestionsHighlightIndex];
        if (highlightedItem) {
            highlightedItem.classList.add('highlighted');
            highlightedItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        }
    }

    selectHighlightedSuggestion() {
        const items = document.querySelectorAll('#searchSuggestions .search-suggestion-item');
        if (this.suggestionsHighlightIndex >= 0 && this.suggestionsHighlightIndex < items.length) {
            const item = items[this.suggestionsHighlightIndex];
            item.click();
        }
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
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
            this.loadHiddenTabs();
            this.renderTabs();
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
        this.renderTabs();
        this.filterAndRender();
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
    }

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
        localStorage.setItem('hiddenTabs', JSON.stringify([...this.hiddenTabs]));
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
        this.saveHiddenTabs();
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
        const loadingIndicator = document.getElementById('loadingIndicator');
        const gamesGrid = document.getElementById('gamesGrid');

        if (show) {
            // Show skeleton loading cards instead of just a spinner
            loadingIndicator.style.display = 'none';
            gamesGrid.style.display = 'grid';
            gamesGrid.innerHTML = this.generateSkeletonCards(12);
            gamesGrid.classList.add('skeleton-grid');
        } else {
            gamesGrid.classList.remove('skeleton-grid');
            // Games will be rendered by renderGames()
        }
    }

    generateSkeletonCards(count = 12) {
        let cards = '';
        for (let i = 0; i < count; i++) {
            cards += `
                <div class="skeleton-card">
                    <div class="skeleton-image"></div>
                    <div class="skeleton-info">
                        <div class="skeleton-title"></div>
                        <div class="skeleton-meta">
                            <div class="skeleton-badge category"></div>
                            <div class="skeleton-badge time"></div>
                            <div class="skeleton-badge size"></div>
                        </div>
                    </div>
                </div>
            `;
        }
        return cards;
    }

    showToast(message, type = 'info') {
        const container = document.getElementById('toastContainer');
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        toast.innerHTML = `
            <span>${type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️'}</span>
            <span>${message}</span>
        `;
        container.appendChild(toast);

        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    window.gameLibrary = new GameLibrary();
});
