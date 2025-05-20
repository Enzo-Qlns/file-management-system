const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const url = require('url');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { deflateSync } = require('node:zlib');
const child_process = require("child_process");

// Configuration
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
const USERS_FILE = path.join(__dirname, 'data', 'users.json');
const FILES_METADATA = path.join(__dirname, 'data', 'files.json');
const CLIENT_DIR = path.join(__dirname, '../', 'client');

// Ensure directories exist
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}
if (!fs.existsSync(path.dirname(USERS_FILE))) {
    fs.mkdirSync(path.dirname(USERS_FILE), { recursive: true });
}
if (!fs.existsSync(CLIENT_DIR)) {
    fs.mkdirSync(CLIENT_DIR, { recursive: true });
}

// Load users
let users = {};
try {
    users = JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')).users;
} catch (error) {
    users = {
        admin: {
            password: crypto.createHash('sha256').update('admin').digest('hex'),
            quota: 100 * 1024 * 1024 // 100MB
        }
    };
    fs.writeFileSync(USERS_FILE, JSON.stringify({ users }, null, 2));
}

// Load or initialize files metadata
let filesMetadata = {};
try {
    filesMetadata = JSON.parse(fs.readFileSync(FILES_METADATA, 'utf8'));
} catch (error) {
    filesMetadata = {};
    fs.writeFileSync(FILES_METADATA, JSON.stringify(filesMetadata, null, 2));
}

// Fonction pour générer un ID unique
function generateFileId() {
    return crypto.randomBytes(16).toString('hex');
}

// Fonction pour obtenir le chemin du fichier à partir de son ID
function getFilePath(fileId) {
    const fileDir = path.join(UPLOAD_DIR, fileId);
    if (!fs.existsSync(fileDir)) {
        fs.mkdirSync(fileDir, { recursive: true });
    }
    return fileDir;
}

// JWT functions
function generateToken(username) {
    const header = { alg: 'HS256', typ: 'JWT' };
    const payload = { username, exp: Math.floor(Date.now() / 1000) + 3600 };

    const encodedHeader = Buffer.from(JSON.stringify(header)).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    const signature = crypto
        .createHmac('sha256', 'your-secret-key')
        .update(`${encodedHeader}.${encodedPayload}`)
        .digest('base64url');

    return `${encodedHeader}.${encodedPayload}.${signature}`;
}

function verifyToken(token) {
    try {
        const [header, payload, signature] = token.split('.');

        const expectedSignature = crypto
            .createHmac('sha256', 'your-secret-key')
            .update(`${header}.${payload}`)
            .digest('base64url');

        if (signature !== expectedSignature) {
            return null;
        }

        const decodedPayload = JSON.parse(Buffer.from(payload, 'base64url').toString());

        if (decodedPayload.exp < Math.floor(Date.now() / 1000)) {
            return null;
        }

        return decodedPayload;
    } catch (error) {
        return null;
    }
}

// Authentication middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Unauthorized' }));
        return false;
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);
    if (!payload) {
        res.writeHead(401);
        res.end(JSON.stringify({ error: 'Invalid token' }));
        return false;
    }

    req.user = payload;
    return true;
}

