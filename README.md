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
| `SUPABASE_ANON_KEY` | Clé JWT anon — Supabase Dashboard > Settings > API > `anon public` |
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
| `POST /api/import?action=import-episode` | POST | Ajouter un épisode (ID série requis) |
| `POST /api/import?action=smart-import-episode` | POST | Import épisode avec détection série automatique |
| `POST /api/import?action=import-batch` | POST | Import batch (max 100) |
| `POST /api/import?action=verify` | POST | Vérifier des liens YouTube |
| `POST /api/refresh-metadata` | POST | Rafraîchir métadonnées YouTube/TMDB |
| `POST /api/report-dead-link` | POST | Signaler lien mort — auto-masqué après 3 signalements (public) |
| `POST /api/request-content` | POST | Demander du contenu (public) |
| `GET /sitemap.xml` | GET | Sitemap XML dynamique (rewrite → `/api/sitemap`) |
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

- **Frontend** : utilise la clé anon Supabase (intentionnellement publique) — RLS `USING (status = 'active')` : seul le contenu actif est exposé
- **Backend API** : utilise la service role key (variable d'env uniquement, jamais dans le frontend)
- **Admin** : toutes les mutations passent par `/api/admin/moderate` avec `Authorization: Bearer <N8N_SECRET>`
- **RLS** : `anon` = SELECT WHERE `status = 'active'` uniquement ; épisodes accessibles seulement si la série parente est active ; `service_role` = accès total
- **XSS** : toutes les valeurs HTML échappées via `esc()` (admin.html inline + utils.js)
- **CORS** : restreint au domaine Vercel du projet uniquement
- **Dead links** : `POST /api/report-dead-link` appelle la fonction SQL `report_dead_link()` — atomique, incrémente le compteur, masque auto après 3 signalements

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

- [x] Exécuter `schema.sql` dans Supabase (tables + RPCs)
- [x] Sitemap XML dynamique — `GET /sitemap.xml` → `/api/sitemap` (rewrite Vercel)
- [x] Endpoint `report-dead-link` atomique via RPC SQL — auto-masquage après 3 signalements
- [ ] Configurer `YOUTUBE_API_KEY` dans Vercel pour activer les workflows n8n
- [ ] Activer workflow 04 avec `TMDB_API_KEY` pour les posters manquants
- [ ] Authentification admin complète (Supabase Auth)
- [ ] Support multi-sources (Dailymotion, Archive.org, Vimeo) — infrastructure prête dans la table `sources` du schéma ; workflows n8n à étendre
- [ ] Notifications push pour nouveaux épisodes (Web Push API)
- [ ] PWA (manifest.json + service worker)
- [ ] Page catégories dédiées (Top Maroc, Turc, Coréen, etc.)

---

## Sources de contenu

La table `sources` du schéma est prête pour gérer plusieurs plateformes. Actuellement seul YouTube est utilisé.

| Plateforme | Statut | Type | Notes |
|---|---|---|---|
| YouTube | ✅ Actif | chaînes / playlists / recherche | Workflows 01, 02, 07 |
| TMDB | ⚙️ Optionnel | enrichissement métadonnées | Workflow 04, endpoint `/api/refresh-metadata` |
| Dailymotion | 🔜 Prévu | embed | Structure `sources` prête, workflow à créer |
| Archive.org | 🔜 Prévu | films domaine public | Structure `sources` prête, workflow à créer |
| Vimeo | 🔜 Prévu | embed | Structure `sources` prête, workflow à créer |
