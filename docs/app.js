/**
 * Game Library Manager v3.5 - Web Application
 * A full-featured Docker game library manager
 */

class GameLibrary {
    constructor() {
        this.games = [];
        this.tabs = [];
        this.times = {};
        this.filteredGames = [];
        this.currentTab = 'all';
        this.searchQuery = '';
        this.sortBy = 'name';
        this.sortOrder = 'asc';
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
        } catch (error) {
            console.error('Failed to load data:', error);
            this.showToast('Failed to load game data', 'error');
            this.showLoading(false);
        }
    }

    async loadData() {
        // Load all data files in parallel
        const [gamesData, tabsData, timesData] = await Promise.all([
            fetch('data/games.json').then(r => r.json()),
            fetch('data/tabs.json').then(r => r.json()),
            fetch('data/times.json').then(r => r.json())
        ]);

        this.games = gamesData;
        this.tabs = tabsData;
        this.times = timesData;

        // Update stats
        document.getElementById('gameCount').textContent = this.games.length;
        document.getElementById('tabCount').textContent = `${this.tabs.length} tabs`;
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
        // Search
        const searchInput = document.getElementById('searchInput');
        searchInput.addEventListener('input', (e) => {
            this.searchQuery = e.target.value.toLowerCase();
            this.filterAndRender();
        });

        // Keyboard shortcuts
        document.addEventListener('keydown', (e) => {
            // Ctrl+K for search
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
            // Escape to close modals
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

        // Run Docker
        document.getElementById('runDockerBtn').addEventListener('click', () => {
            this.runInTerminal();
        });

        // Copy Script
        document.getElementById('copyScriptBtn').addEventListener('click', () => {
            this.copyScript();
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

        document.getElementById('mountPath').addEventListener('change', (e) => {
            this.settings.mountPath = e.target.value;
            this.saveSettings();
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
            const count = this.getTabCount(tab.id);
            const btn = document.createElement('button');
            btn.className = `tab-btn ${tab.id === this.currentTab ? 'active' : ''}`;
            btn.innerHTML = `
                <span>${tab.name}</span>
                <span class="count">${count}</span>
            `;
            btn.addEventListener('click', () => this.selectTab(tab.id));
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
        // Filter by tab
        let filtered = this.currentTab === 'all'
            ? [...this.games]
            : this.games.filter(g => g.category === this.currentTab);

        // Filter by search
        if (this.searchQuery) {
            filtered = filtered.filter(g =>
                g.name.toLowerCase().includes(this.searchQuery) ||
                g.id.toLowerCase().includes(this.searchQuery) ||
                (g.category && g.category.toLowerCase().includes(this.searchQuery))
            );
        }

        // Sort
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

        // Add click handlers
        grid.querySelectorAll('.game-card').forEach(card => {
            card.addEventListener('click', () => {
                const gameId = card.dataset.id;
                const game = this.games.find(g => g.id === gameId);
                if (game) this.openGameModal(game);
            });
        });

        // Lazy load images
        this.lazyLoadImages();
    }

    createGameCard(game) {
        const time = this.times[game.id];
        const timeStr = time ? `${time}h` : 'N/A';
        const imageName = game.id.toLowerCase();

        return `
            <div class="game-card" data-id="${game.id}">
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
                    </div>
                </div>
            </div>
        `;
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

    openGameModal(game) {
        const modal = document.getElementById('gameModal');
        const time = this.times[game.id];
        const imageName = game.id.toLowerCase();

        document.getElementById('modalTitle').textContent = game.name;
        document.getElementById('modalCategory').textContent = game.category || 'uncategorized';
        document.getElementById('modalTime').textContent = time ? `~${time} hours` : 'N/A';
        document.getElementById('modalImage').src = `images/${imageName}.png`;
        document.getElementById('modalImage').onerror = function() {
            this.src = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 300 400'%3E%3Crect fill='%231f2937' width='300' height='400'/%3E%3Ctext x='150' y='200' text-anchor='middle' fill='%236366f1' font-size='40'%3E🎮%3C/text%3E%3C/svg%3E";
        };

        // Generate Docker command
        const dockerUser = this.settings.dockerUsername || 'myg1983';
        const mountPath = this.settings.mountPath || '/f/Games';
        const dockerCmd = `docker run -it --rm -v "${mountPath}:/games" ${dockerUser}/${game.id}`;
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

        const dockerUser = this.settings.dockerUsername || 'myg1983';
        const mountPath = this.settings.mountPath || '/f/Games';
        const cmd = `docker run -it --rm -v "${mountPath}:/games" ${dockerUser}/${this.currentGame.id}`;

        let script, filename, instructions;

        if (this.os === 'windows') {
            // PowerShell script
            script = `# Game Library Manager - Docker Runner
# Game: ${this.currentGame.name}
# Generated: ${new Date().toISOString()}

Write-Host "Starting Docker container for: ${this.currentGame.name}" -ForegroundColor Cyan
Write-Host ""

${cmd}

Write-Host ""
Write-Host "Container finished. Press any key to exit..." -ForegroundColor Yellow
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
            filename = `run_${this.currentGame.id}.ps1`;
            instructions = `
<h3>Windows Instructions:</h3>
<ol>
    <li>Save the script as <code>${filename}</code></li>
    <li>Right-click the file and select "Run with PowerShell"</li>
    <li>Or open PowerShell and run: <code>.\\${filename}</code></li>
</ol>
<p><strong>Quick method:</strong> Press Win+R, type <code>powershell</code>, paste the command, and press Enter.</p>
`;
        } else if (this.os === 'mac') {
            // Bash script for Mac
            script = `#!/bin/bash
# Game Library Manager - Docker Runner
# Game: ${this.currentGame.name}
# Generated: ${new Date().toISOString()}

echo "Starting Docker container for: ${this.currentGame.name}"
echo ""

${cmd}

echo ""
echo "Container finished. Press any key to exit..."
read -n 1 -s
`;
            filename = `run_${this.currentGame.id}.sh`;
            instructions = `
<h3>macOS Instructions:</h3>
<ol>
    <li>Save the script as <code>${filename}</code></li>
    <li>Open Terminal and run: <code>chmod +x ${filename} && ./${filename}</code></li>
</ol>
<p><strong>Quick method:</strong> Open Terminal (Cmd+Space, type "Terminal"), paste the command, and press Enter.</p>
`;
        } else {
            // Bash script for Linux
            script = `#!/bin/bash
# Game Library Manager - Docker Runner
# Game: ${this.currentGame.name}
# Generated: ${new Date().toISOString()}

echo "Starting Docker container for: ${this.currentGame.name}"
echo ""

${cmd}

echo ""
echo "Container finished. Press any key to exit..."
read -n 1 -s
`;
            filename = `run_${this.currentGame.id}.sh`;
            instructions = `
<h3>Linux Instructions:</h3>
<ol>
    <li>Save the script as <code>${filename}</code></li>
    <li>Open Terminal and run: <code>chmod +x ${filename} && ./${filename}</code></li>
</ol>
<p><strong>Quick method:</strong> Open your terminal, paste the command, and press Enter.</p>
`;
        }

        // Create and download script file
        const blob = new Blob([script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);

        this.showToast(`Script downloaded: ${filename}`, 'success');

        // Also copy command to clipboard
        navigator.clipboard.writeText(cmd);
    }

    copyScript() {
        if (!this.currentGame) return;

        const dockerUser = this.settings.dockerUsername || 'myg1983';
        const mountPath = this.settings.mountPath || '/f/Games';
        const cmd = `docker run -it --rm -v "${mountPath}:/games" ${dockerUser}/${this.currentGame.id}`;

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

        // Update UI
        document.querySelectorAll('.sort-option').forEach(btn => {
            btn.classList.toggle('active',
                btn.dataset.sort === sortBy && btn.dataset.order === order);
        });

        const indicators = {
            'name-asc': '↓ Name',
            'name-desc': '↑ Name',
            'time-asc': '↓ Time',
            'time-desc': '↑ Time',
            'category-asc': '↓ Cat'
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
        document.getElementById('mountPath').value = this.settings.mountPath;
        document.getElementById('settingsModal').classList.add('active');
    }

    loadSettings() {
        const defaults = {
            theme: 'dark',
            gridSize: 'medium',
            showTimes: true,
            showCategories: true,
            dockerUsername: 'myg1983',
            mountPath: '/f/Games'
        };

        try {
            const saved = localStorage.getItem('gameLibrarySettings');
            return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
        } catch {
            return defaults;
        }
    }

    saveSettings() {
        localStorage.setItem('gameLibrarySettings', JSON.stringify(this.settings));
    }

    applySettings() {
        document.body.dataset.theme = this.settings.theme;
        document.body.dataset.grid = this.settings.gridSize;
        document.getElementById('themeBtn').textContent = this.settings.theme === 'dark' ? '🌙' : '☀️';
    }

    exportData() {
        const data = {
            settings: this.settings,
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
                        this.filterAndRender();
                        this.showToast('Settings imported!', 'success');
                    }
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
