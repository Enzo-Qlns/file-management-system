import { auth } from './auth.js';

class FileManager {
    constructor() {
        this.files = [];
        this.error = null;
        this.baseUrl = 'http://localhost:3000';
    }

    async fetchFiles() {
        try {
            const response = await fetch(`${this.baseUrl}/api/files`, {
                headers: auth.getAuthHeader(),
            });

            if (!response.ok) {
                throw new Error('Failed to fetch files');
            }

            this.files = await response.json();
            this.error = null;
            return this.files;
        } catch (error) {
            console.error('Error fetching files:', error);
            this.error = error.message;
            throw error;
        }
    }

    async uploadFile(file, onProgress) {
        const formData = new FormData();
        formData.append('file', file);

        try {
            const xhr = new XMLHttpRequest();
            
            xhr.upload.addEventListener('progress', (event) => {
                if (event.lengthComputable) {
                    const progress = Math.round((event.loaded * 100) / event.total);
                    onProgress(progress);
                }
            });

            return new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status === 200) {
                        resolve();
                    } else {
                        reject(new Error('Upload failed'));
                    }
                };
                xhr.onerror = () => reject(new Error('Upload failed'));

                xhr.open('POST', `${this.baseUrl}/api/files/upload`);
                xhr.setRequestHeader('Authorization', `Bearer ${auth.token}`);
                xhr.send(formData);
            });
        } catch (error) {
            console.error('Error uploading file:', error);
            this.error = error.message;
            throw error;
        }
    }

    async downloadFile(fileId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/files/${fileId}`, {
                headers: auth.getAuthHeader(),
            });

            if (!response.ok) {
                throw new Error('Download failed');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            
            // Récupérer le nom du fichier depuis les métadonnées
            const file = this.files.find(f => f.id === fileId);
            link.download = file ? file.name : 'download';
            
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error downloading file:', error);
            this.error = error.message;
            throw error;
        }
    }

    async deleteFile(fileId) {
        try {
            const response = await fetch(`${this.baseUrl}/api/files?fileId=${fileId}`, {
                method: 'DELETE',
                headers: auth.getAuthHeader(),
            });

            if (!response.ok) {
                throw new Error('Delete failed');
            }

            this.files = this.files.filter(file => file.id !== fileId);
        } catch (error) {
            console.error('Error deleting file:', error);
            this.error = error.message;
            throw error;
        }
    }

    async createZip() {
        try {
            const response = await fetch(`${this.baseUrl}/api/files/zip`, {
                method: 'POST',
                headers: auth.getAuthHeader(),
            });

            if (!response.ok) {
                throw new Error('Failed to create ZIP');
            }

            const blob = await response.blob();
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'archive.zip';
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error creating ZIP:', error);
            this.error = error.message;
            throw error;
        }
    }
}

// Fonction utilitaire pour formater la taille des fichiers
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Octets';
    const k = 1024;
    const sizes = ['Octets', 'Ko', 'Mo', 'Go'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Créer l'instance du gestionnaire de fichiers
const fileManager = new FileManager();

// Fonction pour créer une carte de fichier
function createFileCard(file) {
    const card = document.createElement('div');
    card.className = 'file-card';
    
    const name = document.createElement('h3');
    name.textContent = file.name;
    
    const size = document.createElement('p');
    size.textContent = `Taille : ${formatFileSize(file.size)}`;
    
    const modified = document.createElement('p');
    modified.textContent = `Modifié le : ${new Date(file.modified).toLocaleString('fr-FR')}`;
    
    const actions = document.createElement('div');
    actions.className = 'file-actions';
    
    const downloadBtn = document.createElement('button');
    downloadBtn.textContent = 'Télécharger';
    downloadBtn.onclick = () => fileManager.downloadFile(file.id);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = 'Supprimer';
    deleteBtn.className = 'delete-btn';
    deleteBtn.onclick = () => {
        if (confirm(`Êtes-vous sûr de vouloir supprimer ${file.name} ?`)) {
            fileManager.deleteFile(file.id);
        }
    };
    
    actions.appendChild(downloadBtn);
    actions.appendChild(deleteBtn);
    
    card.appendChild(name);
    card.appendChild(size);
    card.appendChild(modified);
    card.appendChild(actions);
    
    return card;
}

// Fonction pour charger et afficher les fichiers
async function loadFiles() {
    try {
        const files = await fileManager.fetchFiles();
        const filesGrid = document.querySelector('.files-grid');
        filesGrid.innerHTML = '';
        
        files.forEach(file => {
            const card = createFileCard(file);
            filesGrid.appendChild(card);
        });
    } catch (error) {
        console.error('Error loading files:', error);
        alert('Failed to load files');
    }
}

// Exporter les fonctions et objets nécessaires
export { fileManager, loadFiles, createFileCard, formatFileSize }; 