// Request handlers
const handlers = {
    // Authentication
    '/api/auth/login': {
        POST: (req, res) => {
            let body = '';
            req.on('data', chunk => {
                body += chunk.toString();
            });

            req.on('end', () => {
                try {
                    const { username, password } = JSON.parse(body);

                    if (users.find(user => user.username === username && user.password === password)) {
                        const token = generateToken(username);
                        res.writeHead(200, { 'Content-Type': 'application/json' });
                        res.end(JSON.stringify({ token, user: { username } }));
                    } else {
                        res.writeHead(401);
                        res.end(JSON.stringify({ error: 'Invalid credentials' }));
                    }
                } catch (error) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'Invalid request' }));
                }
            });
        }
    },

    // File operations
    '/api/files': {
        GET: (req, res) => {
            if (!authenticate(req, res)) return;

            const files = Object.entries(filesMetadata).map(([id, metadata]) => ({
                id,
                name: metadata.name,
                size: metadata.size,
                modified: metadata.modified
            }));

            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify(files));
        },
        DELETE: (req, res) => {
            if (!authenticate(req, res)) return;

            const parsedUrl = url.parse(req.url, true);
            const fileId = parsedUrl.query.fileId;

            if (!fileId) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'File ID is required' }));
                return;
            }

            const fileDir = getFilePath(fileId);
            const metadata = filesMetadata[fileId];

            if (!metadata) {
                res.writeHead(404);
                res.end(JSON.stringify({ error: 'File not found' }));
                return;
            }

            try {
                // Supprimer le fichier et son dossier
                fs.rmSync(fileDir, { recursive: true, force: true });

                // Supprimer les métadonnées
                delete filesMetadata[fileId];
                fs.writeFileSync(FILES_METADATA, JSON.stringify(filesMetadata, null, 2));

                // Envoyer la mise à jour via WebSocket
                broadcastFilesUpdate();

                res.writeHead(200);
                res.end(JSON.stringify({ message: 'File deleted successfully' }));
            } catch (error) {
                console.error('Error deleting file:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to delete file' }));
            }
        }
    },

    '/api/files/upload': {
        POST: (req, res) => {
            if (!authenticate(req, res)) return;

            const contentType = req.headers['content-type'];
            if (!contentType || !contentType.includes('multipart/form-data')) {
                res.writeHead(400);
                res.end(JSON.stringify({ error: 'Invalid content type' }));
                return;
            }

            const boundary = contentType.split('boundary=')[1];
            let fileData = Buffer.alloc(0);
            let filename = '';

            req.on('data', chunk => {
                fileData = Buffer.concat([fileData, chunk]);
            });

            req.on('end', () => {
                try {
                    const lines = fileData.toString().split('\r\n');
                    for (let i = 0; i < lines.length; i++) {
                        if (lines[i].includes('filename=')) {
                            filename = lines[i].split('filename=')[1].replace(/"/g, '');
                        }
                        if (lines[i] === '' && lines[i + 1]) {
                            const fileContent = fileData.slice(
                                fileData.indexOf(Buffer.from('\r\n\r\n')) + 4,
                                fileData.lastIndexOf(Buffer.from(`\r\n--${boundary}`))
                            );

                            // Vérifier le quota de l'utilisateur
                            const username = req.user.username;
                            const user = users.find(user => user.username === username);

                            if (!user) {
                                res.writeHead(401);
                                res.end(JSON.stringify({ error: 'User not found' }));
                                return;
                            }

                            const currentSize = Object.values(filesMetadata)
                                .reduce((total, file) => total + file.size, 0);

                            if (currentSize + fileContent.length > user.quota) {
                                res.writeHead(413);
                                res.end(JSON.stringify({ error: 'Storage quota exceeded' }));
                                return;
                            }

                            // Générer un ID unique pour le fichier
                            const fileId = generateFileId();
                            const fileDir = getFilePath(fileId);
                            const filePath = path.join(fileDir, filename);

                            // Sauvegarder le fichier
                            fs.writeFileSync(filePath, fileContent);

                            // Sauvegarder les métadonnées
                            filesMetadata[fileId] = {
                                name: filename,
                                size: fileContent.length,
                                modified: new Date().toISOString(),
                                owner: username
                            };
                            fs.writeFileSync(FILES_METADATA, JSON.stringify(filesMetadata, null, 2));

                            // Envoyer la mise à jour via WebSocket
                            setTimeout(() => {
                                try {
                                    broadcastFilesUpdate();
                                } catch (error) {
                                    console.error('Erreur lors de la mise à jour WebSocket après upload:', error);
                                }
                            }, 100);

                            res.writeHead(200);
                            res.end(JSON.stringify({
                                message: 'File uploaded successfully',
                                fileId,
                                name: filename
                            }));
                            break;
                        }
                    }
                } catch (error) {
                    console.error('Upload error:', error);
                    res.writeHead(500);
                    res.end(JSON.stringify({ error: 'Upload failed' }));
                }
            });
        }
    },

    '/api/files/zip': {
        POST: (req, res) => {
            if (!authenticate(req, res)) return;

            try {
                const files = Object.entries(filesMetadata);
                if (files.length === 0) {
                    res.writeHead(400);
                    res.end(JSON.stringify({ error: 'No files to archive' }));
                    return;
                }

                child_process.execSync(`zip -r archive.zip *`, {
                    cwd: UPLOAD_DIR
                });

                const zipPath = path.join(UPLOAD_DIR, 'archive.zip');
                const zipStream = fs.createReadStream(zipPath);

                res.writeHead(200, {
                    'Content-Type': 'application/zip',
                    'Content-Disposition': 'attachment; filename=archive.zip'
                });

                zipStream.pipe(res);
            } catch (error) {
                console.error('Error creating ZIP:', error);
                res.writeHead(500);
                res.end(JSON.stringify({ error: 'Failed to create ZIP archive' }));
            }
        }
    }
};

