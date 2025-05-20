# Système de Gestion de Fichiers Node.js

Un système de gestion de fichiers sécurisé construit avec Node.js, comprenant une API REST, des notifications WebSocket et une authentification utilisateur.

## Fonctionnalités

- Authentification utilisateur avec tokens JWT
- Opérations sur les fichiers (téléchargement, téléversement, suppression, liste)
- Notifications en temps réel via WebSocket
- Quotas de stockage par utilisateur
- Création d'archives ZIP (fonctionnalité bonus)
- Tests unitaires avec node:test

## Prérequis

- Node.js 18 ou supérieur
- npm ou yarn
- Outil en ligne de commande zip (pour la fonctionnalité ZIP)

## Installation

1. Cloner le dépôt :
```bash
git clone https://github.com/Enzo-Qlns/file-management-system.git
cd file-management-system
```

2. Installer les dépendances :
```bash
npm install
```

3. Créer les répertoires nécessaires :
```bash
mkdir -p uploads data
```

## Utilisation

1. Démarrer le serveur :
```bash
npm start
```

Pour le développement avec rechargement automatique :
```bash
npm run dev
```

2. Exécuter les tests :
```bash
npm test
```

## Points d'Accès API

### Authentification

- `POST /auth/login`
  - Corps : `{ "username": "string", "password": "string" }`
  - Retourne : `{ "token": "string", "user": { "id": number, "username": "string", "role": "string" } }`

### Fichiers

- `GET /files`
  - En-têtes : `Authorization: Bearer <token>`
  - Retourne : Liste des fichiers de l'utilisateur

- `POST /files/upload`
  - En-têtes : `Authorization: Bearer <token>`
  - Corps : Données de formulaire avec le fichier
  - Retourne : Confirmation de téléversement

- `GET /files/:filename`
  - En-têtes : `Authorization: Bearer <token>`
  - Retourne : Téléchargement du fichier

- `DELETE /files/:filename`
  - En-têtes : `Authorization: Bearer <token>`
  - Retourne : Confirmation de suppression

- `POST /files/zip`
  - En-têtes : `Authorization: Bearer <token>`
  - Retourne : Téléchargement de l'archive ZIP

## Événements WebSocket

Le serveur envoie les événements suivants aux clients connectés :

- `file_uploaded` : Lorsqu'un fichier est téléversé
- `file_deleted` : Lorsqu'un fichier est supprimé

## Fonctionnalités de Sécurité

- Authentification basée sur des tokens
- Accès aux fichiers spécifique à chaque utilisateur
- Quotas de stockage
- Limites de taille de fichier (50MB par fichier)

## Tests

Le projet inclut des tests unitaires pour les fonctionnalités principales. Exécutez-les avec :

```bash
npm run test
```

## Structure du Projet

```
.

├── server/             # Dossier serveur
  ├── data/             # Stockage des données
  │   ├── users.json    # Base de données utilisateurs
  │   └── files.json    # Base de données fichiers
  ├── uploads/          # Stockage des fichiers utilisateurs
  ├── package.json      # Fichier de configuration du projet
  ├── package-lock.json # Fichier de verrouillage des dépendances
  ├── server.js         # Fichier principal du serveur
  ├── move-client.js    # Fichier pour copier le client dans le dossier public
  ├── postman_collection.json    # Fichier pour la collection Postman
  └── .gitignore        # Fichier ignoré par git
├── client/           # Dossier client
  ├── index.html      # Page d'accueil
  ├── css/            # Dossier pour les styles CSS
  │   ├── style.css   # Fichier de style CSS
  ├── js/             # Dossier pour les scripts JavaScript
  │   ├── api.js      # Fichier pour l'API
  │   ├── auth.js     # Fichier pour l'authentification
  │   ├── files.js    # Fichier pour la gestion des fichiers
  │   └── websocket.js    # Fichier pour la gestion des WebSocket
└── .gitignore        # Fichier ignoré par git
└── README.md         # Fichier de documentation

```