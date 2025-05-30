// app.js - Enhanced with Google Drive features and fixes
class TGDriveApp {
    constructor() {
         this.apiBase = 'https://unlimited-cloud-production.up.railway.app/api';
        
        this.currentFolderId = 0;
        this.folderPath = [];
        this.files = [];
        this.folders = [];
        this.viewMode = 'grid';
        this.authToken = localStorage.getItem('tgdrive_token');
        this.currentUser = null;
        this.totalStorageUsed = 0;
        this.totalFileCount = 0;
        this.uploadQueue = [];
        this.isUploading = false;
        this.activeUploads = new Map();
        this.backgroundUploads = false;
        this.draggedFile = null;
        this.mediaCache = new Map();
        this.currentTheme = localStorage.getItem('tgdrive-theme') || 'light';
        this.selectedFiles = new Set();
        this.currentView = 'home';
        this.folderSelectModal = null;
         this.selectedFiles = new Set();
    this.currentView = 'home';
    this.folderSelectModal = null;
        
        this.init();
    }
    
    init() {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => {
                this.setupApp();
            });
        } else {
            this.setupApp();
        }
    }
    
    async setupApp() {
        console.log('Setting up TGDrive app...');
        
        this.initTheme();
        this.bindEvents();
        
        // Handle pending login from main page
        if (window.pendingLogin) {
            console.log('Processing pending login...');
            this.authToken = window.pendingLogin.token;
            this.currentUser = window.pendingLogin.user;
            localStorage.setItem('tgdrive_token', this.authToken);
            delete window.pendingLogin;
            this.showMainApp();
            await this.loadContent();
            await this.updateStorageInfo();
            this.startRecentFilesPolling();
            return;
        }
        
        // Check existing token
        if (this.authToken) {
            console.log('Verifying existing token...');
            const isValid = await this.verifyToken();
            if (isValid) {
                this.showMainApp();
                await this.loadContent();
                await this.updateStorageInfo();
                this.startRecentFilesPolling();
            } else {
                console.log('Token invalid, clearing...');
                localStorage.removeItem('tgdrive_token');
                this.authToken = null;
                this.showLoginScreen();
            }
        } else {
            this.showLoginScreen();
        }
    }
    
    // Theme Management
    initTheme() {
        this.setTheme(this.currentTheme);
    }

    setTheme(theme) {
        this.currentTheme = theme;
        document.documentElement.setAttribute('data-theme', theme);
        localStorage.setItem('tgdrive-theme', theme);
        
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            themeIcon.className = theme === 'dark' ? 'fas fa-moon' : 'fas fa-sun';
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        this.setTheme(newTheme);
    }
    
    // Authentication
    async makeAuthenticatedRequest(url, options = {}) {
        const headers = {
            'Authorization': `Bearer ${this.authToken}`,
            ...options.headers
        };
        
        return fetch(url, { ...options, headers });
    }
    
    async verifyToken() {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/auth/verify`);
            if (response.ok) {
                const data = await response.json();
                this.currentUser = data.user;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Token verification failed:', error);
            return false;
        }
    }
    
    showLoginScreen() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        
        if (loginScreen) loginScreen.style.display = 'flex';
        if (app) app.style.display = 'none';
    }
    
   // Fix 3: Ensure bulk bar is hidden on app start
showMainApp() {
    const loginScreen = document.getElementById('loginScreen');
    const app = document.getElementById('app');
    
    if (loginScreen) loginScreen.style.display = 'none';
    if (app) app.style.display = 'flex';
    
    // FIXED: Hide bulk action bar on startup
    const bulkBar = document.getElementById('bulkActionBar');
    if (bulkBar) {
        bulkBar.classList.add('hidden');
    }
    
    // Update user info
    const userInfo = document.getElementById('userInfo');
    if (userInfo && this.currentUser) {
        userInfo.innerHTML = `
            <div class="flex items-center">
                <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                    <i class="fas fa-user text-white text-sm"></i>
                </div>
                <div>
                    <div class="font-medium theme-text-primary">${this.currentUser.first_name}</div>
                    <div class="text-xs theme-text-tertiary">@${this.currentUser.username || 'user'}</div>
                </div>
            </div>
        `;
    }
    
    this.setViewMode('grid');
}

    
    logout() {
        localStorage.removeItem('tgdrive_token');
        localStorage.removeItem('tgdrive-theme');
        window.location.reload();
    }
    
    // Event Binding
    bindEvents() {
        // Mobile menu
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const closeSidebarBtn = document.getElementById('closeSidebarBtn');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const sidebar = document.getElementById('sidebar');
        
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar?.classList.add('open');
                mobileOverlay?.classList.remove('hidden');
            });
        }
        
        if (closeSidebarBtn) {
            closeSidebarBtn.addEventListener('click', () => this.closeMobileSidebar());
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => this.closeMobileSidebar());
        }
        
        // Upload functionality
        const uploadBtn = document.getElementById('uploadBtn');
        const mobileUploadBtn = document.getElementById('mobileUploadBtn');
        const fileInput = document.getElementById('fileInput');
        
        [uploadBtn, mobileUploadBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    fileInput?.click();
                });
            }
        });
        
        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                if (e.target.files.length > 0) {
                    this.handleFileUpload(e.target.files);
                    e.target.value = '';
                }
            });
        }
        
        // View mode buttons
        const gridViewBtn = document.getElementById('gridViewBtn');
        const listViewBtn = document.getElementById('listViewBtn');
        
        if (gridViewBtn) {
            gridViewBtn.addEventListener('click', () => this.setViewMode('grid'));
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => this.setViewMode('list'));
        }

        // Theme toggle
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', () => this.toggleTheme());
        }
        
        // Starred and Bin buttons
        const starredBtn = document.getElementById('starredBtn');
        if (starredBtn) {
            starredBtn.addEventListener('click', () => this.loadStarredFiles());
        }

        const binBtn = document.getElementById('binBtn');
        if (binBtn) {
            binBtn.addEventListener('click', () => this.loadBinFiles());
        }
        
        // Search functionality
        this.bindSearchEvents();
        
        // Upload modal controls
        this.bindUploadModalEvents();
        
        // Media viewer
        this.bindMediaViewerEvents();
        
        // Folder operations
        this.bindFolderEvents();
        
        // Bulk actions
        this.bindBulkActions();
        
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => this.logout());
        }
        
        // Setup drag and drop
        this.setupDragAndDrop();
        
        // Close file menus on outside click
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.file-menu-btn')) {
                document.querySelectorAll('.file-menu.show').forEach(menu => {
                    menu.classList.remove('show');
                });
            }
        });
    }
    
    // Bind bulk action events
    bindBulkActions() {
        const bulkSelectAllBtn = document.getElementById('bulkSelectAllBtn');
        const bulkCopyBtn = document.getElementById('bulkCopyBtn');
        const bulkMoveBtn = document.getElementById('bulkMoveBtn');
        const bulkDeleteBtn = document.getElementById('bulkDeleteBtn');
        const bulkCancelBtn = document.getElementById('bulkCancelBtn');
        
        if (bulkSelectAllBtn) {
            bulkSelectAllBtn.addEventListener('click', () => this.selectAllFiles());
        }
        
        if (bulkCopyBtn) {
            bulkCopyBtn.addEventListener('click', () => this.showFolderSelectModal('copy'));
        }
        
        if (bulkMoveBtn) {
            bulkMoveBtn.addEventListener('click', () => this.showFolderSelectModal('move'));
        }
        
        if (bulkDeleteBtn) {
            bulkDeleteBtn.addEventListener('click', () => this.bulkDeleteFiles());
        }
        
        if (bulkCancelBtn) {
            bulkCancelBtn.addEventListener('click', () => this.clearSelection());
        }
    }
    
    // NEW: Enhanced folder selection modal
    showFolderSelectModal(operation) {
        if (this.selectedFiles.size === 0) {
            this.showError('Please select files first');
            return;
        }
        
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="theme-bg-secondary rounded-xl p-6 w-full max-w-md theme-border border">
                <h3 class="text-lg font-semibold mb-4 theme-text-primary">${operation === 'copy' ? 'Copy' : 'Move'} Files</h3>
                <p class="theme-text-secondary mb-4">Select destination folder for ${this.selectedFiles.size} selected file(s):</p>
                <div class="folder-list max-h-64 overflow-y-auto mb-4 theme-border border rounded-lg p-2">
                    <div class="folder-item p-2 hover:theme-bg-tertiary rounded cursor-pointer" data-folder-id="0">
                        <i class="fas fa-home mr-2 text-blue-500"></i>
                        <span class="theme-text-primary">Home</span>
                    </div>
                    ${this.renderFolderSelectOptions()}
                </div>
                <div class="flex justify-end space-x-3">
                    <button class="cancel-btn px-4 py-2 theme-text-secondary hover:theme-bg-tertiary rounded-lg transition-colors">Cancel</button>
                    <button class="confirm-btn px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors">${operation === 'copy' ? 'Copy' : 'Move'} Here</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        this.folderSelectModal = modal;
        
        let selectedFolderId = 0;
        
        // Bind folder selection
        modal.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('click', () => {
                modal.querySelectorAll('.folder-item').forEach(f => f.classList.remove('bg-blue-100'));
                item.classList.add('bg-blue-100');
                selectedFolderId = parseInt(item.dataset.folderId);
            });
        });
        
        // Bind buttons
        modal.querySelector('.cancel-btn').addEventListener('click', () => {
            this.closeFolderSelectModal();
        });
        
        modal.querySelector('.confirm-btn').addEventListener('click', async () => {
            await this.performBulkOperation(operation, selectedFolderId);
            this.closeFolderSelectModal();
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                this.closeFolderSelectModal();
            }
        });
    }
    
    renderFolderSelectOptions() {
        let html = '';
        this.folders.forEach(folder => {
            html += `
                <div class="folder-item p-2 hover:theme-bg-tertiary rounded cursor-pointer" data-folder-id="${folder.id}">
                    <i class="fas fa-folder mr-2 text-blue-500"></i>
                    <span class="theme-text-primary">${this.escapeHtml(folder.name)}</span>
                </div>
            `;
        });
        return html;
    }
    
    closeFolderSelectModal() {
        if (this.folderSelectModal) {
            document.body.removeChild(this.folderSelectModal);
            this.folderSelectModal = null;
        }
    }
    
    async performBulkOperation(operation, targetFolderId) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: operation,
                    file_ids: Array.from(this.selectedFiles),
                    target_folder_id: targetFolderId
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log(`Bulk ${operation} completed:`, result);
                this.clearSelection();
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess(`Successfully ${operation}ed ${result.total_processed} files`);
            } else {
                throw new Error(`Bulk ${operation} failed`);
            }
        } catch (error) {
            console.error(`Bulk ${operation} error:`, error);
            this.showError(`Failed to ${operation} files: ${error.message}`);
        }
    }
    
    bindSearchEvents() {
        const searchInput = document.getElementById('searchInput');
        const searchResults = document.getElementById('searchResults');
        
        if (searchInput) {
            let searchTimeout;
            
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = e.target.value.trim();
                
                if (query.length === 0) {
                    this.hideSearchResults();
                    return;
                }
                
                searchTimeout = setTimeout(() => this.performSearch(query), 300);
            });
            
            searchInput.addEventListener('focus', () => {
                if (searchInput.value.trim().length > 0) {
                    searchResults?.classList.remove('hidden');
                }
            });
            
            searchInput.addEventListener('blur', () => {
                setTimeout(() => this.hideSearchResults(), 200);
            });
            
            document.addEventListener('click', (e) => {
                if (!searchInput.contains(e.target) && !searchResults?.contains(e.target)) {
                    this.hideSearchResults();
                }
            });
        }
    }
    
    bindUploadModalEvents() {
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        const backgroundUploadBtn = document.getElementById('backgroundUploadBtn');
        const uploadStatusBtn = document.getElementById('uploadStatusBtn');
        const cancelAllUploadsBtn = document.getElementById('cancelAllUploadsBtn');
        
        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => this.cancelAllUploads());
        }
        
        if (backgroundUploadBtn) {
            backgroundUploadBtn.addEventListener('click', () => this.enableBackgroundUpload());
        }
        
        if (uploadStatusBtn) {
            uploadStatusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleRecentFilesDropdown();
            });
        }
        
        if (cancelAllUploadsBtn) {
            cancelAllUploadsBtn.addEventListener('click', () => this.cancelAllUploads());
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            const dropdown = document.getElementById('recentFilesDropdown');
            if (dropdown && !dropdown.contains(e.target) && !uploadStatusBtn?.contains(e.target)) {
                dropdown.classList.add('hidden');
            }
        });
    }
    
     bindMediaViewerEvents() {
        const mediaViewer = document.getElementById('mediaViewer');
        const mediaClose = document.getElementById('mediaClose');
        const retryVideoBtn = document.getElementById('retryVideoBtn');
        
        if (mediaClose) {
            mediaClose.addEventListener('click', () => this.closeMediaViewer());
        }
        
        if (mediaViewer) {
            mediaViewer.addEventListener('click', (e) => {
                if (e.target === mediaViewer) this.closeMediaViewer();
            });
        }
        
        if (retryVideoBtn) {
            retryVideoBtn.addEventListener('click', () => {
                const currentFileId = mediaViewer?.dataset.currentFileId;
                if (currentFileId) {
                    const file = this.files.find(f => f.id === parseInt(currentFileId));
                    if (file) this.showVideoPlayer(file, parseInt(currentFileId));
                }
            });
        }
        
        // Escape key to close
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mediaViewer && !mediaViewer.classList.contains('hidden')) {
                this.closeMediaViewer();
            }
        });
    }
    
    bindFolderEvents() {
        const newFolderBtn = document.getElementById('newFolderBtn');
        const cancelFolderBtn = document.getElementById('cancelFolderBtn');
        const createFolderBtn = document.getElementById('createFolderBtn');
        const folderNameInput = document.getElementById('folderNameInput');
        
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => this.showNewFolderModal());
        }
        
        if (cancelFolderBtn) {
            cancelFolderBtn.addEventListener('click', () => this.hideNewFolderModal());
        }
        
        if (createFolderBtn) {
            createFolderBtn.addEventListener('click', () => this.createFolder());
        }
        
        if (folderNameInput) {
            folderNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.createFolder();
            });
        }
    }
    
    setupDragAndDrop() {
        const mainDropZone = document.getElementById('mainDropZone');
        const sidebar = document.getElementById('sidebar');
        
        [mainDropZone, sidebar].forEach(zone => {
            if (zone) {
                zone.addEventListener('dragover', (e) => {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                });
                
                zone.addEventListener('drop', (e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files.length > 0) {
                        this.handleFileUpload(e.dataTransfer.files);
                    }
                });
            }
        });
    }
    
    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mobileOverlay = document.getElementById('mobileOverlay');
        
        sidebar?.classList.remove('open');
        mobileOverlay?.classList.add('hidden');
    }
    
    setViewMode(mode) {
        this.viewMode = mode;
        const fileContainer = document.getElementById('fileContainer');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (fileContainer) {
            fileContainer.className = mode === 'grid' ? 'file-grid' : 'file-list';
            gridBtn?.classList.toggle('active', mode === 'grid');
            listBtn?.classList.toggle('active', mode === 'list');
        }
        
        this.renderContent();
    }
    
    // Multi-select functionality
    toggleFileSelection(fileId) {
        if (this.selectedFiles.has(fileId)) {
            this.selectedFiles.delete(fileId);
        } else {
            this.selectedFiles.add(fileId);
        }
        this.renderSelectionUI();
    }
    
    selectAllFiles() {
        this.files.forEach(f => this.selectedFiles.add(f.id));
        this.folders.forEach(f => this.selectedFiles.add(f.id));
        this.renderSelectionUI();
    }
    
    clearSelection() {
        this.selectedFiles.clear();
        this.renderSelectionUI();
    }
    
renderSelectionUI() {
    // Show checkmarks on selected files/folders
    document.querySelectorAll('.file-item, .folder-item').forEach(item => {
        const id = parseInt(item.dataset.fileId || item.dataset.folderId);
        const isSelected = this.selectedFiles.has(id);
        
        if (isSelected) {
            item.classList.add('selected');
            if (!item.querySelector('.selection-tick')) {
                const tick = document.createElement('div');
                tick.className = 'selection-tick';
                tick.innerHTML = '<i class="fas fa-check"></i>';
                item.appendChild(tick);
            }
        } else {
            item.classList.remove('selected');
            const tick = item.querySelector('.selection-tick');
            if (tick) tick.remove();
        }
    });
    
    // FIXED: Show/hide bulk action bar only when files are selected
    const bulkBar = document.getElementById('bulkActionBar');
    const selectedCount = document.getElementById('selectedCount');
    
    if (bulkBar && selectedCount) {
        if (this.selectedFiles.size > 0) {
            bulkBar.classList.remove('hidden');
            selectedCount.textContent = this.selectedFiles.size;
        } else {
            bulkBar.classList.add('hidden'); // Hide when no files selected
        }
    }
}

    
    async bulkDeleteFiles() {
        if (this.selectedFiles.size === 0) return;
        
        if (!confirm(`Delete ${this.selectedFiles.size} selected items?`)) return;
        
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    operation: 'delete',
                    file_ids: Array.from(this.selectedFiles)
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Bulk delete completed:', result);
                this.clearSelection();
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess(`Successfully deleted ${result.total_processed} files`);
            } else {
                throw new Error('Bulk delete failed');
            }
        } catch (error) {
            console.error('Bulk delete error:', error);
            this.showError('Failed to delete files: ' + error.message);
        }
    }
    
 // FIXED: Enhanced star functionality with better debugging
async toggleFileStar(fileId) {
    try {
        console.log('Toggling star for file ID:', fileId);
        
        // Validate fileId
        if (!fileId || isNaN(fileId)) {
            throw new Error('Invalid file ID');
        }
        
        const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/star`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('Star toggle response status:', response.status);
        
        if (response.ok) {
            const result = await response.json();
            console.log('Star toggle result:', result);
            
            // Update the file in current view immediately
            const file = this.files.find(f => f.id === fileId);
            if (file) {
                file.starred = result.starred;
                
                // Update all star buttons for this file
                document.querySelectorAll(`[data-file-id="${fileId}"].star-file-btn`).forEach(starBtn => {
                    starBtn.className = `star-file-btn ${result.starred ? 'text-yellow-400' : 'text-gray-400'} hover:text-yellow-500 p-1`;
                });
            }
            
            // Re-render if we're in starred view and file was unstarred
            if (this.currentView === 'starred' && !result.starred) {
                await this.loadStarredFiles();
            }
            
            this.showSuccess(result.message || `File ${result.starred ? 'starred' : 'unstarred'} successfully`);
        } else {
            const errorText = await response.text();
            console.error('Star toggle failed:', response.status, errorText);
            
            // Try to parse error details
            let errorMessage = errorText;
            try {
                const errorData = JSON.parse(errorText);
                errorMessage = errorData.detail || errorText;
            } catch (e) {
                // Use raw error text if not JSON
            }
            
            throw new Error(errorMessage);
        }
    } catch (error) {
        console.error('Error toggling star:', error);
        this.showError('Failed to toggle star: ' + error.message);
    }
}
        // Update the star button immediately
    
