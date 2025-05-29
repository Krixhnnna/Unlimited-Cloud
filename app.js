// app.js - Complete implementation with theme support
class TGDriveApp {
    constructor() {
        this.apiBase = 'http://127.0.0.1:8000/api';
        this.currentFolderId = 0;
        this.folderPath = [];
        this.files = [];
        this.folders = [];
        this.viewMode = 'grid'; // 'grid' or 'list'
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
        this.currentTheme = 'light';
        
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
        console.log('Setting up app...');
        
        // Initialize theme FIRST
        this.initTheme();
        
        if (window.pendingLogin) {
            console.log('Found pending login, processing...');
            this.authToken = window.pendingLogin.token;
            this.currentUser = window.pendingLogin.user;
            localStorage.setItem('tgdrive_token', this.authToken);
            delete window.pendingLogin;
            this.showMainApp();
            this.bindEvents();
            this.loadContent();
            this.updateStorageInfo();
            this.startRecentFilesPolling();
            return;
        }
        
        this.bindEvents();
        
        if (this.authToken) {
            console.log('Found existing token, verifying...');
            const isValid = await this.verifyToken();
            if (isValid) {
                this.showMainApp();
                this.loadContent();
                this.updateStorageInfo();
                this.startRecentFilesPolling();
            } else {
                console.log('Token invalid, showing login screen');
                this.showLoginScreen();
            }
        } else {
            console.log('No token found, showing login screen');
            this.showLoginScreen();
        }
    }
    
    // Theme Methods
    initTheme() {
        const savedTheme = localStorage.getItem('tgdrive-theme') || 'light';
        console.log('Initializing theme:', savedTheme);
        this.setTheme(savedTheme);
    }

    setTheme(theme) {
        console.log('Setting theme to:', theme);
        this.currentTheme = theme;
        
        // Set the data-theme attribute on the document
        document.documentElement.setAttribute('data-theme', theme);
        
        // Save to localStorage
        localStorage.setItem('tgdrive-theme', theme);
        
        // Update the icon
        const themeIcon = document.getElementById('themeIcon');
        if (themeIcon) {
            if (theme === 'dark') {
                themeIcon.className = 'fas fa-moon';
            } else {
                themeIcon.className = 'fas fa-sun';
            }
            console.log('Theme icon updated to:', themeIcon.className);
        } else {
            console.error('Theme icon element not found');
        }
    }

    toggleTheme() {
        const newTheme = this.currentTheme === 'dark' ? 'light' : 'dark';
        console.log('Toggling theme from', this.currentTheme, 'to', newTheme);
        this.setTheme(newTheme);
    }
    
    async makeAuthenticatedRequest(url, options = {}) {
        const headers = {
            'Authorization': `Bearer ${this.authToken}`,
            ...options.headers
        };
        
        return fetch(url, {
            ...options,
            headers
        });
    }
    
    bindEvents() {
        // Mobile menu
        const mobileMenuBtn = document.getElementById('mobileMenuBtn');
        const closeSidebarBtn = document.getElementById('closeSidebarBtn');
        const mobileOverlay = document.getElementById('mobileOverlay');
        const sidebar = document.getElementById('sidebar');
        
        if (mobileMenuBtn) {
            mobileMenuBtn.addEventListener('click', () => {
                sidebar.classList.add('open');
                mobileOverlay.classList.remove('hidden');
            });
        }
        
        if (closeSidebarBtn) {
            closeSidebarBtn.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        
        if (mobileOverlay) {
            mobileOverlay.addEventListener('click', () => {
                this.closeMobileSidebar();
            });
        }
        
        // Upload buttons
        const uploadBtn = document.getElementById('uploadBtn');
        const mobileUploadBtn = document.getElementById('mobileUploadBtn');
        const fileInput = document.getElementById('fileInput');
        
        [uploadBtn, mobileUploadBtn].forEach(btn => {
            if (btn) {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    if (fileInput) fileInput.click();
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
            gridViewBtn.addEventListener('click', () => {
                this.setViewMode('grid');
            });
        }
        
        if (listViewBtn) {
            listViewBtn.addEventListener('click', () => {
                this.setViewMode('list');
            });
        }

        // Theme toggle - IMPORTANT: This is the fix
        const themeToggleBtn = document.getElementById('themeToggleBtn');
        if (themeToggleBtn) {
            themeToggleBtn.addEventListener('click', (e) => {
                e.preventDefault();
                console.log('Theme button clicked');
                this.toggleTheme();
            });
        }
        
        // Upload modal controls
        const cancelUploadBtn = document.getElementById('cancelUploadBtn');
        const backgroundUploadBtn = document.getElementById('backgroundUploadBtn');
        
        if (cancelUploadBtn) {
            cancelUploadBtn.addEventListener('click', () => {
                this.cancelAllUploads();
            });
        }
        
        if (backgroundUploadBtn) {
            backgroundUploadBtn.addEventListener('click', () => {
                this.enableBackgroundUpload();
            });
        }
        
        // Upload status button
        const uploadStatusBtn = document.getElementById('uploadStatusBtn');
        const recentFilesDropdown = document.getElementById('recentFilesDropdown');
        const cancelAllUploadsBtn = document.getElementById('cancelAllUploadsBtn');
        
        if (uploadStatusBtn) {
            uploadStatusBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.toggleRecentFilesDropdown();
            });
        }
        
        if (cancelAllUploadsBtn) {
            cancelAllUploadsBtn.addEventListener('click', () => {
                this.cancelAllUploads();
            });
        }
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (recentFilesDropdown && !recentFilesDropdown.contains(e.target) && !uploadStatusBtn.contains(e.target)) {
                recentFilesDropdown.classList.add('hidden');
            }
        });
        
