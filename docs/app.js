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

        this.init();
    }

    async init() {
        this.showLoading(true);
        this.detectOS();
        this.bindEvents();
        this.applySettings();

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
        // Poll every 5 seconds for new tags - INSTANT updates!
        this.syncInterval = setInterval(() => {
            this.autoSyncDockerHub();
        }, 5000);

        // Also update sync button to show auto-sync is active
        const syncBtn = document.getElementById('syncDockerBtn');
        if (syncBtn) {
            syncBtn.title = 'Auto-syncing every 5s (click to sync now)';
        }

        console.log('🔄 Auto-sync started: checking Docker Hub every 5 seconds');
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

        // Use multiple CORS proxies - race them for fastest response
        const corsProxies = [
            'https://corsproxy.io/?',
            'https://api.allorigins.win/raw?url=',
            'https://api.codetabs.com/v1/proxy?quest=',
            'https://cors-anywhere.herokuapp.com/',
            'https://thingproxy.freeboard.io/fetch/'
        ];

        // Helper to fetch a single URL with timeout
        const fetchWithTimeout = async (url, timeout = 8000) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            try {
                const response = await fetch(url, {
                    headers: { 'Accept': 'application/json' },
                    signal: controller.signal
                });
                clearTimeout(timeoutId);
                if (response.ok) return await response.json();
                throw new Error('Not OK');
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        };

        // Fetch a single page using racing proxies for speed
        const fetchPage = async (page) => {
            const dockerUrl = `https://hub.docker.com/v2/repositories/${dockerUser}/${repoName}/tags?page=${page}&page_size=${pageSize}&_=${cacheBuster}`;

            // Race all proxies - fastest wins
            const proxyPromises = corsProxies.map(proxy =>
                fetchWithTimeout(proxy + encodeURIComponent(dockerUrl))
            );

            // Also try direct (may fail due to CORS but worth trying)
            proxyPromises.push(fetchWithTimeout(dockerUrl).catch(() => null));

            try {
                // Promise.any returns first successful result
                const data = await Promise.any(proxyPromises);
                return data;
            } catch (e) {
                return null;
            }
        };

        try {
            // Step 1: Fetch first page to get total count
            const firstPage = await fetchPage(1);
            if (!firstPage || !firstPage.results) {
                console.log('Failed to fetch first page from Docker Hub');
                return [];
            }

            const allTags = [...firstPage.results];
            const totalCount = firstPage.count || 0;
            const totalPages = Math.ceil(totalCount / pageSize);

            console.log(`Docker Hub: ${totalCount} total tags, ${totalPages} pages`);

            // Step 2: Fetch ALL remaining pages in PARALLEL (no limit!)
            if (totalPages > 1) {
                const pageNumbers = [];
                for (let p = 2; p <= totalPages; p++) {
                    pageNumbers.push(p);
                }

                // Fetch in batches of 5 to avoid overwhelming proxies
                const batchSize = 5;
                for (let i = 0; i < pageNumbers.length; i += batchSize) {
                    const batch = pageNumbers.slice(i, i + batchSize);
                    const batchResults = await Promise.all(batch.map(p => fetchPage(p)));

                    for (const data of batchResults) {
                        if (data && data.results) {
                            allTags.push(...data.results);
                        }
                    }
                }
            }

            console.log(`✅ Fetched ${allTags.length} tags from Docker Hub`);
            return allTags;
        } catch (error) {
            console.error('Error fetching Docker tags:', error);
            return [];
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

            switch (this.sortBy) {
                case 'name':
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
                    break;
                case 'time':
                    valA = this.times[a.id] || 999;
                    valB = this.times[b.id] || 999;
                    break;
                case 'category':
                    valA = a.category || 'zzz';
                    valB = b.category || 'zzz';
                    break;
                case 'size':
                    valA = this.imageSizes[a.id] || 999;
                    valB = this.imageSizes[b.id] || 999;
                    break;
                case 'date':
                    valA = this.datesAdded[a.id] ? new Date(this.datesAdded[a.id]).getTime() : 0;
                    valB = this.datesAdded[b.id] ? new Date(this.datesAdded[b.id]).getTime() : 0;
                    break;
                default:
                    valA = a.name.toLowerCase();
                    valB = b.name.toLowerCase();
            }

            if (valA < valB) return this.sortOrder === 'asc' ? -1 : 1;
            if (valA > valB) return this.sortOrder === 'asc' ? 1 : -1;
            return 0;
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
            <div class="game-card ${isSelected ? 'selected' : ''} ${isInstalled ? 'installed' : ''} ${isNew ? 'new-game' : ''}" data-id="${game.id}">
                <input type="checkbox" class="select-checkbox" ${isSelected ? 'checked' : ''}>
                <button class="info-btn" title="View details">ℹ️</button>
                <button class="install-btn ${isInstalled ? 'is-installed' : ''}" title="${isInstalled ? 'Mark as not installed' : 'Mark as installed'}">${isInstalled ? '✅' : '📥'}</button>
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

    getDockerCommand(gameId) {
        const dockerUser = this.settings.dockerUsername || 'michadockermisha';
        const repoName = this.settings.repoName || 'backup';
        const mountPath = document.getElementById('globalMountPath').value || this.settings.mountPath || 'F:/Games';

        // Full docker command with volume mount for F:/ drive
        return `docker run -v "F:/:/f/" -it --rm --name ${gameId} ${dockerUser}/${repoName}:${gameId} sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home /f/Games/ && cd /f/Games && mv home ${gameId}"`;
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
docker run -v "F:/:/f/" -it --rm --name ${id} ${dockerUser}/${repoName}:${id} sh -c "apk add rsync 2>/dev/null; rsync -av --progress /home /f/Games/ && cd /f/Games && mv home ${id}"
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
REM 3. Games will be downloaded to F:\\Games\\
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
        const blob = new Blob([script], { type: 'text/plain' });
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
            'date-asc': '↓ Date',
            'date-desc': '↑ Date'
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
        document.getElementById('loadingIndicator').style.display = show ? 'flex' : 'none';
        document.getElementById('gamesGrid').style.display = show ? 'none' : 'grid';
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