// Dynamic file handler
function handleFileRequest(req, res, fileId) {
    if (!authenticate(req, res)) return;

    const fileDir = getFilePath(fileId);
    const metadata = filesMetadata[fileId];

    if (!metadata) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
    }

    const filePath = path.join(fileDir, metadata.name);

    if (!fs.existsSync(filePath)) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'File not found' }));
        return;
    }

    const stat = fs.statSync(filePath);
    const fileStream = fs.createReadStream(filePath);

    res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename=${metadata.name}`,
        'Content-Length': stat.size
    });

    fileStream.pipe(res);
}

// Liste des extensions de fichiers autorisées pour le frontend
const ALLOWED_EXTENSIONS = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.mjs': 'text/javascript',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
};

// Create HTTP server
const server = http.createServer((req, res) => {
    const parsedUrl = url.parse(req.url, true);
    const pathname = parsedUrl.pathname;

    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
    }

    // Handle API routes
    if (pathname.startsWith('/api/')) {
        const handler = handlers[pathname]?.[req.method];
        if (handler) {
            handler(req, res);
        } else if (req.method === 'GET' && pathname.startsWith('/api/files/')) {
            const fileId = pathname.split('/api/files/')[1];
            handleFileRequest(req, res, fileId);
        } else {
            res.writeHead(404);
            res.end(JSON.stringify({ error: 'Not found' }));
        }
        return;
    }

    // Serve static files from public directory
    const ext = path.extname(pathname);
    
    // Si c'est la route racine, servir index.html
    if (pathname === '/' || pathname === '/index.html') {
        const indexPath = path.join(CLIENT_DIR, 'index.html');
        fs.readFile(indexPath, (error, content) => {
            if (error) {
                console.log(`File not found: ${indexPath}`, error);
                res.writeHead(404);
                res.end('Not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(content);
        });
        return;
    }

    // Pour les autres fichiers, vérifier l'extension
    const contentType = ALLOWED_EXTENSIONS[ext];
    if (!contentType) {
        // Ignorer les requêtes pour les fichiers système et les fichiers non supportés
        if (pathname.includes('.well-known') || pathname === '/favicon.ico') {
            res.writeHead(404);
            res.end();
            return;
        }
        console.log(`File type not allowed: ${pathname} (${ext})`);
        res.writeHead(403);
        res.end('File type not allowed');
        return;
    }

    const filePath = path.join(CLIENT_DIR, pathname);
    console.log(`Attempting to serve file: ${filePath}`);

    // Vérifier que le chemin demandé est bien dans le dossier public
    if (!filePath.startsWith(CLIENT_DIR)) {
        console.log(`Access denied: ${filePath} is outside of ${CLIENT_DIR}`);
        res.writeHead(403);
        res.end('Access denied');
        return;
    }

    fs.readFile(filePath, (error, content) => {
        if (error) {
            console.log(`File not found: ${filePath}`, error);
            res.writeHead(404);
            res.end('Not found');
            return;
        }

        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content);
    });
});

// Create WebSocket server
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    console.log('Nouvelle connexion WebSocket établie');
    
    // Envoyer la liste des fichiers dès la connexion
    broadcastFilesUpdate();

    ws.on('close', () => {
        console.log('Connexion WebSocket fermée');
    });

    ws.on('error', (error) => {
        console.error('Erreur WebSocket:', error);
    });
});

// Fonction pour envoyer la liste des fichiers via WebSocket
function broadcastFilesUpdate() {
    const files = Object.entries(filesMetadata).map(([id, metadata]) => ({
        id,
        name: metadata.name,
        size: metadata.size,
        modified: metadata.modified
    }));

    const message = JSON.stringify({
        type: 'file-update',
        files: files
    });

    console.log('Envoi de la mise à jour des fichiers à', wss.clients.size, 'clients');
    
    wss.clients.forEach(client => {
        if (client.readyState === 1) { // 1 = OPEN
            try {
                client.send(message);
            } catch (error) {
                console.error('Erreur lors de l\'envoi du message WebSocket:', error);
            }
        }
    });
}

// Start server
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
}); 