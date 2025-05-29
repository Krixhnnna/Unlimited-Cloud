// app.js - Complete implementation with fixed storage tracking
class TGDriveApp {
    constructor() {
        this.apiBase = 'http://127.0.0.1:8000/api';
        this.currentFolderId = 0;
        this.folderPath = [];
        this.files = [];
        this.folders = [];
        this.viewMode = 'grid';
        this.authToken = localStorage.getItem('tgdrive_token');
        this.currentUser = null;
        this.totalStorageUsed = 0;
        this.totalFileCount = 0;
        
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
        
        // Check for pending login from Telegram widget
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
            } else {
                console.log('Token invalid, showing login screen');
                this.showLoginScreen();
            }
        } else {
            console.log('No token found, showing login screen');
            this.showLoginScreen();
        }
    }
    
    // Helper method for authenticated requests
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
                    // Reset file input
                    e.target.value = '';
                }
            });
        }
        
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
        
        // Drag and drop
        const fileGrid = document.getElementById('fileGrid');
        if (fileGrid) {
            fileGrid.addEventListener('dragover', (e) => {
                e.preventDefault();
                fileGrid.classList.add('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
            });
            
            fileGrid.addEventListener('dragleave', (e) => {
                e.preventDefault();
                fileGrid.classList.remove('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
            });
            
            fileGrid.addEventListener('drop', (e) => {
                e.preventDefault();
                fileGrid.classList.remove('bg-blue-50', 'border-2', 'border-dashed', 'border-blue-300');
                this.handleFileUpload(e.dataTransfer.files);
            });
        }
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
        
        // Update user info
        const userInfo = document.getElementById('userInfo');
        if (userInfo && this.currentUser) {
            userInfo.innerHTML = `
                <div class="flex items-center">
                    <i class="fas fa-user-circle mr-2"></i>
                    <span>${this.currentUser.first_name}</span>
                </div>
            `;
        }
    }
    
    logout() {
        localStorage.removeItem('tgdrive_token');
        this.authToken = null;
        this.currentUser = null;
        
        // Clear Telegram cookies to reset login state
        document.cookie.split(";").forEach(function(c) { 
            document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/"); 
        });
        
        // Reload page to show fresh login widget
        window.location.reload();
    }
    
    async updateStorageInfo() {
        try {
            console.log('Updating storage info...');
            
            // Get storage info from backend
            const response = await this.makeAuthenticatedRequest(`${this.apiBase}/storage/info`);
            
            if (response.ok) {
                const data = await response.json();
                this.totalStorageUsed = data.totalSize;
                this.totalFileCount = data.totalFiles;
                console.log('Storage info received:', data);
            } else {
                console.log('Storage endpoint failed, calculating from current files');
                // Fallback: calculate from current view
                await this.calculateStorageFromFiles();
            }
            
            this.renderStorageInfo();
            
        } catch (error) {
            console.error('Error updating storage info:', error);
            // Fallback: calculate from current files
            await this.calculateStorageFromFiles();
            this.renderStorageInfo();
        }
    }
    
    async calculateStorageFromFiles() {
        try {
            // Get all files from all folders
            const allFilesResponse = await this.makeAuthenticatedRequest(`${this.apiBase}/files/all`);
            
            if (allFilesResponse.ok) {
                const allFiles = await allFilesResponse.json();
                this.totalStorageUsed = allFiles.reduce((total, file) => total + (file.size || 0), 0);
                this.totalFileCount = allFiles.length;
                console.log('Calculated storage from all files:', this.totalStorageUsed, 'bytes,', this.totalFileCount, 'files');
            } else {
                // Final fallback: use current view files
                this.totalStorageUsed = this.files.reduce((total, file) => total + (file.size || 0), 0);
                this.totalFileCount = this.files.length;
                console.log('Using current view for storage calculation');
            }
        } catch (error) {
            console.error('Error calculating storage:', error);
            // Use current view as fallback
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
            // Animate the storage bar (visual effect only since storage is unlimited)
            const percentage = Math.min((this.totalStorageUsed / (1024 * 1024 * 1024)) * 10, 100); // Show progress up to 10GB
            storageBar.style.width = `${percentage}%`;
        }
        
        console.log('Storage info rendered:', this.formatFileSize(this.totalStorageUsed), this.totalFileCount, 'files');
    }
    
    async handleFileUpload(files) {
        if (files.length === 0) return;
        
        console.log(`Starting upload of ${files.length} files`);
        this.showUploadModal();
        
        for (let file of files) {
            await this.uploadFile(file);
        }
        
        this.hideUploadModal();
        this.loadContent();
        this.updateStorageInfo(); // Update storage after upload
    }
    
    async uploadFile(file) {
        console.log(`Uploading file: ${file.name}, size: ${file.size}`);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('folder_id', this.currentFolderId);
        
        const progressItem = this.addUploadProgressItem(file.name);
        
        try {
            const response = await fetch(`${this.apiBase}/upload`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.authToken}`
                },
                body: formData
            });
            
            console.log(`Upload response status: ${response.status}`);
            
            if (response.ok) {
                const result = await response.json();
                console.log('Upload successful:', result);
                this.updateUploadProgress(progressItem, 100, 'Completed');
                
                // Update storage info immediately
                this.totalStorageUsed += file.size;
                this.totalFileCount += 1;
                this.renderStorageInfo();
            } else {
                const errorText = await response.text();
                console.error('Upload failed:', errorText);
                this.updateUploadProgress(progressItem, 0, 'Failed');
                this.showError(`Upload failed: ${errorText}`);
            }
        } catch (error) {
            console.error('Upload error:', error);
            this.updateUploadProgress(progressItem, 0, 'Failed');
            this.showError(`Upload error: ${error.message}`);
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
        const fileGrid = document.getElementById('fileGrid');
        const emptyState = document.getElementById('emptyState');
        
        if (!fileGrid || !emptyState) return;
        
        if (this.files.length === 0 && this.folders.length === 0) {
            fileGrid.innerHTML = '';
            emptyState.classList.remove('hidden');
            return;
        }
        
        emptyState.classList.add('hidden');
        
        let html = '';
        
        // Render folders
        this.folders.forEach(folder => {
            html += this.renderFolderItem(folder);
        });
        
        // Render files
        this.files.forEach(file => {
            html += this.renderFileItem(file);
        });
        
        fileGrid.innerHTML = html;
        this.bindItemEvents();
    }
    
    renderFolderItem(folder) {
        return `
            <div class="folder-item bg-white rounded-lg border border-gray-200 p-3 md:p-4 hover:shadow-md transition-shadow cursor-pointer" data-folder-id="${folder.id}">
                <div class="flex items-center mb-2">
                    <i class="fas fa-folder text-blue-500 text-xl md:text-2xl mr-2 md:mr-3"></i>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-gray-900 truncate text-sm md:text-base">${this.escapeHtml(folder.name)}</h3>
                        <p class="text-xs md:text-sm text-gray-500">${this.formatDate(folder.created_at)}</p>
                    </div>
                </div>
                <div class="flex justify-end">
                    <button class="delete-folder-btn text-red-500 hover:text-red-700 p-1" data-folder-id="${folder.id}" title="Delete folder">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
    }
    
    renderFileItem(file) {
        const icon = this.getFileIcon(file.mime_type);
        return `
            <div class="file-item bg-white rounded-lg border border-gray-200 p-3 md:p-4 hover:shadow-md transition-shadow">
                <div class="flex items-center mb-2">
                    <i class="${icon} text-xl md:text-2xl mr-2 md:mr-3"></i>
                    <div class="flex-1 min-w-0">
                        <h3 class="font-medium text-gray-900 truncate text-sm md:text-base" title="${this.escapeHtml(file.name)}">${this.escapeHtml(file.name)}</h3>
                        <p class="text-xs md:text-sm text-gray-500">${this.formatFileSize(file.size)} • ${this.formatDate(file.created_at)}</p>
                    </div>
                </div>
                <div class="flex justify-between">
                    <button class="download-btn text-blue-500 hover:text-blue-700 p-1" data-file-id="${file.id}" title="Download file">
                        <i class="fas fa-download text-sm"></i>
                    </button>
                    <button class="delete-file-btn text-red-500 hover:text-red-700 p-1" data-file-id="${file.id}" title="Delete file">
                        <i class="fas fa-trash text-sm"></i>
                    </button>
                </div>
            </div>
        `;
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
        });
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
            console.log(`Creating folder: ${name}`);
            
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
                console.log('File deleted successfully');
                
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
        setTimeout(() => {
            const modal = document.getElementById('uploadModal');
            if (modal) {
                modal.classList.add('hidden');
            }
        }, 2000);
    }
    
    addUploadProgressItem(filename) {
        const progressContainer = document.getElementById('uploadProgress');
        if (!progressContainer) return null;
        
        const item = document.createElement('div');
        item.className = 'upload-progress-item';
        item.innerHTML = `
            <div class="flex justify-between items-center mb-1">
                <span class="text-sm font-medium truncate mr-2" title="${this.escapeHtml(filename)}">${this.escapeHtml(filename)}</span>
                <span class="text-sm text-gray-500">0%</span>
            </div>
            <div class="w-full bg-gray-200 rounded-full h-2">
                <div class="bg-blue-500 h-2 rounded-full transition-all duration-300" style="width: 0%"></div>
            </div>
        `;
        progressContainer.appendChild(item);
        return item;
    }
    
    updateUploadProgress(item, progress, status) {
        if (!item) return;
        
        const progressBar = item.querySelector('.bg-blue-500');
        const progressText = item.querySelector('.text-gray-500');
        
        if (progressBar && progressText) {
            progressBar.style.width = `${progress}%`;
            progressText.textContent = status === 'Failed' ? 'Failed' : `${progress}%`;
            
            if (status === 'Failed') {
                progressBar.classList.remove('bg-blue-500');
                progressBar.classList.add('bg-red-500');
            } else if (status === 'Completed') {
                progressBar.classList.remove('bg-blue-500');
                progressBar.classList.add('bg-green-500');
            }
        }
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
        const grid = document.getElementById('fileGrid');
        if (loading) loading.classList.remove('hidden');
        if (grid) grid.classList.add('hidden');
    }
    
    hideLoading() {
        const loading = document.getElementById('loadingState');
        const grid = document.getElementById('fileGrid');
        if (loading) loading.classList.add('hidden');
        if (grid) grid.classList.remove('hidden');
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
