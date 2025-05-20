const fs = require('fs');
const path = require('path');

const CLIENT_DIR = path.join(__dirname, '..', 'client');
const PUBLIC_DIR = path.join(__dirname, '..', 'public');

// Fonction pour copier récursivement les fichiers
function copyDir(src, dest) {
    // Créer le dossier de destination s'il n'existe pas
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }

    // Lire le contenu du dossier source
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);

        if (entry.isDirectory()) {
            // Copier récursivement les sous-dossiers
            copyDir(srcPath, destPath);
        } else {
            // Copier les fichiers
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

// Copier les fichiers du client vers le dossier public
try {
    copyDir(CLIENT_DIR, PUBLIC_DIR);
    console.log('Files copied successfully to public directory');
} catch (error) {
    console.error('Error copying files:', error);
    process.exit(1);
} 