        // Media viewer
        const mediaViewer = document.getElementById('mediaViewer');
        const mediaClose = document.getElementById('mediaClose');
        
        if (mediaClose) {
            mediaClose.addEventListener('click', () => {
                this.closeMediaViewer();
            });
        }
        
        if (mediaViewer) {
            mediaViewer.addEventListener('click', (e) => {
                if (e.target === mediaViewer) {
                    this.closeMediaViewer();
                }
            });
        }
        
        // Escape key to close media viewer
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') {
                if (mediaViewer && !mediaViewer.classList.contains('hidden')) {
                    this.closeMediaViewer();
                }
            }
        });
        
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                this.loadContent();
                this.updateStorageInfo();
            });
        }
        
        // Folder operations
        const newFolderBtn = document.getElementById('newFolderBtn');
        if (newFolderBtn) {
            newFolderBtn.addEventListener('click', () => {
                this.showNewFolderModal();
            });
        }
        
        // Modal buttons
        const cancelBtn = document.getElementById('cancelFolderBtn');
        const createBtn = document.getElementById('createFolderBtn');
        
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.hideNewFolderModal();
            });
        }
        
        if (createBtn) {
            createBtn.addEventListener('click', () => {
                this.createFolder();
            });
        }
        
        // Enter key for folder creation
        const folderNameInput = document.getElementById('folderNameInput');
        if (folderNameInput) {
            folderNameInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.createFolder();
                }
            });
        }
        
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                this.logout();
            });
        }
        
        // Setup drag and drop for main areas (without blue effects)
        this.setupDragAndDrop();
    }
    
    setupDragAndDrop() {
        // Main drop zone
        const mainDropZone = document.getElementById('mainDropZone');
        const sidebar = document.getElementById('sidebar');
        
        // Main area drag and drop (no visual effects)
        if (mainDropZone) {
            mainDropZone.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                // No visual effects
            });
            
            mainDropZone.addEventListener('dragleave', (e) => {
                e.preventDefault();
                // No visual effects
            });
            
            mainDropZone.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (e.dataTransfer.files.length > 0) {
                    // File upload
                    this.handleFileUpload(e.dataTransfer.files);
                } else if (this.draggedFile) {
                    // File move to current folder
                    this.moveFileToFolder(this.draggedFile.id, this.currentFolderId);
                    this.draggedFile = null;
                }
            });
        }
        
        // Sidebar drag and drop (no visual effects)
        if (sidebar) {
            sidebar.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'copy';
                // No visual effects
            });
            
            sidebar.addEventListener('dragleave', (e) => {
                e.preventDefault();
                // No visual effects
            });
            
            sidebar.addEventListener('drop', (e) => {
                e.preventDefault();
                
                if (e.dataTransfer.files.length > 0) {
                    // Upload to root folder
                    const originalFolderId = this.currentFolderId;
                    this.currentFolderId = 0;
                    this.handleFileUpload(e.dataTransfer.files);
                    this.currentFolderId = originalFolderId;
                }
            });
        }
    }
    
    setViewMode(mode) {
        this.viewMode = mode;
        const fileContainer = document.getElementById('fileContainer');
        const gridBtn = document.getElementById('gridViewBtn');
        const listBtn = document.getElementById('listViewBtn');
        
        if (fileContainer) {
            if (mode === 'grid') {
                fileContainer.className = 'file-grid';
                gridBtn.classList.add('active');
                listBtn.classList.remove('active');
            } else {
                fileContainer.className = 'file-list';
                listBtn.classList.add('active');
                gridBtn.classList.remove('active');
            }
        }
        
        this.renderContent();
    }
    
    closeMobileSidebar() {
        const sidebar = document.getElementById('sidebar');
        const mobileOverlay = document.getElementById('mobileOverlay');
        
        if (sidebar) sidebar.classList.remove('open');
        if (mobileOverlay) mobileOverlay.classList.add('hidden');
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
    
    showMainApp() {
        const loginScreen = document.getElementById('loginScreen');
        const app = document.getElementById('app');
        
        if (loginScreen) loginScreen.style.display = 'none';
        if (app) app.style.display = 'flex';
        
        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <div class="flex items-center">
                    <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center mr-3">
                        <i class="fas fa-user text-white text-sm"></i>
                    </div>
                    <div>
                        <div class="font-medium text-gray-800">${this.currentUser.first_name}</div>
                        <div class="text-xs text-gray-500">@${this.currentUser.username || 'user'}</div>
                    </div>
                </div>
            `;
        }
        
        // Set initial view mode
        this.setViewMode('grid');
    }
    
    logout() {
        localStorage.removeItem('tgdrive_token');
        this.authToken = null;
        this.currentUser = null;
        
        if (typeof logout === 'function') {
            logout();
                } else {
            document.cookie.split(";").forEach(function(c) { 
                document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
            });
            window.location.reload();
        }
    }
    
    async updateStorageInfo() {
        try {
            console.log('Updating storage info...');
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/storage/info`);
            
            if (response.ok) {
                const data = await response.json();
                this.totalStorageUsed = data.totalSize;
                this.totalFileCount = data.totalFiles;
                console.log('Storage info received:', data);
            } else {
                console.log('Storage endpoint failed, calculating from current files');
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
                console.log('Calculated storage from all files:', this.totalStorageUsed, 'bytes,', this.totalFileCount, 'files');
            } else {
                this.totalStorageUsed = this.files.reduce((total, file) => total + (file.size || 0), 0);
                this.totalFileCount = this.files.length;
                console.log('Using current view for storage calculation');
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
            // Create a more realistic progress bar animation
            const percentage = Math.min((this.totalStorageUsed / (10 * 1024 * 1024 * 1024)) * 100, 85); // Show up to 85% for 10GB
            storageBar.style.width = `${percentage}%`;
        }
        
        console.log('Storage info rendered:', this.formatFileSize(this.totalStorageUsed), this.totalFileCount, 'files');
    }
    
    async handleFileUpload(files) {
        if (files.length === 0) return;
        
        console.log(`Starting upload of ${files.length} files to folder ${this.currentFolderId}`);
        
        // Add files to upload queue with current folder ID
        for (let file of files) {
            const uploadId = Date.now() + Math.random();
            this.uploadQueue.push({
                file: file,
                folderId: this.currentFolderId, // IMPORTANT: Use current folder
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
            
            this.loadContent();
            this.updateStorageInfo();
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
        console.log(`Uploading file: ${file.name}, size: ${file.size}, to folder: ${folderId}`);
        
        const progressItem = this.addUploadProgressItem(file.name, file.size, id);
        this.activeUploads.set(id, { file, progressItem, cancelled: false });
        let uploadCancelled = false;
        
        // Create realistic upload simulation
        const simulateRealisticProgress = () => {
            return new Promise((resolve, reject) => {
                let uploadedBytes = 0;
                const totalBytes = file.size;
                
                // Calculate realistic speed based on file size
                let baseSpeed = 1024 * 1024; // 1 MB/s base
                if (totalBytes > 50 * 1024 * 1024) baseSpeed = 2 * 1024 * 1024; // 2 MB/s for large files
                if (totalBytes < 5 * 1024 * 1024) baseSpeed = 512 * 1024; // 512 KB/s for small files
                
                const updateInterval = 300; // Update every 300ms
                let lastUpdateTime = Date.now();
                
                const progressInterval = setInterval(() => {
                    const upload = this.activeUploads.get(id);
                    if (!upload || upload.cancelled || uploadCancelled) {
                        clearInterval(progressInterval);
                        reject(new Error('Upload cancelled'));
                        return;
                    }
                    
                    const now = Date.now();
                    const timeDiff = (now - lastUpdateTime) / 1000;
                    
                    // Simulate variable speed (±30% variation)
                    const speedVariation = 0.7 + Math.random() * 0.6; // 0.7 to 1.3
                    const currentSpeed = baseSpeed * speedVariation;
                    
                    // Calculate bytes to add this update
                    const bytesToAdd = Math.min(
                        currentSpeed * timeDiff,
                        totalBytes - uploadedBytes
                    );
                    
                    uploadedBytes += bytesToAdd;
                    const percentage = Math.min((uploadedBytes / totalBytes) * 100, 99);
                    
                    // Update progress display
                    this.updateUploadProgress(
                        progressItem,
                        percentage,
                        uploadedBytes,
                        totalBytes,
                        currentSpeed,
                        'uploading'
                    );
                    
                    console.log(`Progress: ${Math.round(percentage)}% - ${this.formatFileSize(uploadedBytes)}/${this.formatFileSize(totalBytes)} - Speed: ${this.formatFileSize(currentSpeed)}/s`);
                    
                    lastUpdateTime = now;
                    
                    // Complete when we reach 99% (actual upload will finish it)
                    if (uploadedBytes >= totalBytes * 0.99) {
                        clearInterval(progressInterval);
                        resolve();
                    }
                }, updateInterval);
                
                // Store interval reference for cancellation
                progressItem.progressInterval = progressInterval;
            });
        };
        
        try {
            // Start the realistic progress simulation
            const progressPromise = simulateRealisticProgress();
            
            // Start the actual upload with EXPLICIT folder_id
            const formData = new FormData();
            formData.append('file', file);
            formData.append('folder_id', String(folderId)); // EXPLICIT folder_id
            formData.append('upload_id', String(id)); // Send upload ID for cancellation tracking
            
            console.log(`Uploading to folder_id: ${folderId}`); // Debug log
            
            const uploadPromise = fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            // Wait for progress simulation to reach 99%
            await progressPromise;
            
            // Check if cancelled during progress
            const upload = this.activeUploads.get(id);
            if (!upload || upload.cancelled) {
                throw new Error('Upload cancelled');
            }
            
            // Wait for actual upload to complete
            const response = await uploadPromise;
            
            if (response.ok) {
                const result = await response.json();
                console.log('Upload successful to folder:', folderId, result);
                
                // Show 100% completion
                this.updateUploadProgress(progressItem, 100, file.size, file.size, 0, 'completed');
                
                // Update storage immediately
                this.totalStorageUsed += file.size;
                this.totalFileCount += 1;
                this.renderStorageInfo();
                
                // Clean up
                this.activeUploads.delete(id);
                this.updateUploadStatusIndicator();
                
                return result;
            } else {
                const errorText = await response.text();
                throw new Error(`Upload failed: ${response.status} - ${errorText}`);
            }
            
        } catch (error) {
            console.error('Upload error:', error);
            uploadCancelled = true;
            
            // Clear progress interval if it exists
            if (progressItem.progressInterval) {
                clearInterval(progressItem.progressInterval);
            }
            
            // Update progress to show failure
            this.updateUploadProgress(progressItem, 0, 0, file.size, 0, 'failed');
            
            // Clean up
            this.activeUploads.delete(id);
            this.updateUploadStatusIndicator();
            
            throw error;
        }
    }
    
    addUploadProgressItem(filename, fileSize, id) {
        const progressContainer = document.getElementById('uploadProgress');
        if (!progressContainer) return null;
        
        const item = document.createElement('div');
        item.className = 'upload-progress-item';
        item.dataset.uploadId = id;
        
        const startTime = Date.now();
        
        item.innerHTML = `
            <div class="flex items-center justify-between mb-2">
                <div class="flex items-center flex-1 min-w-0">
                    <i class="fas fa-file-upload text-blue-500 mr-3"></i>
                    <div class="flex-1 min-w-0">
                        <div class="font-medium text-gray-900 truncate" title="${this.escapeHtml(filename)}">${this.escapeHtml(filename)}</div>
                        <div class="text-sm text-gray-500">
                            <span class="upload-status">Preparing...</span>
                            <span class="upload-speed ml-2"></span>
                        </div>
                    </div>
                </div>
                <div class="flex items-center space-x-2">
                    <div class="text-sm font-medium text-gray-700">
                        <span class="upload-progress-text">0%</span>
                    </div>
                    <button class="cancel-upload-btn text-red-500 hover:text-red-700 p-1 rounded" data-upload-id="${id}" title="Cancel upload">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            </div>
            <div class="progress-bar mb-2">
                <div class="progress-fill" style="width: 0%"></div>
            </div>
            <div class="flex justify-between text-xs text-gray-500">
                <span class="upload-data">0 / ${this.formatFileSize(fileSize)}</span>
                <span class="upload-eta"></span>
            </div>
        `;
        
        progressContainer.appendChild(item);
        
        // Add cancel button event listener
        const cancelBtn = item.querySelector('.cancel-upload-btn');
        if (cancelBtn) {
            cancelBtn.addEventListener('click', () => {
                this.cancelSingleUpload(id);
            });
        }
        
        return {
            element: item,
            startTime: startTime,
            id: id,
            progressInterval: null
        };
    }
    
    updateUploadProgress(progressItem, percentage, loaded, total, speed, status) {
        if (!progressItem || !progressItem.element) return;
        
        const element = progressItem.element;
        const progressFill = element.querySelector('.progress-fill');
        const progressText = element.querySelector('.upload-progress-text');
        const statusText = element.querySelector('.upload-status');
        const speedText = element.querySelector('.upload-speed');
        const dataText = element.querySelector('.upload-data');
        const etaText = element.querySelector('.upload-eta');
        const cancelBtn = element.querySelector('.cancel-upload-btn');
        
        // Clamp percentage between 0 and 100
        const clampedPercentage = Math.min(Math.max(percentage, 0), 100);
        
        // Update progress bar with slower transition for more realistic feel
        if (progressFill) {
            progressFill.style.width = `${clampedPercentage}%`;
            progressFill.style.transition = 'width 0.8s ease-out';
        }
        
        // Update percentage display
        if (progressText) {
            progressText.textContent = `${Math.round(clampedPercentage)}%`;
        }
        
        // Update status with realistic messages
        if (statusText) {
            switch (status) {
                case 'starting':
                    statusText.textContent = 'Preparing upload...';
                    break;
                case 'connecting':
                    statusText.textContent = 'Connecting to server...';
                    break;
                case 'uploading':
                    if (clampedPercentage < 1) {
                        statusText.textContent = 'Starting transfer...';
                    } else if (clampedPercentage < 95) {
                        statusText.textContent = 'Uploading...';
                    } else {
                        statusText.textContent = 'Processing...';
                    }
                    break;
                case 'completed':
                    statusText.textContent = 'Upload completed';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    break;
                case 'failed':
                    statusText.textContent = 'Upload failed';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    break;
                case 'cancelled':
                    statusText.textContent = 'Upload cancelled';
                    if (cancelBtn) cancelBtn.style.display = 'none';
                    break;
                default:
                    statusText.textContent = 'Initializing...';
            }
        }
        
        // Update speed display (only show when meaningful)
        if (speedText) {
            if (speed > 10240 && status === 'uploading' && clampedPercentage > 2 && clampedPercentage < 95) {
                speedText.textContent = `${this.formatFileSize(speed)}/s`;
                speedText.style.display = 'inline';
            } else {
                speedText.style.display = 'none';
            }
        }
        
        // Update data transferred display
        if (dataText) {
            const loadedFormatted = this.formatFileSize(loaded);
            const totalFormatted = this.formatFileSize(total);
            dataText.textContent = `${loadedFormatted} / ${totalFormatted}`;
        }
        
        // Update ETA with better calculation
        if (etaText && speed > 10240 && status === 'uploading' && clampedPercentage > 5 && clampedPercentage < 90) {
            const remainingBytes = total - loaded;
            const eta = remainingBytes / speed;
            
            if (eta > 2 && eta < 7200 && remainingBytes > 0) {
                etaText.textContent = `ETA: ${this.formatTime(eta)}`;
                etaText.style.display = 'inline';
            } else {
                etaText.style.display = 'none';
            }
        } else {
            if (etaText) etaText.style.display = 'none';
        }
        
        // Update progress bar color and animation
        if (progressFill) {
            switch (status) {
                case 'completed':
                    progressFill.style.background = 'linear-gradient(90deg, #10b981, #059669)';
                    progressFill.style.transition = 'width 0.3s ease-out, background 0.3s ease';
                    break;
                case 'failed':
                    progressFill.style.background = 'linear-gradient(90deg, #ef4444, #dc2626)';
                    break;
                case 'cancelled':
                    progressFill.style.background = 'linear-gradient(90deg, #6b7280, #4b5563)';
                    break;
                default:
                    // Progressive color change based on completion
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
        }
    }
    
    cancelSingleUpload(uploadId) {
        console.log('Cancelling upload:', uploadId);
        
        // Mark upload as cancelled
        const upload = this.activeUploads.get(uploadId);
        if (upload) {
            upload.cancelled = true;
            
            // Cancel backend upload
            fetch(`${this.apiBase}/upload/cancel/${uploadId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            }).catch(err => console.log('Cancel request failed:', err));
            
            // Clear progress interval
            if (upload.progressItem?.progressInterval) {
                clearInterval(upload.progressItem.progressInterval);
            }
            
            // Update progress to show cancelled
            this.updateUploadProgress(upload.progressItem, 0, 0, upload.file.size, 0, 'cancelled');
        }
        
        // Remove from queue
        this.uploadQueue = this.uploadQueue.filter(item => item.id !== uploadId);
        
        // Remove from active uploads
        this.activeUploads.delete(uploadId);
        
        // Update status indicator
        this.updateUploadStatusIndicator();
        
        // Hide modal if no more uploads
        if (this.uploadQueue.length === 0 && this.activeUploads.size === 0) {
            this.hideUploadModal();
            this.isUploading = false;
        }
    }
    
    cancelAllUploads() {
        console.log('Cancelling all uploads...');
        
        // Cancel all active uploads
        this.activeUploads.forEach((upload, id) => {
            this.cancelSingleUpload(id);
        });
        
        // Clear upload queue
        this.uploadQueue = [];
        this.isUploading = false;
        
        // Hide modal
        this.hideUploadModal();
        
        console.log('All uploads cancelled');
    }
    
    enableBackgroundUpload() {
        this.backgroundUploads = true;
        this.hideUploadModal();
        console.log('Background upload enabled');
    }
    
    updateUploadStatusIndicator() {
        const uploadStatusBtn = document.getElementById('uploadStatusBtn');
        const activeUploadsContainer = document.getElementById('activeUploadsContainer');
        
        if (uploadStatusBtn) {
            if (this.activeUploads.size > 0 || this.uploadQueue.length > 0) {
                uploadStatusBtn.classList.add('active');
                uploadStatusBtn.title = `${this.activeUploads.size + this.uploadQueue.length} uploads in progress`;
            } else {
                uploadStatusBtn.classList.remove('active');
                uploadStatusBtn.title = 'Upload Status & Recent Files';
            }
        }
        
        // Update active uploads in dropdown
        if (activeUploadsContainer) {
            if (this.activeUploads.size === 0 && this.uploadQueue.length === 0) {
                activeUploadsContainer.innerHTML = '<p class="text-sm theme-text-secondary">No active uploads</p>';
            } else {
                let html = '';
                this.activeUploads.forEach((upload, id) => {
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
                            <div class="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0">
                                <div class="flex-1 min-w-0">
                                    <div class="text-sm font-medium truncate">${this.escapeHtml(file.name)}</div>
                                    <div class="text-xs text-gray-500">${this.formatFileSize(file.size)} • ${timeAgo}</div>
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
        // Update recent files every 30 seconds
        setInterval(() => {
            const dropdown = document.getElementById('recentFilesDropdown');
            if (dropdown && !dropdown.classList.contains('hidden')) {
                this.loadRecentFiles();
            }
        }, 30000);
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
    
    async loadContent() {
        this.showLoading();
        
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
            
            console.log(`Loaded ${this.files.length} files and ${this.folders.length} folders for folder ${this.currentFolderId}`);
            
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
        
        if (this.files.length === 0 && this.folders.length === 0) {
            fileContainer.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        let html = '';
        
        // Render folders
        this.folders.forEach(folder => {
            html += this.viewMode === 'grid' ? this.renderFolderItem(folder) : this.renderFolderListItem(folder);
        });
        
        // Render files
        this.files.forEach(file => {
            html += this.viewMode === 'grid' ? this.renderFileItem(file) : this.renderFileListItem(file);
        });
        
        fileContainer.innerHTML = html;
        this.bindItemEvents();
    }
    
    renderFolderItem(folder) {
        return `
            <div class="folder-item bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all cursor-pointer" 
                 data-folder-id="${folder.id}"
                 draggable="false">
                <div class="flex items-center mb-3">
                    <div class="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                        <i class="fas fa-folder text-blue-500 text-xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-gray-900 truncate">${this.escapeHtml(folder.name)}</h3>
                        <p class="text-sm text-gray-500">${this.formatDate(folder.created_at)}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <span class="text-xs text-gray-400">Folder</span>
                    <button class="delete-folder-btn text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors" data-folder-id="${folder.id}" title="Delete folder">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderFolderListItem(folder) {
        return `
            <div class="folder-item file-list-item cursor-pointer" 
                 data-folder-id="${folder.id}"
                 draggable="false">
                <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center mr-4">
                    <i class="fas fa-folder text-blue-500"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-medium text-gray-900 truncate">${this.escapeHtml(folder.name)}</h3>
                    <p class="text-sm text-gray-500">Folder • ${this.formatDate(folder.created_at)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="delete-folder-btn text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors" data-folder-id="${folder.id}" title="Delete folder">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderFileItem(file) {
        const icon = this.getFileIcon(file.mime_type);
        const isMedia = this.isMediaFile(file.mime_type);
        
        return `
            <div class="file-item bg-white rounded-xl border border-gray-200 p-4 hover:shadow-lg transition-all ${isMedia ? 'cursor-pointer' : ''}" 
                 data-file-id="${file.id}" 
                 ${isMedia ? 'data-media="true"' : ''}
                 draggable="true">
                <div class="flex items-center mb-3">
                    <div class="w-12 h-12 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                        <i class="${icon} text-xl"></i>
                    </div>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-semibold text-gray-900 truncate" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</h3>
                        <p class="text-sm text-gray-500">${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}</p>
                    </div>
                </div>
                <div class="flex justify-between items-center">
                    <button class="download-btn text-blue-500 hover:text-blue-700 p-2 rounded-lg hover:bg-blue-50 transition-colors" data-file-id="${file.id}" title="Download file">
                        <i class="fas fa-download text-sm"></i>
                    </button>
                    <button class="delete-file-btn text-red-500 hover:text-red-700 p-2 rounded-lg hover:bg-red-50 transition-colors" data-file-id="${file.id}" title="Delete file">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderFileListItem(file) {
        const icon = this.getFileIcon(file.mime_type);
        const isMedia = this.isMediaFile(file.mime_type);
        
        return `
            <div class="file-item file-list-item ${isMedia ? 'cursor-pointer' : ''}" 
                 data-file-id="${file.id}" 
                 ${isMedia ? 'data-media="true"' : ''}
                 draggable="true">
                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center mr-4">
                    <i class="${icon}"></i>
                </div>
                <div class="flex-1 min-w-0">
                    <h3 class="font-medium text-gray-900 truncate" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</h3>
                    <p class="text-sm text-gray-500">${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}</p>
                </div>
                <div class="flex items-center space-x-2">
                    <button class="download-btn text-blue-500 hover:text-blue-700 p-2 rounded hover:bg-blue-50 transition-colors" data-file-id="${file.id}" title="Download file">
                        <i class="fas fa-download text-sm"></i>
                    </button>
                    <button class="delete-file-btn text-red-500 hover:text-red-700 p-2 rounded hover:bg-red-50 transition-colors" data-file-id="${file.id}" title="Delete file">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
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
        
        // Delete buttons
        document.querySelectorAll('.delete-file-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const fileId = parseInt(e.currentTarget.dataset.fileId);
                this.deleteFile(fileId);
            });
        });
        
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
            
            // Folder drag and drop (no visual effects)
            item.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.dataTransfer.dropEffect = 'move';
                // No visual effects
            });
            
            item.addEventListener('dragleave', (e) => {
                e.preventDefault();
                e.stopPropagation();
                // No visual effects
            });
            
            item.addEventListener('drop', (e) => {
                e.preventDefault();
                e.stopPropagation();
                
                const folderId = parseInt(item.dataset.folderId);
                
                if (e.dataTransfer.files.length > 0) {
                    // File upload to folder
                    const originalFolderId = this.currentFolderId;
                    this.currentFolderId = folderId;
                    this.handleFileUpload(e.dataTransfer.files);
                    this.currentFolderId = originalFolderId;
                } else if (this.draggedFile) {
                    // Move file to folder
                    this.moveFileToFolder(this.draggedFile.id, folderId);
                    this.draggedFile = null;
                }
            });
        });
        
        // File drag and drop (no visual effects)
        document.querySelectorAll('.file-item[draggable="true"]').forEach(item => {
            item.addEventListener('dragstart', (e) => {
                const fileId = parseInt(item.dataset.fileId);
                const file = this.files.find(f => f.id === fileId);
                if (file) {
                    this.draggedFile = file;
                    // No visual effects
                    e.dataTransfer.effectAllowed = 'move';
                    e.dataTransfer.setData('text/plain', fileId);
                }
            });
            
            item.addEventListener('dragend', (e) => {
                // No visual effects
                this.draggedFile = null;
            });
        });
        
        // Media file preview
        document.querySelectorAll('.file-item[data-media="true"]').forEach(item => {
            item.addEventListener('click', (e) => {
                // Don't trigger if clicking on buttons or dragging
                if (e.target.closest('button')) return;
                
                const fileId = parseInt(item.dataset.fileId);
                this.previewMediaFile(fileId);
            });
        });
    }
    
    async moveFileToFolder(fileId, targetFolderId) {
        try {
            console.log(`Moving file ${fileId} to folder ${targetFolderId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}/move`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ folder_id: targetFolderId })
            });
            
            if (response.ok) {
                console.log('File moved successfully');
                this.loadContent();
                this.updateStorageInfo();
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
        if (!file) return;
        
        // Show loading spinner
        this.showMediaLoading();
        
        try {
            // Check cache first
            const cacheKey = `media_${fileId}`;
            let url = this.mediaCache.get(cacheKey);
            
            if (!url) {
                const response = await this.makeAuthenticatedRequest(`${this.apiBase}/download/${fileId}`);
                
                if (response.ok) {
                    const blob = await response.blob();
                    url = URL.createObjectURL(blob);
                    
                    // Cache for 5 minutes
                    this.mediaCache.set(cacheKey, url);
                    setTimeout(() => {
                        this.mediaCache.delete(cacheKey);
                        URL.revokeObjectURL(url);
                    }, 5 * 60 * 1000);
                } else {
                    throw new Error('Failed to load media file');
                }
            }
            
            this.showMediaViewer(url, file.mime_type, file.name);
        } catch (error) {
            console.error('Error loading media:', error);
            this.showError('Failed to load media file');
            this.closeMediaViewer();
        }
    }
    
    showMediaLoading() {
        const mediaViewer = document.getElementById('mediaViewer');
        const loadingSpinner = document.getElementById('mediaLoadingSpinner');
        
        if (mediaViewer && loadingSpinner) {
            mediaViewer.classList.remove('hidden');
            loadingSpinner.classList.remove('hidden');
        }
    }
    
    showMediaViewer(url, mimeType, filename) {
        const mediaViewer = document.getElementById('mediaViewer');
        const mediaContent = document.getElementById('mediaContent');
        const loadingSpinner = document.getElementById('mediaLoadingSpinner');
        
        if (!mediaViewer || !mediaContent) return;
        
        // Hide loading spinner
        if (loadingSpinner) {
            loadingSpinner.classList.add('hidden');
        }
        
        let content = '';
        
        if (mimeType.startsWith('image/')) {
            content = `<img src="${url}" alt="${this.escapeHtml(filename)}" class="media-content" style="max-width: 80vw; max-height: 80vh; width: auto; height: auto; object-fit: contain; border-radius: 12px;" onload="this.style.opacity=1" style="opacity: 0; transition: opacity 0.3s;">`;
        } else if (mimeType.startsWith('video/')) {
            content = `<video controls autoplay class="media-content" style="max-width: 80vw; max-height: 80vh; width: auto; height: auto; object-fit: contain; border-radius: 12px;">
                <source src="${url}" type="${mimeType}">
                Your browser does not support the video tag.
            </video>`;
        }
        
        mediaContent.innerHTML = content;
        mediaViewer.classList.remove('hidden');
        
        // Store URL for cleanup
        mediaViewer.dataset.objectUrl = url;
    }
    
    closeMediaViewer() {
        const mediaViewer = document.getElementById('mediaViewer');
        const mediaContent = document.getElementById('mediaContent');
        const loadingSpinner = document.getElementById('mediaLoadingSpinner');
        
        if (mediaViewer) {
            // Hide loading spinner
            if (loadingSpinner) {
                loadingSpinner.classList.add('hidden');
            }
            
            // Don't revoke cached URLs
            delete mediaViewer.dataset.objectUrl;
            
            mediaViewer.classList.add('hidden');
            if (mediaContent) {
                mediaContent.innerHTML = '';
            }
        }
    }
    
    async createFolder() {
        const nameInput = document.getElementById('folderNameInput');
        if (!nameInput) return;
        
        const name = nameInput.value.trim();
        if (!name) {
            this.showError('Please enter a folder name');
            return;
        }
        
        try {
            console.log(`Creating folder: ${name} in parent folder: ${this.currentFolderId}`);
            
            const response = await fetch(`${this.apiBase}/folders?name=${encodeURIComponent(name)}&parent_id=${this.currentFolderId}`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                }
            });
            
            if (response.ok) {
                const result = await response.json();
                console.log('Folder created:', result);
                this.hideNewFolderModal();
                this.loadContent();
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Create folder error:', error);
            this.showError('Failed to create folder: ' + error.message);
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
        
        if (!confirm(`Are you sure you want to delete "${fileName}"? This will also remove it from Telegram.`)) return;
        
        try {
            console.log(`Deleting file ${fileId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/files/${fileId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                console.log('File deleted successfully from both app and Telegram');
                
                // Update storage info immediately
                if (file) {
                    this.totalStorageUsed -= file.size;
                    this.totalFileCount -= 1;
                    this.renderStorageInfo();
                }
                
                this.loadContent();
                this.updateStorageInfo(); // Full refresh
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
        
        if (!confirm(`Are you sure you want to delete "${folderName}"? This will delete all files in the folder and remove the Telegram channel.`)) return;
        
        try {
            console.log(`Deleting folder ${folderId}`);
            
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/folders/${folderId}`, {
                method: 'DELETE'
            });
            
            if (response.ok) {
                console.log('Folder deleted successfully');
                this.loadContent();
                this.updateStorageInfo(); // Update storage after folder deletion
            } else {
                const errorText = await response.text();
                throw new Error(errorText);
            }
        } catch (error) {
            console.error('Delete error:', error);
            this.showError('Failed to delete folder: ' + error.message);
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
            html += `<span class="text-gray-600 text-sm">${this.escapeHtml(this.getCurrentFolderName())}</span>`;
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
        if (modal) {
            modal.classList.add('hidden');
        }
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
        if (modal) {
            modal.classList.add('hidden');
        }
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
        alert('Error: ' + message);
    }
    
    // Utility methods
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
