import { auth } from './auth.js';
import { fileManager, formatFileSize } from './files.js';
import { wsManager } from './websocket.js';

// DOM Elements
const loginPage = document.getElementById('loginPage');
const dashboardPage = document.getElementById('dashboardPage');
const loginForm = document.getElementById('loginForm');
const loginError = document.getElementById('loginError');
const usernameDisplay = document.getElementById('usernameDisplay');
const logoutBtn = document.getElementById('logoutBtn');
const fileUpload = document.getElementById('fileUpload');
const uploadBtn = document.getElementById('uploadBtn');
const createZipBtn = document.getElementById('createZipBtn');
const filesGrid = document.getElementById('filesGrid');
const errorMessage = document.getElementById('errorMessage');
const uploadDialog = document.getElementById('uploadDialog');
const uploadProgress = document.getElementById('uploadProgress');
const progressText = document.getElementById('progressText');
const closeUploadDialog = document.getElementById('closeUploadDialog');

// Initialize app
function init() {
    if (auth.isAuthenticated()) {
        showDashboard();
        wsManager.connect();
    } else {
        showLogin();
    }

    window.addEventListener('websocket-message', (event) => {
        const data = event.detail;
        if (data.type === 'file-update') {
            refreshFiles();
        }
    });
}

// Show/hide pages
function showLogin() {
    loginPage.classList.remove('hidden');
    dashboardPage.classList.add('hidden');
}

function showDashboard() {
    loginPage.classList.add('hidden');
    dashboardPage.classList.remove('hidden');
    refreshFiles();
}

// Load files
async function refreshFiles() {
    try {
        const files = await fileManager.fetchFiles();
        renderFiles(files);
    } catch (error) {
        showError(error.message);
    }
}

// Render files
function renderFiles(files) {
    filesGrid.innerHTML = files.map(file => `
        <div class="file-card">
            <h3>${file.name}</h3>
            <div class="file-info">
                <div>Taille : ${formatFileSize(file.size)}</div>
                <div>Modifié le : ${new Date(file.modified).toLocaleString('fr-FR')}</div>
            </div>
            <div class="file-actions">
                <button class="btn primary" onclick="handleDownload('${file.id}')">Télécharger</button>
                <button class="btn secondary" onclick="handleDelete('${file.id}')">Supprimer</button>
            </div>
        </div>
    `).join('');
}

// Show error message
function showError(message) {
    errorMessage.textContent = message;
    errorMessage.classList.remove('hidden');
    setTimeout(() => {
        errorMessage.classList.add('hidden');
    }, 5000);
}

// Event Handlers
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    try {
        await auth.login(username, password);
        showDashboard();
        wsManager.connect();
    } catch (error) {
        loginError.textContent = error.message;
    }
});

logoutBtn.addEventListener('click', () => {
    auth.logout();
    showLogin();
    wsManager.disconnect();
});

uploadBtn.addEventListener('click', () => {
    fileUpload.click();
});

fileUpload.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    uploadDialog.classList.remove('hidden');
    try {
        await fileManager.uploadFile(file, (progress) => {
            uploadProgress.style.width = `${progress}%`;
            progressText.textContent = `${progress}%`;
        });
        await refreshFiles();
    } catch (error) {
        showError(error.message);
    } finally {
        uploadDialog.classList.add('hidden');
        fileUpload.value = '';
    }
});

createZipBtn.addEventListener('click', async () => {
    try {
        await fileManager.createZip();
    } catch (error) {
        showError(error.message);
    }
});

closeUploadDialog.addEventListener('click', () => {
    uploadDialog.classList.add('hidden');
});

// Global handlers
window.handleDownload = async (fileId) => {
    try {
        await fileManager.downloadFile(fileId);
    } catch (error) {
        showError(error.message);
    }
};

window.handleDelete = async (fileId) => {
    if (!confirm('Êtes-vous sûr de vouloir supprimer ce fichier ?')) return;
    
    try {
        await fileManager.deleteFile(fileId);
        await refreshFiles();
    } catch (error) {
        showError(error.message);
    }
};

// Initialize the app
init(); 