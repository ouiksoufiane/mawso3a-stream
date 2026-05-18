# الموسوعة ستريم

Plateforme de catalogue vidéo arabe — films et séries doublés en arabe et darija, auto-alimentée via YouTube API et n8n.

**Site live :** [mawso3a-stream.vercel.app](https://mawso3a-stream.vercel.app)

---

## Stack

| Couche | Technologie |
|---|---|
| Frontend | HTML/CSS/JS statique (vanilla, modules ES) |
| Backend | Vercel Serverless Functions (Node.js) |
| Base de données | Supabase (PostgreSQL + REST API + RLS) |
| Automatisation | n8n (7 workflows) |
| Déploiement | Vercel (GitHub auto-deploy) |

---

## Structure du projet

```
mawso3a-stream/
├── api/
│   ├── import.js              # Import YouTube + vérification liens
│   ├── status.js              # Health check
│   ├── report-dead-link.js   # Rapport lien mort (public)
│   ├── request-content.js    # Demande contenu (public)
│   └── admin/
│       └── moderate.js        # Modération admin (token requis)
├── css/
│   └── main.css               # Design system complet
├── js/
│   ├── api.js                 # Client Supabase REST
│   └── utils.js               # Helpers UI (badges, cards, CW, FAV)
├── n8n/
│   ├── 01-auto-discover-films.json
│   ├── 02-auto-discover-series.json
│   ├── 03-verify-library.json
│   ├── 04-metadata-enrichment.json
│   ├── 05-quality-checker.json
│   ├── 06-moderation.json
│   └── 07-trend-hunter.json
├── index.html                 # Accueil
├── films.html                 # Catalogue films
├── series.html                # Catalogue séries
├── series-detail.html         # Détail série + épisodes
├── watch.html                 # Lecteur
├── search.html                # Recherche
├── admin.html                 # Dashboard admin
├── legal.html                 # Légal (privacy, DMCA, CGU)
├── 404.html                   # Page 404
├── robots.txt                 # SEO
├── schema.sql                 # Schema Supabase complet
├── vercel.json                # Config Vercel
└── .env.example               # Variables d'environnement
```

---

## Variables d'environnement

Copier `.env.example` → configurer dans **Vercel Dashboard > Project > Settings > Environment Variables** :

| Variable | Description | Obligatoire |
|---|---|---|
| `SUPABASE_SERVICE_KEY` | Clé service Supabase (server-side uniquement) | ✅ |
| `N8N_SECRET` | Token Bearer pour les endpoints API | ✅ |
| `YOUTUBE_API_KEY` | Clé YouTube Data API v3 | ✅ (workflows) |
| `TMDB_API_KEY` | Clé TMDB pour enrichissement métadonnées | Optionnel |

Dans **n8n > Settings > Variables** :

| Variable | Valeur |
|---|---|
| `N8N_SECRET` | Même valeur que Vercel |
| `SUPABASE_ANON_KEY` | `sb_publishable_50j1Q_SJc1HA4fWXjO9jsA_wzsub0Az` |
| `SUPABASE_SERVICE_KEY` | Clé service Supabase |
| `TMDB_API_KEY` | Optionnel |

---

## Déploiement

### 1. Supabase

1. Créer un projet sur [supabase.com](https://supabase.com)
2. Ouvrir **SQL Editor**
3. Exécuter `schema.sql` en entier
4. Récupérer : Project URL, anon key, service role key

### 2. Vercel

```bash
# Lier le projet (déjà fait si clone depuis GitHub)
vercel link

# Configurer les variables
vercel env add SUPABASE_SERVICE_KEY
vercel env add N8N_SECRET
vercel env add YOUTUBE_API_KEY

# Déployer
vercel --prod
```

Ou simplement push sur `main` — GitHub déclenche auto-deploy.

### 3. n8n

1. Importer les fichiers `n8n/*.json` via **Workflows > Import from file**
2. Configurer les variables dans **Settings > Variables**
3. Activer les workflows souhaités

---

## Endpoints API

Tous les endpoints sauf `report-dead-link` et `request-content` requièrent `Authorization: Bearer <N8N_SECRET>`.

| Endpoint | Méthode | Description |
|---|---|---|
| `GET /api/import?action=status` | GET | Health check |
| `POST /api/import?action=search-youtube` | POST | Chercher sur YouTube |
| `POST /api/import?action=import-film` | POST | Importer un film |
| `POST /api/import?action=import-series` | POST | Créer une série |
| `POST /api/import?action=import-episode` | POST | Ajouter un épisode |
| `POST /api/import?action=import-batch` | POST | Import batch (max 100) |
| `POST /api/import?action=verify` | POST | Vérifier des liens YouTube |
| `POST /api/report-dead-link` | POST | Signaler lien mort (public) |
| `POST /api/request-content` | POST | Demander du contenu (public) |
| `GET /api/admin/moderate?action=list-pending` | GET | Lister pending |
| `POST /api/admin/moderate?action=approve` | POST | Approuver contenu |
| `POST /api/admin/moderate?action=hide` | POST | Masquer contenu |
| `POST /api/admin/moderate?action=update` | POST | Modifier métadonnées |

---

## Workflows n8n

| Fichier | Fréquence | Description |
|---|---|---|
| `01-auto-discover-films.json` | Toutes les 6h | Découverte films YouTube |
| `02-auto-discover-series.json` | Quotidien | Découverte séries YouTube |
| `03-verify-library.json` | Hebdomadaire | Vérifie liens morts |
| `04-metadata-enrichment.json` | Hebdomadaire | Enrichit avec TMDB |
| `05-quality-checker.json` | Quotidien | Score qualité → auto-publish |
| `06-moderation.json` | Quotidien | Détecte trailers/spam → masque |
| `07-trend-hunter.json` | Toutes les 12h | Import contenus tendances |

---

## Architecture de sécurité

- **Frontend** : utilise la clé anon Supabase (intentionnellement publique) — RLS limite à `status = 'active'`
- **Backend API** : utilise la service role key (variable d'env uniquement)
- **Admin** : protégé par `N8N_SECRET` Bearer token
- **RLS** : anonymes = lecture seule sur contenu actif ; service_role = tout
- **XSS** : toutes les valeurs HTML échappées via `esc()` dans utils.js
- **CORS** : restreint aux domaines Vercel du projet

---

## Fonctionnalités

- **Catalogue** : films + séries avec filtres (origine, langue, année, catégorie)
- **Lecteur** : YouTube embed, épisodes précédent/suivant, sidebar épisodes
- **Continuer à regarder** : localStorage, max 50 entrées
- **Favoris** : localStorage
- **Signalement** : lien mort → auto-masqué après 3 signalements
- **Recherche** : titre arabe + titre original, suggestions rapides
- **Admin** : stats, modération, import manuel, logs
- **Automatisation** : 7 workflows n8n, qualité auto, vérification hebdomadaire
- **SEO** : meta tags, OG, Twitter cards, robots.txt
- **i18n** : interface 100% arabe (RTL), contenu multilingue

---

## Prochaines améliorations

- [ ] Exécuter `schema.sql` dans Supabase (tables `dead_links`, `content_requests`, `admin_actions`, RPCs)
- [ ] Configurer `YOUTUBE_API_KEY` dans Vercel pour activer les workflows n8n
- [ ] Activer workflow 04 avec `TMDB_API_KEY` pour les posters manquants
- [ ] Ajouter Sitemap XML dynamique (`/api/sitemap.xml`)
- [ ] Authentification admin complète (Supabase Auth)
- [ ] Support Vimeo / Dailymotion / Archive.org comme sources alternatives
- [ ] Notifications push pour nouveaux épisodes (Web Push API)
- [ ] PWA (manifest.json + service worker)
- [ ] Page catégories dédiées (Top Maroc, Turc, Coréen, etc.)