showEmptyStarredState() {
    const fileContainer = document.getElementById('fileContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (fileContainer && emptyState) {
        fileContainer.innerHTML = '';
        emptyState.innerHTML = `
            <i class="fas fa-star text-6xl theme-text-tertiary mb-4"></i>
            <h3 class="text-xl font-medium theme-text-secondary mb-2">No starred files</h3>
            <p class="theme-text-tertiary">Star files to see them here</p>
        `;
        emptyState.classList.remove('hidden');
    }
}
    // FIXED: Load starred files
  async loadStarredFiles() {
    this.showLoading();
    this.currentView = 'starred';
    
    try {
        console.log('Loading starred files...');
        
        const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/starred`);
        
        if (response.ok) {
            const starredFiles = await response.json();
            this.files = starredFiles;
            this.folders = []; // No folders in starred view
            console.log(`Loaded ${this.files.length} starred files`);
            this.renderContent();
            this.updateBreadcrumbStarred();
            
            if (this.files.length === 0) {
                this.showEmptyStarredState();
            }
        } else {
            const errorText = await response.text();
            console.error('Failed to load starred files:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('Error loading starred files:', error);
        this.showError('Failed to load starred files: ' + error.message);
        // Show empty state on error
        this.files = [];
        this.folders = [];
        this.renderContent();
    }
    
    this.hideLoading();
}
    
    showEmptyBinState() {
    const fileContainer = document.getElementById('fileContainer');
    const emptyState = document.getElementById('emptyState');
    
    if (fileContainer && emptyState) {
        fileContainer.innerHTML = '';
        emptyState.innerHTML = `
            <i class="fas fa-trash-alt text-6xl theme-text-tertiary mb-4"></i>
            <h3 class="text-xl font-medium theme-text-secondary mb-2">Bin is empty</h3>
            <p class="theme-text-tertiary">Deleted files will appear here</p>
        `;
        emptyState.classList.remove('hidden');
    }
}

   async loadBinFiles() {
    this.showLoading();
    this.currentView = 'bin';
    
    try {
        console.log('Loading bin files...');
        
        const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/bin`);
        
        if (response.ok) {
            const binFiles = await response.json();
            this.files = binFiles;
            this.folders = []; // No folders in bin view
            console.log(`Loaded ${this.files.length} files in bin`);
            this.renderContent();
            this.updateBreadcrumbBin();
            
            if (this.files.length === 0) {
                this.showEmptyBinState();
            }
        } else {
            const errorText = await response.text();
            console.error('Failed to load bin files:', errorText);
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }
    } catch (error) {
        console.error('Error loading bin files:', error);
        this.showError('Failed to load bin files: ' + error.message);
        // Show empty state on error
        this.files = [];
        this.folders = [];
        this.renderContent();
    }
    
    this.hideLoading();
}  
 
    
    updateBreadcrumbStarred() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `
                <button class="text-blue-500 hover:text-blue-700 text-sm" onclick="app.navigateToRoot()">Home</button>
                <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                <span class="theme-text-secondary text-sm font-semibold">Starred Files</span>
            `;
        }
    }
    
    updateBreadcrumbBin() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (breadcrumb) {
            breadcrumb.innerHTML = `
                <button class="text-blue-500 hover:text-blue-700 text-sm" onclick="app.navigateToRoot()">Home</button>
                <i class="fas fa-chevron-right text-gray-400 text-xs"></i>
                <span class="theme-text-secondary text-sm font-semibold">Bin</span>
            `;
        }
    }
    
    // NEW: Enhanced copy file functionality
    async copyFile(fileId, targetFolderId = null, newName = null) {
        try {
            console.log(`Copying file ${fileId} to folder ${targetFolderId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/copy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    folder_id: targetFolderId || this.currentFolderId,
                    name: newName 
                })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('File copied successfully:', result);
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess(`File copied successfully as "${result.name}"`);
                return result;
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Copy file error:', error);
            this.showError('Failed to copy file: ' + error.message);
        }
    }
    
    // NEW: Enhanced rename file functionality
    async renameFilePrompt(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) return;
        
        const newName = prompt('Enter new name:', file.name);
        if (!newName || newName === file.name) return;
        
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/rename`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: newName })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('File renamed successfully:', result);
                await this.loadContent();
                this.showSuccess(`File renamed from "${result.old_name}" to "${result.new_name}"`);
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Rename error:', error);
            this.showError('Failed to rename file: ' + error.message);
        }
    }
    
    // NEW: File versioning
    async showFileVersions(fileId) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/versions`);
            
            if (response.ok) {
                const versions = await response.json();
                this.showVersionModal(fileId, versions);
            } else {
                throw new Error('Failed to load file versions');
            }
        } catch (error) {
            console.error('Error loading file versions:', error);
            this.showError('Failed to load file versions: ' + error.message);
        }
    }
    
    showVersionModal(fileId, versions) {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4';
        modal.innerHTML = `
            <div class="theme-bg-secondary rounded-xl p-6 w-full max-w-md theme-border border">
                <h3 class="text-lg font-semibold mb-4 theme-text-primary">File Versions</h3>
                <div class="version-list max-h-64 overflow-y-auto mb-4">
                    ${versions.length === 0 ? 
                        '<p class="theme-text-secondary">No previous versions available</p>' :
                        versions.map(version => `
                            <div class="version-item p-2 theme-border border-b flex justify-between items-center">
                                <div>
                                    <div class="font-medium theme-text-primary">${this.escapeHtml(version.name)}</div>
                                    <div class="text-sm theme-text-secondary">Version ${version.version_number} • ${this.formatDate(version.renamed_at)}</div>
                                </div>
                                <button class="restore-version-btn px-2 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600" data-version="${version.version_number}">
                                    Restore
                                </button>
                            </div>
                        `).join('')
                    }
                </div>
                <div class="flex justify-end">
                    <button class="close-versions-btn px-4 py-2 theme-text-secondary hover:theme-bg-tertiary rounded-lg transition-colors">Close</button>
                </div>
            </div>
        `;
        
        document.body.appendChild(modal);
        
        // Bind restore buttons
        modal.querySelectorAll('.restore-version-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                const versionNumber = parseInt(btn.dataset.version);
                await this.restoreFileVersion(fileId, versionNumber);
                document.body.removeChild(modal);
            });
        });
        
        // Bind close button
        modal.querySelector('.close-versions-btn').addEventListener('click', () => {
            document.body.removeChild(modal);
        });
        
        // Close on outside click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                document.body.removeChild(modal);
            }
        });
    }
    
    async restoreFileVersion(fileId, versionNumber) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/restore-version`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ version_number: versionNumber })
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('File version restored:', result);
                await this.loadContent();
                this.showSuccess(`File restored to version ${versionNumber}`);
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Restore version error:', error);
            this.showError('Failed to restore file version: ' + error.message);
        }
    }
    
    // Storage Management
    async updateStorageInfo() {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/storage/info`);
            
            if (response.ok) {
                const data = await response.json();
                this.totalStorageUsed = data.totalSize;
                this.totalFileCount = data.totalFiles;
            } else {
                await this.calculateStorageFromFiles();
            }
            
            this.renderStorageInfo();
            
        } catch (error) {
            console.error('Error updating storage info:', error);
            await this.calculateStorageFromFiles();
            this.renderStorageInfo();
        }
    }
    
    async calculateStorageFromFiles() {
        try {
            const allFilesResponse = await this.makeAuthenticatedRequest(`${this.apiBase}/files/all`);
            
            if (allFilesResponse.ok) {
                const allFiles = await allFilesResponse.json();
                this.totalStorageUsed = allFiles.reduce((total, file) => total + (file.size || 0), 0);
                this.totalFileCount = allFiles.length;
            } else {
                this.totalStorageUsed = this.files.reduce((total, file) => total + (file.size || 0), 0);
                this.totalFileCount = this.files.length;
            }
        } catch (error) {
            console.error('Error calculating storage:', error);
            this.totalStorageUsed = this.files.reduce((total, file) => total + (file.size || 0), 0);
            this.totalFileCount = this.files.length;
        }
    }
    
    renderStorageInfo() {
        const storageUsedElement = document.getElementById('storageUsed');
        const fileCountElement = document.getElementById('fileCount');
        const storageBar = document.getElementById('storageBar');
        
        if (storageUsedElement) {
            storageUsedElement.textContent = this.formatFileSize(this.totalStorageUsed);
        }
        
        if (fileCountElement) {
            fileCountElement.textContent = `${this.totalFileCount} file${this.totalFileCount !== 1 ? 's' : ''}`;
        }
        
        if (storageBar) {
            const percentage = Math.min((this.totalStorageUsed / (10 * 1024 * 1024 * 1024)) * 100, 85);
            storageBar.style.width = `${percentage}%`;
        }
    }
    
    // File Upload with Real-time Progress
    async handleFileUpload(files) {
        if (files.length === 0) return;
        
        console.log(`Starting upload of ${files.length} files`);
        
        for (let file of files) {
            const uploadId = Date.now() + Math.random();
            this.uploadQueue.push({
                file: file,
                folderId: this.currentFolderId,
                id: uploadId
            });
        }
        
        this.showUploadModal();
        this.updateUploadStatusIndicator();
        
        if (!this.isUploading) {
            this.processUploadQueue();
        }
    }
    
    async processUploadQueue() {
        if (this.uploadQueue.length === 0) {
            this.isUploading = false;
            this.updateUploadStatusIndicator();
            
            if (!this.backgroundUploads) {
                setTimeout(() => {
                    if (this.uploadQueue.length === 0) {
                        this.hideUploadModal();
                    }
                }, 3000);
            }
            
            await this.loadContent();
            await this.updateStorageInfo();
            return;
        }
        
        this.isUploading = true;
        const uploadItem = this.uploadQueue.shift();
        
        try {
            await this.uploadFile(uploadItem);
        } catch (error) {
            console.error('Upload failed:', error);
        }
        
        setTimeout(() => this.processUploadQueue(), 100);
    }
    
    async uploadFile(uploadItem) {
        const { file, folderId, id } = uploadItem;
        console.log(`Uploading: ${file.name} (${this.formatFileSize(file.size)})`);
        
        const progressItem = this.addUploadProgressItem(file.name, file.size, id);
        this.activeUploads.set(id, { file, progressItem, cancelled: false });
        
        return new Promise((resolve, reject) => {
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder_id', String(folderId));
            formData.append('upload_id', String(id));
            
            const xhr = new XMLHttpRequest();
            let startTime = Date.now();
            let lastUpdateTime = startTime;
            let lastLoaded = 0;
            let speedSamples = [];
            
            // Real-time progress tracking
            xhr.upload.addEventListener('progress', (e) => {
                if (e.lengthComputable) {
                    const upload = this.activeUploads.get(id);
                    if (!upload || upload.cancelled) {
                        xhr.abort();
                        return;
                    }
                    
                    const currentTime = Date.now();
                    const timeSinceLastUpdate = currentTime - lastUpdateTime;
                    
                    // Update every 100ms for smooth progress
                    if (timeSinceLastUpdate >= 100 || e.loaded === e.total) {
                        const timeDiff = (currentTime - lastUpdateTime) / 1000;
                        const bytesDiff = e.loaded - lastLoaded;
                        
                        // Calculate speed
                        let currentSpeed = 0;
                        if (timeDiff > 0 && bytesDiff > 0) {
                            currentSpeed = bytesDiff / timeDiff;
                            speedSamples.push(currentSpeed);
                            if (speedSamples.length > 5) speedSamples.shift();
                        }
                        
                        const averageSpeed = speedSamples.length > 0 
                            ? speedSamples.reduce((a, b) => a + b, 0) / speedSamples.length 
                            : 0;
                        
                        const actualProgress = (e.loaded / e.total) * 100;
                        
                        this.updateUploadProgress(
                            progressItem, 
                            actualProgress, 
                            e.loaded, 
                            e.total, 
                            averageSpeed, 
                            'uploading'
                        );
                        
                        lastUpdateTime = currentTime;
                        lastLoaded = e.loaded;
                    }
                }
            });
            
            xhr.upload.addEventListener('loadstart', () => {
                this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'starting');
            });
            
            xhr.addEventListener('load', () => {
                if (xhr.status === 200) {
                    try {
                        this.updateUploadProgress(progressItem, 100, file.size, file.size, 0, 'completed');
                        
                        const result = JSON.parse(xhr.responseText);
                        console.log('Upload successful:', result.name);
                        
                        this.totalStorageUsed += file.size;
                        this.totalFileCount += 1;
                        this.renderStorageInfo();
                        
                        this.activeUploads.delete(id);
                        this.updateUploadStatusIndicator();
                        
                        resolve(result);
                    } catch (error) {
                        console.error('Error parsing response:', error);
                        this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'failed');
                        this.activeUploads.delete(id);
                        reject(error);
                    }
                } else {
                    console.error('Upload failed:', xhr.status);
                    this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'failed');
                    this.activeUploads.delete(id);
                    reject(new Error(`Upload failed: ${xhr.status}`));
                }
            });
            
            xhr.addEventListener('error', () => {
                console.error('Upload error');
                this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'failed');
                this.activeUploads.delete(id);
                reject(new Error('Network error'));
            });
            
            xhr.addEventListener('abort', () => {
                console.log('Upload cancelled');
                this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'cancelled');
                this.activeUploads.delete(id);
                reject(new Error('Upload cancelled'));
            });
            
            progressItem.xhr = xhr;
            
            xhr.timeout = 600000; // 10 minutes
            xhr.open('POST', `${this.apiBase}/upload`);
            xhr.setRequestHeader('Authorization', `Bearer ${this.authToken}`);
            xhr.send(formData);
        });
    }
    
    addUploadProgressItem(filename, fileSize, id) {
        const progressContainer = document.getElementById('uploadProgress');
        if (!progressContainer) return null;
        
        const item = document.createElement('div');
        item.className = 'upload-progress-item';
        item.dataset.uploadId = id;
        
        item.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center flex-1 min-w-0">
                    <i class="fas fa-file-upload text-blue-500 mr-3"></i>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium theme-text-primary truncate" title="${this.escapeHtml(filename)}">${this.escapeHtml(filename)}</div>
                        <div class="text-sm theme-text-secondary">
                            <span class="upload-status">Preparing...</span>
                            <span class="upload-speed ml-2 text-sm font-bold text-green-600" style="display: none;"></span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="text-sm font-medium theme-text-primary">
                        <span class="upload-progress-text">0%</span>
                    </div>
                    <button class="cancel-upload-btn text-red-500 hover:text-red-700 p-1 rounded" data-upload-id="${id}">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="progress-bar mb-2">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="flex justify-between text-xs theme-text-secondary">
                <span class="upload-data">0 / ${this.formatFileSize(fileSize)}</span>
                <span class="upload-eta text-xs text-blue-600 font-medium" style="display: none;"></span>
            </div>
        `;
        
        progressContainer.appendChild(item);
        
        const cancelBtn = item.querySelector('.cancel-upload-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => this.cancelSingleUpload(id));
        }
        
        return { element: item, id: id, xhr: null };
    }
    
    updateUploadProgress(progressItem, percentage, loaded, total, speed, status) {
        if (!progressItem?.element) return;
        
        const element = progressItem.element;
        const progressFill = element.querySelector('.progress-fill');
        const progressText = element.querySelector('.upload-progress-text');
        const statusText = element.querySelector('.upload-status');
        const dataText = element.querySelector('.upload-data');
        const speedText = element.querySelector('.upload-speed');
        const etaText = element.querySelector('.upload-eta');
        const cancelBtn = element.querySelector('.cancel-upload-btn');
        
        const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
        
        // Update progress bar
        if (progressFill) {
            progressFill.style.width = `${clampedPercentage}%`;
            progressFill.style.transition = 'width 0.1s linear';
            
            // Color progression
            if (clampedPercentage < 25) {
                progressFill.style.background = 'linear-gradient(90deg, #3b82f6, #1d4ed8)';
            } else if (clampedPercentage < 50) {
                progressFill.style.background = 'linear-gradient(90deg, #8b5cf6, #7c3aed)';
            } else if (clampedPercentage < 75) {
                progressFill.style.background = 'linear-gradient(90deg, #06b6d4, #0891b2)';
            } else {
                progressFill.style.background = 'linear-gradient(90deg, #10b981, #059669)';
            }
        }
        
        // Update percentage
        if (progressText) {
            progressText.textContent = `${Math.round(clampedPercentage)}%`;
        }
        
        // Update status
        if (statusText) {
            const statusMap = {
                'starting': 'Starting...',
                'uploading': clampedPercentage < 5 ? 'Connecting...' : 'Uploading...',
                'completed': '✅ Completed',
                'failed': '❌ Failed',
                'cancelled': '🚫 Cancelled'
            };
            statusText.textContent = statusMap[status] || 'Preparing...';
            
            if (['completed', 'failed', 'cancelled'].includes(status) && cancelBtn) {
                cancelBtn.style.display = 'none';
            }
        }
        
        // Show speed
        if (speedText && speed > 1024 && status === 'uploading' && clampedPercentage > 1 && clampedPercentage < 99) {
            speedText.textContent = `🚀 ${this.formatFileSize(speed)}/s`;
            speedText.style.display = 'inline';
        } else if (speedText) {
            speedText.style.display = 'none';
        }
        
        // Update data transferred
        if (dataText) {
            dataText.textContent = `${this.formatFileSize(loaded)} / ${this.formatFileSize(total)}`;
        }
        
        // Show ETA
        if (etaText && speed > 1024 && status === 'uploading' && clampedPercentage > 5 && clampedPercentage < 95) {
            const remainingBytes = total - loaded;
            const eta = remainingBytes / speed;
            
            if (eta > 1 && eta < 3600) {
                etaText.textContent = `⏱️ ${this.formatTime(eta)} remaining`;
                etaText.style.display = 'inline';
            } else {
                etaText.style.display = 'none';
            }
        } else if (etaText) {
            etaText.style.display = 'none';
        }
    }
    
    formatTime(seconds) {
        if (seconds < 60) {
            return `${Math.round(seconds)}s`;
        } else if (seconds < 3600) {
            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.round(seconds % 60);
            return `${minutes}m ${remainingSeconds}s`;
        } else {
            const hours = Math.floor(seconds / 3600);
            const minutes = Math.floor((seconds % 3600) / 60);
            return `${hours}h ${minutes}m`;
        }
    }
    
    cancelSingleUpload(uploadId) {
        console.log('Cancelling upload:', uploadId);
        
        const upload = this.activeUploads.get(uploadId);
        if (upload) {
            upload.cancelled = true;
            if (upload.progressItem?.xhr) {
                upload.progressItem.xhr.abort();
            }
            this.updateUploadProgress(upload.progressItem, 0, 0, upload.file.size, 0, 'cancelled');
        }
        
        this.uploadQueue = this.uploadQueue.filter(item => item.id !== uploadId);
        this.activeUploads.delete(uploadId);
        this.updateUploadStatusIndicator();
        
        if (this.uploadQueue.length === 0 && this.activeUploads.size === 0) {
            this.hideUploadModal();
            this.isUploading = false;
        }
    }
    
    cancelAllUploads() {
        console.log('Cancelling all uploads...');
        
        this.activeUploads.forEach((upload, id) => {
            this.cancelSingleUpload(id);
        });
        
        this.uploadQueue = [];
        this.isUploading = false;
        this.hideUploadModal();
    }
    
    enableBackgroundUpload() {
        this.backgroundUploads = true;
        this.hideUploadModal();
    }
    
    updateUploadStatusIndicator() {
        const uploadStatusBtn = document.getElementById('uploadStatusBtn');
        const activeUploadsContainer = document.getElementById('activeUploadsContainer');
        
        if (uploadStatusBtn) {
            const totalUploads = this.activeUploads.size + this.uploadQueue.length;
            if (totalUploads > 0) {
                uploadStatusBtn.classList.add('active');
                uploadStatusBtn.title = `${totalUploads} uploads in progress`;
            } else {
                uploadStatusBtn.classList.remove('active');
                uploadStatusBtn.title = 'Upload Status & Recent Files';
            }
        }
        
        if (activeUploadsContainer) {
            if (this.activeUploads.size === 0 && this.uploadQueue.length === 0) {
                activeUploadsContainer.innerHTML = '<p class="text-sm theme-text-secondary">No active uploads</p>';
            } else {
                let html = '';
                this.activeUploads.forEach((upload) => {
                    html += `
                        <div class="flex items-center justify-between py-1">
                            <span class="text-sm truncate">${this.escapeHtml(upload.file.name)}</span>
                            <span class="text-xs text-blue-500">Uploading...</span>
                        </div>
                    `;
                });
                
                this.uploadQueue.forEach(item => {
                    html += `
                        <div class="flex items-center justify-between py-1">
                            <span class="text-sm truncate">${this.escapeHtml(item.file.name)}</span>
                            <span class="text-xs text-gray-500">Queued</span>
                        </div>
                    `;
                });
                
                activeUploadsContainer.innerHTML = html;
            }
        }
    }
    
    // Recent Files and Dropdown
    toggleRecentFilesDropdown() {
        const dropdown = document.getElementById('recentFilesDropdown');
        if (dropdown) {
            dropdown.classList.toggle('hidden');
            if (!dropdown.classList.contains('hidden')) {
                this.loadRecentFiles();
            }
        }
    }
    
    async loadRecentFiles() {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/recent`);
            const recentFilesContainer = document.getElementById('recentFilesContainer');
            
            if (response.ok && recentFilesContainer) {
                const recentFiles = await response.json();
                
                if (recentFiles.length === 0) {
                    recentFilesContainer.innerHTML = '<p class="text-sm theme-text-secondary">No recent files</p>';
                } else {
                    let html = '';
                    recentFiles.forEach(file => {
                        const timeAgo = this.getTimeAgo(file.created_at);
                        html += `
                            <div class="flex items-center justify-between py-2 border-b theme-border last:border-b-0">
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium truncate theme-text-primary">${this.escapeHtml(file.name)}</div>
                                    <div class="text-xs theme-text-tertiary">${this.formatFileSize(file.size)} • ${timeAgo}</div>
                                </div>
                                <button onclick="app.downloadFile(${file.id})" class="text-blue-500 hover:text-blue-700 p-1">
                                    <i class="fas fa-download text-sm"></i>
                                </button>
                            </div>
                        `;
                    });
                    recentFilesContainer.innerHTML = html;
                }
            }
        } catch (error) {
            console.error('Error loading recent files:', error);
        }
    }
    
    startRecentFilesPolling() {
        setInterval(() => {
            const dropdown = document.getElementById('recentFilesDropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                this.loadRecentFiles();
            }
        }, 30000);
    }
    
    getTimeAgo(dateString) {
        try {
            const date = new Date(dateString);
            const now = new Date();
            const diffMs = now - date;
            const diffMins = Math.floor(diffMs / 60000);
            
            if (diffMins < 1) return 'Just now';
            if (diffMins < 60) return `${diffMins}m ago`;
            
            const diffHours = Math.floor(diffMins / 60);
            if (diffHours < 24) return `${diffHours}h ago`;
            
            const diffDays = Math.floor(diffHours / 24);
            return `${diffDays}d ago`;
        } catch (error) {
            return 'Unknown';
        }
    }
    
    // Search Functionality
    async performSearch(query) {
        try {
            console.log('Searching for:', query);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/search?query=${encodeURIComponent(query)}`);
            
            if (response.ok) {
                const results = await response.json();
                this.displaySearchResults(results, query);
            } else {
                console.error('Search failed:', response.status);
                this.hideSearchResults();
            }
        } catch (error) {
            console.error('Search error:', error);
            this.hideSearchResults();
        }
    }
    
    displaySearchResults(results, query) {
        const searchResults = document.getElementById('searchResults');
        const searchResultsContent = document.getElementById('searchResultsContent');
        
        if (!searchResults || !searchResultsContent) return;
        
        if (results.length === 0) {
            searchResultsContent.innerHTML = `
                <div class="text-center py-4">
                    <i class="fas fa-search theme-text-tertiary text-2xl mb-2"></i>
                    <p class="theme-text-secondary text-sm">No files found for "${this.escapeHtml(query)}"</p>
                </div>
            `;
        } else {
            let html = '';
            results.forEach(file => {
                const icon = this.getFileIcon(file.mime_type);
                const highlightedName = this.highlightSearchTerm(file.name, query);
                const isMedia = this.isMediaFile(file.mime_type);
                
                html += `
                    <div class="search-result-item" data-file-id="${file.id}" data-is-media="${isMedia}">
                        <div class="flex items-center space-x-3">
                            <div class="w-8 h-8 theme-bg-tertiary rounded-lg flex items-center justify-center">
                                <i class="${icon} text-sm"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="font-medium theme-text-primary truncate">${highlightedName}</div>
                                <div class="text-xs theme-text-secondary">
                                    ${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}
                                    ${file.folder_id !== 0 ? ' • In folder' : ''}
                                </div>
                            </div>
                            <div class="flex items-center space-x-1">
                                <button class="search-download-btn text-blue-500 hover:text-blue-700 p-1 rounded" data-file-id="${file.id}" title="Download">
                                    <i class="fas fa-download text-sm"></i>
                                </button>
                                ${isMedia ? `<button class="search-preview-btn text-green-500 hover:text-green-700 p-1 rounded" data-file-id="${file.id}" title="Preview">
                                    <i class="fas fa-eye text-sm"></i>
                                </button>` : ''}
                            </div>
                        </div>
                    </div>
                `;
            });
            searchResultsContent.innerHTML = html;
            this.bindSearchResultEvents();
        }
        
        searchResults.classList.remove('hidden');
    }
    
    bindSearchResultEvents() {
        document.querySelectorAll('.search-download-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = parseInt(e.currentTarget.dataset.fileId);
                this.downloadFile(fileId);
                this.hideSearchResults();
            });
        });
        
        document.querySelectorAll('.search-preview-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = parseInt(e.currentTarget.dataset.fileId);
                this.previewMediaFile(fileId);
                this.hideSearchResults();
            });
        });
        
        document.querySelectorAll('.search-result-item').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                
                const fileId = parseInt(item.dataset.fileId);
                const isMedia = item.dataset.isMedia === 'true';
                
                if (isMedia) {
                    this.previewMediaFile(fileId);
                } else {
                    this.downloadFile(fileId);
                }
                this.hideSearchResults();
            });
        });
    }
    
    highlightSearchTerm(text, searchTerm) {
        if (!searchTerm) return this.escapeHtml(text);
        
        const escapedText = this.escapeHtml(text);
        const escapedSearchTerm = this.escapeHtml(searchTerm);
        const regex = new RegExp(`(${escapedSearchTerm})`, 'gi');
        
        return escapedText.replace(regex, '<span class="search-highlight">$1</span>');
    }
    
    hideSearchResults() {
        const searchResults = document.getElementById('searchResults');
        if (searchResults) {
            searchResults.classList.add('hidden');
        }
    }
    
    // Content Loading and Rendering
   async loadContent() {
    this.showLoading();
    this.currentView = 'home';
    
    // FIXED: Clear selection when loading new content
    this.clearSelection();
    
    try {
        console.log(`Loading content for folder ${this.currentFolderId}`);
        
        const [filesResponse, foldersResponse] = await Promise.all([
            this.makeAuthenticatedRequest(`${this.apiBase}/files?folder_id=${this.currentFolderId}`),
            this.makeAuthenticatedRequest(`${this.apiBase}/folders?parent_id=${this.currentFolderId}`)
        ]);
        
        if (!filesResponse.ok || !foldersResponse.ok) {
            throw new Error(`Failed to fetch data: ${filesResponse.status}, ${foldersResponse.status}`);
        }
        
        this.files = await filesResponse.json();
        this.folders = await foldersResponse.json();
        
        console.log(`Loaded ${this.files.length} files and ${this.folders.length} folders`);
        
        this.renderContent();
        this.updateBreadcrumb();
        
    } catch (error) {
        console.error('Error loading content:', error);
        this.showError('Failed to load content: ' + error.message);
    }
    
    this.hideLoading();
}
    renderContent() {
        const fileContainer = document.getElementById('fileContainer');
        const emptyState = document.getElementById('emptyState');
        
        if (!fileContainer || !emptyState) return;
        
        // Clear selection when rendering new content
        this.clearSelection();
        
        if (this.files.length === 0 && this.folders.length === 0) {
            fileContainer.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        let html = '';
        
        // Render folders first
        this.folders.forEach(folder => {
            html += this.viewMode === 'grid' ? this.renderFolderItem(folder) : this.renderFolderListItem(folder);
        });
        
        // Then render files
        this.files.forEach(file => {
            html += this.viewMode === 'grid' ? this.renderFileItem(file) : this.renderFileListItem(file);
        });
        
        fileContainer.innerHTML = html;
        this.bindItemEvents();
    }
    
    renderFolderItem(folder) {
        return `
            <div class="folder-item theme-bg-secondary rounded-xl theme-border border p-4 hover:shadow-lg transition-all cursor-pointer" 
                 data-folder-id="${folder.id}">
                <div class="flex items-center mb-3">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                        <i class="fas fa-folder text-blue-500 text-xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold theme-text-primary truncate">${this.escapeHtml(folder.name)}</h3>
                        <p class="text-sm theme-text-secondary">${this.formatDate(folder.created_at)}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs theme-text-tertiary">Folder</span>
                    <button class="delete-folder-btn text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors" data-folder-id="${folder.id}" title="Delete folder">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderFolderListItem(folder) {
        return `
            <div class="folder-item file-list-item cursor-pointer" data-folder-id="${folder.id}">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                    <i class="fas fa-folder text-blue-500"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-medium theme-text-primary truncate">${this.escapeHtml(folder.name)}</h3>
                    <p class="text-sm theme-text-secondary">Folder • ${this.formatDate(folder.created_at)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="delete-folder-btn text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors" data-folder-id="${folder.id}" title="Delete folder">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
   // FIXED: Ensure file IDs are properly handled in rendering
renderFileItem(file) {
    const icon = this.getFileIcon(file.mime_type);
    const isMedia = this.isMediaFile(file.mime_type);
    const starredClass = file.starred ? 'text-yellow-400' : 'text-gray-400';
    const fileId = file.id; // Ensure we have the file ID
    
    // Debug log
    console.log('Rendering file:', file.name, 'ID:', fileId, 'Starred:', file.starred);
    
    return `
        <div class="file-item theme-bg-secondary rounded-xl theme-border border p-4 hover:shadow-lg transition-all ${isMedia ? 'cursor-pointer' : ''}" 
             data-file-id="${fileId}" 
             ${isMedia ? 'data-media="true"' : ''}
             draggable="true">
            <div class="flex items-center mb-3">
                <div class="w-12 h-12 theme-bg-tertiary rounded-lg flex items-center justify-center mr-4">
                    <i class="${icon} text-xl"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-semibold theme-text-primary truncate" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</h3>
                    <p class="text-sm theme-text-secondary">${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}</p>
                </div>
                <div class="flex items-center space-x-1">
                    <button class="star-file-btn ${starredClass} hover:text-yellow-500 p-1" title="Star/Unstar file" data-file-id="${fileId}">
                        <i class="fas fa-star text-sm"></i>
                    </button>
                    <div class="relative">
                        <button class="file-menu-btn text-gray-500 hover:text-gray-700 p-1" title="More options" data-file-id="${fileId}">
                            <i class="fas fa-ellipsis-v text-sm"></i>
                        </button>
                        <div class="file-menu">
                            <button class="file-menu-copy" data-file-id="${fileId}">
                                <i class="fas fa-copy mr-2"></i>Copy
                            </button>
                            <button class="file-menu-move" data-file-id="${fileId}">
                                <i class="fas fa-arrows-alt mr-2"></i>Move
                            </button>
                            <button class="file-menu-rename" data-file-id="${fileId}">
                                <i class="fas fa-edit mr-2"></i>Rename
                            </button>
                            <button class="file-menu-versions" data-file-id="${fileId}">
                                <i class="fas fa-history mr-2"></i>Versions
                            </button>
                            <button class="file-menu-select" data-file-id="${fileId}">
                                <i class="fas fa-check-square mr-2"></i>Select
                            </button>
                            <button class="file-menu-delete text-red-600" data-file-id="${fileId}">
                                <i class="fas fa-trash mr-2"></i>Delete
                            </button>
                        </div>
                    </div>
                </div>
            </div>
            <div class="flex justify-between items-center">
                <button class="download-btn text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition-colors" data-file-id="${fileId}" title="Download file">
                    <i class="fas fa-download text-sm"></i>
                </button>
                ${this.currentView === 'bin' ? `
                    <button class="restore-file-btn text-green-500 hover:text-green-700 p-2 rounded-lg hover:bg-green-50 transition-colors" data-file-id="${fileId}" title="Restore file">
                        <i class="fas fa-undo text-sm"></i>
                    </button>
                ` : ''}
            </div>
        </div>
    `;
}

    
    renderFileListItem(file) {
        const icon = this.getFileIcon(file.mime_type);
        const isMedia = this.isMediaFile(file.mime_type);
        const starredClass = file.starred ? 'text-yellow-400' : 'text-gray-400';
        
        return `
            <div class="file-item file-list-item ${isMedia ? 'cursor-pointer' : ''}" 
                 data-file-id="${file.id}" 
                 ${isMedia ? 'data-media="true"' : ''}
                 draggable="true">
                <div class="w-10 h-10 theme-bg-tertiary rounded-lg flex items-center justify-center mr-4">
                    <i class="${icon}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-medium theme-text-primary truncate" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</h3>
                    <p class="text-sm theme-text-secondary">${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="star-file-btn ${starredClass} hover:text-yellow-500 p-1" title="Star/Unstar file" data-file-id="${file.id}">
                        <i class="fas fa-star text-sm"></i>
                    </button>
                    <div class="relative">
                        <button class="file-menu-btn text-gray-500 hover:text-gray-700 p-1" title="More options" data-file-id="${file.id}">
                            <i class="fas fa-ellipsis-v text-sm"></i>
                        </button>
                        <div class="file-menu">
                            <button class="file-menu-copy" data-file-id="${file.id}">
                                <i class="fas fa-copy mr-2"></i>Copy
                            </button>
                            <button class="file-menu-move" data-file-id="${file.id}">
                                <i class="fas fa-arrows-alt mr-2"></i>Move
                            </button>
                            <button class="file-menu-rename" data-file-id="${file.id}">
                                <i class="fas fa-edit mr-2"></i>Rename
                            </button>
                            <button class="file-menu-versions" data-file-id="${file.id}">
                                <i class="fas fa-history mr-2"></i>Versions
                            </button>
                            <button class="file-menu-select" data-file-id="${file.id}">
                                <i class="fas fa-check-square mr-2"></i>Select
                            </button>
                            <button class="file-menu-delete text-red-600" data-file-id="${file.id}">
                                <i class="fas fa-trash mr-2"></i>Delete
                            </button>
                        </div>
                    </div>
                    <button class="download-btn text-blue-500 hover:text-blue-700 p-2 rounded hover:bg-blue-50 transition-colors" data-file-id="${file.id}" title="Download file">
                        <i class="fas fa-download text-sm"></i>
                    </button>
                    ${this.currentView === 'bin' ? `
                        <button class="restore-file-btn text-green-500 hover:text-green-700 p-2 rounded hover:bg-green-50 transition-colors" data-file-id="${file.id}" title="Restore file">
                            <i class="fas fa-undo text-sm"></i>
                        </button>
                    ` : ''}
                </div>
            </div>
        `;
    }
    
    isMediaFile(mimeType) {
        if (!mimeType) return false;
        return mimeType.startsWith('image/') || mimeType.startsWith('video/');
    }
    
    bindItemEvents() {
    // Download buttons
    document.querySelectorAll('.download-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const fileId = parseInt(e.currentTarget.dataset.fileId);
            this.downloadFile(fileId);
        });
    });
    
    // FIXED: Star buttons with better event handling
    document.querySelectorAll('.star-file-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            console.log('Star button clicked for file:', fileId);
            this.toggleFileStar(fileId);
        });
    });
    
    // FIXED: File menu buttons with better event handling
    document.querySelectorAll('.file-menu-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const menu = btn.nextElementSibling;
            if (!menu) return;
            
            // Hide other menus first
            document.querySelectorAll('.file-menu.show').forEach(m => {
                if (m !== menu) m.classList.remove('show');
            });
            
            // Toggle current menu
            menu.classList.toggle('show');
            console.log('File menu toggled for file:', btn.dataset.fileId);
        });
    });
    
    // FIXED: File menu actions with better event handling
    document.querySelectorAll('.file-menu-copy').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.selectedFiles.clear();
            this.selectedFiles.add(fileId);
            this.showFolderSelectModal('copy');
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    
    document.querySelectorAll('.file-menu-move').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.selectedFiles.clear();
            this.selectedFiles.add(fileId);
            this.showFolderSelectModal('move');
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    
    document.querySelectorAll('.file-menu-rename').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.renameFilePrompt(fileId);
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    
    document.querySelectorAll('.file-menu-versions').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.showFileVersions(fileId);
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    
    document.querySelectorAll('.file-menu-select').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.toggleFileSelection(fileId);
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    
    document.querySelectorAll('.file-menu-delete').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const fileId = parseInt(btn.dataset.fileId);
            this.deleteFile(fileId);
            btn.closest('.file-menu').classList.remove('show');
        });
    });
    

        // Delete file buttons
        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = parseInt(e.currentTarget.dataset.fileId);
                this.deleteFile(fileId);
            });
        });
        
        // Restore file buttons (for bin view)
        document.querySelectorAll('.restore-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = parseInt(e.currentTarget.dataset.fileId);
                this.restoreFile(fileId);
            });
        });
        
        // Delete folder buttons
        document.querySelectorAll('.delete-folder-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const folderId = parseInt(e.currentTarget.dataset.folderId);
                this.deleteFolder(folderId);
            });
        });
        
        // Folder navigation
        document.querySelectorAll('.folder-item').forEach(item => {
            item.addEventListener('dblclick', (e) => {
                const folderId = parseInt(e.currentTarget.dataset.folderId);
                this.navigateToFolder(folderId);
            });
            
            // Drag and drop for folders
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                item.classList.add('bg-blue-50');
            });
            
            item.addEventListener('dragleave', (e) => {
                e.preventDefault();
                item.classList.remove('bg-blue-50');
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                item.classList.remove('bg-blue-50');
                
                const folderId = parseInt(item.dataset.folderId);
                
                if (e.dataTransfer.files.length > 0) {
                    // Upload files to this folder
                    const originalFolderId = this.currentFolderId;
                    this.currentFolderId = folderId;
                    this.handleFileUpload(e.dataTransfer.files);
                    this.currentFolderId = originalFolderId;
                } else if (this.draggedFile) {
                    // Move file to this folder
                    this.moveFileToFolder(this.draggedFile.id, folderId);
                    this.draggedFile = null;
                }
            });
        });
        
        // File drag and drop
        document.querySelectorAll('.file-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const fileId = parseInt(item.dataset.fileId);
                const file = this.files.find(f => f.id === fileId);
                if (file) {
                    this.draggedFile = file;
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', fileId);
                    item.style.opacity = '0.5';
                }
            });
            
            item.addEventListener('dragend', (e) => {
                this.draggedFile = null;
                item.style.opacity = '1';
            });
        });
        
        // Media file preview
        document.querySelectorAll('.file-item[data-media="true"]').forEach(item => {
            item.addEventListener('click', (e) => {
                if (e.target.closest('button')) return;
                
                const fileId = parseInt(item.dataset.fileId);
                this.previewMediaFile(fileId);
            });
        });
    }
    
    // Restore file from bin
    async restoreFile(fileId) {
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/restore`, {
                method: 'POST'
            });
            
            if (response.ok) {
                console.log('File restored successfully');
                await this.loadBinFiles(); // Refresh bin view
                await this.updateStorageInfo();
                this.showSuccess('File restored successfully');
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Restore error:', error);
            this.showError('Failed to restore file: ' + error.message);
        }
    }
    
    // File Operations
    async moveFileToFolder(fileId, targetFolderId) {
        try {
            console.log(`Moving file ${fileId} to folder ${targetFolderId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/move`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ folder_id: targetFolderId })
            });
            
            if (response.ok) {
                console.log('File moved successfully');
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess('File moved successfully');
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Move file error:', error);
            this.showError('Failed to move file: ' + error.message);
        }
    }
    
    async previewMediaFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        if (!file) {
            console.error('File not found:', fileId);
            return;
        }
        
        console.log('Previewing media file:', file.name, file.mime_type);
        
        const mediaViewer = document.getElementById('mediaViewer');
        if (mediaViewer) {
            mediaViewer.dataset.currentFileId = fileId;
        }
        
        if (file.mime_type.startsWith('video/')) {
            await this.showVideoPlayer(file, fileId);
        } else if (file.mime_type.startsWith('image/')) {
            await this.showImageViewer(file, fileId);
        } else if (file.mime_type.startsWith('audio/')) {
            console.log('Audio file detected, downloading instead');
            this.downloadFile(fileId);
        } else {
            console.log('File type not supported for preview:', file.mime_type);
            this.downloadFile(fileId);
        }
    }
    
    async showVideoPlayer(file, fileId) {
        const mediaViewer = document.getElementById('mediaViewer');
        const videoContainer = document.getElementById('videoPlayerContainer');
        const imageContainer = document.getElementById('imageContainer');
        const videoPlayer = document.getElementById('mainVideoPlayer');
        const videoTitle = document.getElementById('videoTitle');
        const videoMeta = document.getElementById('videoMeta');
        const videoError = document.getElementById('videoError');
        
        if (!mediaViewer || !videoContainer || !videoPlayer) {
            console.error('Video player elements not found');
            return;
        }
        
        mediaViewer.classList.remove('hidden');
        videoContainer.classList.remove('hidden');
        if (imageContainer) imageContainer.classList.add('hidden');
        if (videoError) videoError.classList.add('hidden');
        
        if (videoTitle) videoTitle.textContent = file.name;
        if (videoMeta) videoMeta.textContent = `${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}`;
        
        // Clear any existing source
        videoPlayer.src = '';
        videoPlayer.load();
        
        const directUrl = `${this.apiBase}/download/${fileId}`;
        console.log('Loading video from:', directUrl);
        
        // Set up error handler
        videoPlayer.onerror = (e) => {
            console.log('Video playback error, trying blob approach...');
            
            this.makeAuthenticatedRequest(directUrl)
                .then(response => response.blob())
                .then(blob => {
                    if (blob.size > 0) {
                        const videoUrl = URL.createObjectURL(blob);
                        videoPlayer.src = videoUrl;
                        videoPlayer.load();
                        mediaViewer.dataset.objectUrl = videoUrl;
                    }
                })
                .catch(error => {
                    console.error('Video loading failed:', error);
                    if (videoError) videoError.classList.remove('hidden');
                });
        };
        
        // Set direct URL
        videoPlayer.src = directUrl;
        videoPlayer.load();
    }
    
    async showImageViewer(file, fileId) {
        const mediaViewer = document.getElementById('mediaViewer');
        const videoContainer = document.getElementById('videoPlayerContainer');
        const imageContainer = document.getElementById('imageContainer');
        const mainImage = document.getElementById('mainImage');
        const loadingSpinner = document.getElementById('mediaLoadingSpinner');
        
        if (!mediaViewer || !imageContainer || !mainImage) {
            console.error('Image viewer elements not found');
            return;
        }
        
        console.log('Loading image:', file.name);
        
        mediaViewer.classList.remove('hidden');
        imageContainer.classList.remove('hidden');
        if (videoContainer) videoContainer.classList.add('hidden');
        if (loadingSpinner) loadingSpinner.classList.remove('hidden');
        
        try {
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/download/${fileId}`);
            
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.status}`);
            }
            
            const blob = await response.blob();
            const imageUrl = URL.createObjectURL(blob);
            
            mainImage.onload = () => {
                console.log('Image displayed successfully');
                if (loadingSpinner) loadingSpinner.classList.add('hidden');
            };
            
            mainImage.onerror = (e) => {
                console.error('Image display error:', e);
                URL.revokeObjectURL(imageUrl);
                this.showError('Failed to display image');
                this.closeMediaViewer();
            };
            
            mainImage.src = imageUrl;
            mainImage.alt = file.name;
            
            mediaViewer.dataset.objectUrl = imageUrl;
            
        } catch (error) {
            console.error('Error loading image:', error);
            this.showError(`Failed to load image: ${error.message}`);
            this.closeMediaViewer();
        }
    }
    
    closeMediaViewer() {
        const mediaViewer = document.getElementById('mediaViewer');
        const videoPlayer = document.getElementById('mainVideoPlayer');
        const mainImage = document.getElementById('mainImage');
        const videoContainer = document.getElementById('videoPlayerContainer');
        const imageContainer = document.getElementById('imageContainer');
        const loadingSpinner = document.getElementById('mediaLoadingSpinner');
        
        if (mediaViewer) {
            // Clean up blob URLs
            const objectUrl = mediaViewer.dataset.objectUrl;
            if (objectUrl) {
                URL.revokeObjectURL(objectUrl);
                delete mediaViewer.dataset.objectUrl;
            }
            
            mediaViewer.classList.add('hidden');
            
            if (videoContainer) videoContainer.classList.add('hidden');
            if (imageContainer) imageContainer.classList.add('hidden');
            if (loadingSpinner) loadingSpinner.classList.add('hidden');
            
            if (videoPlayer) {
                videoPlayer.pause();
                videoPlayer.src = '';
                videoPlayer.load();
            }
            
            if (mainImage) {
                mainImage.src = '';
                mainImage.onload = null;
                mainImage.onerror = null;
            }
            
            delete mediaViewer.dataset.currentFileId;
        }
    }
    
    async downloadFile(fileId) {
        try {
            console.log(`Downloading file ${fileId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/download/${fileId}`);
            
            if (response.ok) {
                const blob = await response.blob();
                const url = window.URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = '';
                document.body.appendChild(a);
                a.click();
                window.URL.revokeObjectURL(url);
                document.body.removeChild(a);
                console.log('Download completed');
            } else {
                throw new Error(`Download failed: ${response.status}`);
            }
        } catch (error) {
            console.error('Download error:', error);
            this.showError('Failed to download file: ' + error.message);
        }
    }
    
    async deleteFile(fileId) {
        const file = this.files.find(f => f.id === fileId);
        const fileName = file ? file.name : 'this file';
        
        if (!confirm(`Are you sure you want to delete "${fileName}"?`)) return;
        
        try {
            console.log(`Deleting file ${fileId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                console.log('File deleted successfully');
                
                if (file) {
                    this.totalStorageUsed -= file.size;
                    this.totalFileCount -= 1;
                    this.renderStorageInfo();
                }
                
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess('File moved to bin successfully');
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Failed to delete file: ' + error.message);
        }
    }
    
    async deleteFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        const folderName = folder ? folder.name : 'this folder';
        
        if (!confirm(`Are you sure you want to delete "${folderName}"? This will delete all files in the folder.`)) return;
        
        try {
            console.log(`Deleting folder ${folderId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/folders/${folderId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                console.log('Folder deleted successfully');
                await this.loadContent();
                await this.updateStorageInfo();
                this.showSuccess('Folder deleted successfully');
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Failed to delete folder: ' + error.message);
        }
    }
    
    // Folder Operations
    async createFolder() {
        const nameInput = document.getElementById('folderNameInput');
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        if (!name) {
            this.showError('Please enter a folder name');
            return;
        }
        
        try {
            console.log(`Creating folder: ${name}`);
            
            const response = await fetch(`${this.apiBase}/folders?name=${encodeURIComponent(name)}&parent_id=${this.currentFolderId}`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${this.authToken}` }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Folder created:', result);
                this.hideNewFolderModal();
                await this.loadContent();
                this.showSuccess(`Folder "${result.name}" created successfully`);
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Create folder error:', error);
            this.showError('Failed to create folder: ' + error.message);
        }
    }
    
    navigateToFolder(folderId) {
        const folder = this.folders.find(f => f.id === folderId);
        if (folder) {
            this.folderPath.push({id: this.currentFolderId, name: this.getCurrentFolderName()});
            this.currentFolderId = folderId;
            this.loadContent();
            this.closeMobileSidebar();
        }
    }
    
    getCurrentFolderName() {
        if (this.currentFolderId === 0) return 'Home';
        const folder = this.folders.find(f => f.id === this.currentFolderId);
        return folder ? folder.name : 'Unknown';
    }
    
    updateBreadcrumb() {
        const breadcrumb = document.getElementById('breadcrumb');
        if (!breadcrumb) return;
        
        let html = '<button class="text-blue-500 hover:text-blue-700 text-sm" onclick="app.navigateToRoot()">Home</button>';
        
        this.folderPath.forEach((folder, index) => {
            html += ` <i class="fas fa-chevron-right text-gray-400 text-xs"></i> `;
            html += `<button class="text-blue-500 hover:text-blue-700 text-sm" onclick="app.navigateToFolderInPath(${index})">${this.escapeHtml(folder.name)}</button>`;
        });
        
        if (this.currentFolderId !== 0) {
            html += ` <i class="fas fa-chevron-right text-gray-400 text-xs"></i> `;
            html += `<span class="theme-text-secondary text-sm">${this.escapeHtml(this.getCurrentFolderName())}</span>`;
        }
        
        breadcrumb.innerHTML = html;
    }
    
    navigateToRoot() {
        this.currentFolderId = 0;
        this.folderPath = [];
        this.loadContent();
    }
    
    navigateToFolderInPath(index) {
        const targetFolder = this.folderPath[index];
        this.folderPath = this.folderPath.slice(0, index);
        this.currentFolderId = targetFolder.id;
        this.loadContent();
    }
    
    // UI Helper Methods
    showUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) {
            modal.classList.remove('hidden');
            const progress = document.getElementById('uploadProgress');
            if (progress) progress.innerHTML = '';
        }
    }
    
    hideUploadModal() {
        const modal = document.getElementById('uploadModal');
        if (modal) modal.classList.add('hidden');
        this.backgroundUploads = false;
    }
    
    showNewFolderModal() {
        const modal = document.getElementById('newFolderModal');
        const input = document.getElementById('folderNameInput');
        if (modal && input) {
            modal.classList.remove('hidden');
            input.value = '';
            input.focus();
        }
    }
    
    hideNewFolderModal() {
        const modal = document.getElementById('newFolderModal');
        if (modal) modal.classList.add('hidden');
    }
    
    showLoading() {
        const loading = document.getElementById('loadingState');
        const container = document.getElementById('fileContainer');
        if (loading) loading.classList.remove('hidden');
        if (container) container.classList.add('hidden');
    }
    
    hideLoading() {
        const loading = document.getElementById('loadingState');
        const container = document.getElementById('fileContainer');
        if (loading) loading.classList.add('hidden');
        if (container) container.classList.remove('hidden');
    }
    
    showError(message) {
        console.error('Error:', message);
        this.showNotification(message, 'error');
    }
    
    showSuccess(message) {
        console.log('Success:', message);
        this.showNotification(message, 'success');
    }
    
    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `fixed top-4 right-4 z-50 p-4 rounded-lg shadow-lg max-w-sm ${
            type === 'error' ? 'bg-red-500 text-white' : 
            type === 'success' ? 'bg-green-500 text-white' : 
            'bg-blue-500 text-white'
        }`;
        notification.innerHTML = `
            <div class="flex items-center">
                <i class="fas ${
                    type === 'error' ? 'fa-exclamation-triangle' : 
                    type === 'success' ? 'fa-check-circle' : 
                    'fa-info-circle'
                } mr-2"></i>
                <span>${this.escapeHtml(message)}</span>
                <button class="ml-auto text-white hover:text-gray-200" onclick="this.parentElement.parentElement.remove()">
                    <i class="fas fa-times"></i>
                </button>
            </div>
        `;
        
        document.body.appendChild(notification);
        
        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentElement) {
                notification.remove();
            }
        }, 5000);
    }
    
    // Utility Methods
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
    
    getFileIcon(mimeType) {
        if (!mimeType) return 'fas fa-file text-gray-500';
        
        if (mimeType.startsWith('image/')) return 'fas fa-image text-green-500';
        if (mimeType.startsWith('video/')) return 'fas fa-video text-red-500';
        if (mimeType.startsWith('audio/')) return 'fas fa-music text-purple-500';
        if (mimeType.includes('pdf')) return 'fas fa-file-pdf text-red-500';
        if (mimeType.includes('word') || mimeType.includes('document')) return 'fas fa-file-word text-blue-500';
        if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'fas fa-file-excel text-green-500';
        if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'fas fa-file-powerpoint text-orange-500';
        if (mimeType.includes('zip') || mimeType.includes('rar') || mimeType.includes('archive')) return 'fas fa-file-archive text-yellow-500';
        if (mimeType.includes('text/')) return 'fas fa-file-alt text-gray-600';
        
        return 'fas fa-file text-gray-500';
    }
    
    formatFileSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
    
    formatDate(dateString) {
        try {
            const date = new Date(dateString);
            return date.toLocaleDateString(undefined, {
                year: 'numeric',
                month: 'short',
                day: 'numeric'
            });
        } catch (error) {
            return 'Unknown date';
        }
    }
}

// Initialize the app
const app = new TGDriveApp();

