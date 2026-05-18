# الموسوعة ستريم

Catalogue vidéo arabe — films et séries doublés en arabe et darija, alimenté automatiquement via YouTube, Dailymotion, Archive.org et Vimeo.

**Site live :** [mawso3a-stream.vercel.app](https://mawso3a-stream.vercel.app)  
**GitHub :** [ouiksoufiane/mawso3a-stream](https://github.com/ouiksoufiane/mawso3a-stream)

---

## Stack

| Couche | Technologie |
|--------|-------------|
| Frontend | HTML/CSS/JS statique (vanilla ES modules, PWA) |
| Backend | Vercel Serverless Functions (Node.js ES modules) |
| Base de données | Supabase PostgreSQL + REST API + RLS |
| Automatisation | n8n cloud — 16 workflows |
| Déploiement | Vercel (GitHub auto-deploy) |

---

## Architecture pipeline

```
Sources externes (YouTube / Dailymotion / Archive.org / Vimeo)
    ↓  n8n workflows 01-06
discovery_candidates  (staging — n8n écrit ICI uniquement)
    ↓  n8n workflow 08 (duplicate detector)
    ↓  n8n workflow 09 (quality scorer — score /100)
    ↓  n8n workflow 10 (moderation agent)
    ↓  n8n workflow 11 (publisher)
content / episodes / content_sources  (production)
    ↓
Frontend public (anon — RLS read-only, status='active' uniquement)
```

Règle absolue : **n8n n'écrit jamais directement dans `content`.**

---

## Structure du projet

```
mawso3a-stream/
├── api/
│   ├── import.js              # Import YouTube + vérification liens (legacy)
│   ├── candidates.js          # Endpoint staging pipeline (submit/log/update-keyword)
│   ├── publish.js             # Scorer + publisher candidates → content
│   ├── status.js              # Health check
│   ├── report-dead-link.js    # Rapport lien mort (public)
│   ├── request-content.js     # Demande de contenu (public)
│   ├── refresh-metadata.js    # Enrichissement TMDB/OMDb
│   ├── sitemap.js             # Sitemap XML dynamique
│   └── admin/
│       └── moderate.js        # Dashboard admin (Bearer N8N_SECRET)
│
├── js/
│   ├── api.js                 # Client Supabase (anon, read-only)
│   └── utils.js               # esc(), badges, CW, FAV, cards, skeleton
│
├── css/main.css               # Design système complet (dark, RTL, Cairo)
│
├── index.html                 # Accueil (hero, sliders, stats)
├── films.html                 # Catalogue films (filtres, pagination)
├── series.html                # Catalogue séries (filtres, pagination)
├── film-detail.html           # Détail film + lecteur inline + JSON-LD
├── series-detail.html         # Détail série + liste épisodes + JSON-LD
├── watch.html                 # Lecteur épisodes + sidebar + JSON-LD
├── category.html              # Page catégorie universelle (origin/category/language/preset)
├── search.html                # Recherche multi-critères
├── request.html               # Formulaire demande de contenu
├── 404.html                   # Page erreur
├── legal.html                 # DMCA / Confidentialité / CGU
├── admin.html                 # Dashboard admin (protégé par N8N_SECRET)
│
├── n8n/                       # 16 workflows JSON (importer dans n8n)
│   ├── 00-seed-keywords.json
│   ├── 01-trend-hunter.json
│   ├── 02-youtube-discover-films.json
│   ├── 03-youtube-discover-series.json
│   ├── 04-dailymotion-discover.json
│   ├── 05-archive-org-discover.json
│   ├── 06-vimeo-discover.json
│   ├── 07-metadata-enrichment.json
│   ├── 08-duplicate-detector.json
│   ├── 09-quality-checker.json
│   ├── 10-moderation-agent.json
│   ├── 11-publisher.json
│   ├── 12-link-verifier.json
│   ├── 13-keyword-learning.json
│   ├── 14-provider-health-monitor.json
│   └── 15-sitemap-seo-refresh.json
│
├── schema.sql                 # Schéma Supabase complet (idempotent)
├── manifest.json              # PWA manifest
├── sw.js                      # Service Worker (cache-first static)
├── robots.txt                 # SEO robots
├── vercel.json                # Config Vercel (timeouts, headers CSP, rewrites)
├── .env.example               # Toutes les variables d'environnement
└── package.json
```

---

## Variables d'environnement

À configurer dans **Vercel Dashboard → Project → Settings → Environment Variables** :

| Variable | Obligatoire | Description |
|----------|-------------|-------------|
| `SUPABASE_SERVICE_KEY` | ✅ | Clé service Supabase (server-side uniquement) |
| `N8N_SECRET` | ✅ | Token Bearer pour tous les appels n8n → /api/* |
| `YOUTUBE_API_KEY` | ✅ | YouTube Data API v3 |
| `TMDB_API_KEY` | Optionnel | Enrichissement métadonnées (posters, synopsis) |
| `OMDB_API_KEY` | Optionnel | Métadonnées fallback (1000/jour gratuit) |
| `VIMEO_ACCESS_TOKEN` | Optionnel | Discovery Vimeo |
| `DAILYMOTION_API_KEY` | Optionnel | Discovery Dailymotion |
| `DAILYMOTION_SECRET` | Optionnel | Auth Dailymotion |

Les mêmes variables (`N8N_SECRET`, `YOUTUBE_API_KEY`, etc.) doivent aussi être configurées dans **n8n → Settings → Variables**.

---

## Base de données Supabase

### Tables principales
| Table | Description |
|-------|-------------|
| `content` | Films et séries (status=active visible public) |
| `episodes` | Épisodes rattachés à content |
| `content_sources` | Sources multi-plateforme par contenu/épisode |
| `discovery_candidates` | Staging pipeline (n8n → ici en premier) |
| `keyword_queue` | Mots-clés avec priorité auto-ajustée |
| `provider_health` | État des providers (YouTube, DM, Archive…) |
| `keyword_performance` | Log par run de keyword |
| `dead_links` | Liens signalés morts (3 rapports → hidden) |
| `content_requests` | Demandes utilisateurs |

### Appliquer le schéma
1. Aller sur [app.supabase.com](https://app.supabase.com) → SQL Editor
2. Copier-coller le contenu de `schema.sql` et exécuter

---

## Déploiement Vercel

```bash
# Clone + install
git clone https://github.com/ouiksoufiane/mawso3a-stream.git
cd mawso3a-stream
npm install

# Deploy
vercel --prod
```

Le déploiement est automatique à chaque push sur `main`.

---

## ZIP propre pour livraison

```bash
zip -r mawso3a-stream.zip . \
  --exclude "*.git*" \
  --exclude "*node_modules*" \
  --exclude "*.vercel*" \
  --exclude "*.DS_Store" \
  --exclude "*.env" \
  --exclude "*.env.local"
```

---

## Workflows n8n

Importer les 16 fichiers `n8n/*.json` dans n8n (Settings → Import workflow).

| # | Workflow | Déclencheur |
|---|----------|-------------|
| 00 | Seed keywords | Manuel |
| 01 | Trend Hunter | Quotidien |
| 02 | YouTube → Films | Toutes les 6h |
| 03 | YouTube → Séries | Toutes les 6h |
| 04 | Dailymotion | Quotidien |
| 05 | Archive.org | Hebdomadaire |
| 06 | Vimeo | Hebdomadaire |
| 07 | Metadata Enrichment | Quotidien |
| 08 | Duplicate Detector | Quotidien |
| 09 | Quality Checker | Quotidien |
| 10 | Moderation Agent | Quotidien |
| 11 | Publisher | Quotidien |
| 12 | Link Verifier | Quotidien |
| 13 | Keyword Learning | Hebdomadaire |
| 14 | Provider Health Monitor | Toutes les 6h |
| 15 | Sitemap & SEO Refresh | Hebdomadaire |

---

## Scoring qualité

| Points | Critère |
|--------|---------|
| +25 | Embeddable confirmé |
| +20 | Durée correcte (film ≥35min, épisode ≥15min) |
| +15 | Titre arabe présent |
| +10 | Poster/thumbnail |
| +8  | Année valide |
| +6  | Langue connue |
| +6  | Origine connue |
| +6  | Plateforme de confiance (YouTube) |
| +4  | Catégorie présente |

**Seuils :** ≥85 → `active`, 60-84 → `pending_review`, <60 → `rejected`  
**Rejet automatique :** non-embeddable, durée trop courte, trailer détecté

---

## Sécurité

- Aucun secret dans le code — variables d'environnement uniquement
- RLS Supabase : anon = lecture seule `status='active'`
- Admin protégé par Bearer `N8N_SECRET`
- CSP, X-Frame-Options, X-XSS-Protection dans `vercel.json`
- Fonction `esc()` sur toutes les données externes (protection XSS)
- `SUPABASE_SERVICE_KEY` jamais exposé au frontend
