# LandGuard NER 🏔️

**AI-Based Landslide Early Warning & Risk Monitoring System for North East India**

> SIH 2026 · Problem Statement #SIH26001 · MDoNER · Disaster Management

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16 (App Router) + Tailwind CSS v4 |
| Language | TypeScript + Python 3.14 |
| Package Manager | pnpm (workspace monorepo) |
| Database | Supabase (PostgreSQL + PostGIS + TimescaleDB) |
| Realtime | Supabase Realtime (WebSocket) |
| Storage | Cloudflare R2 (satellite imagery, photos) |
| CDN/Hosting | Cloudflare Pages + Workers |
| ML Service | Python FastAPI + Celery (background jobs) |
| Maps | MapLibre GL JS (free, no API key) |

---

## Project Structure

```
landguard-ner/
├── apps/
│   ├── web/              # Next.js 16 frontend
│   └── python-api/       # FastAPI + Celery ML service
├── supabase/
│   └── migrations/       # All SQL schemas + seed data
└── scripts/              # Data ingestion utilities
```

---

## Quick Start

### 1. Prerequisites

```bash
node >= 20, pnpm >= 9, python >= 3.11
```

### 2. Clone & Install

```bash
git clone <repo-url> landguard-ner
cd landguard-ner

# Install JS dependencies
pnpm install

# Install Python dependencies
cd apps/python-api
pip install -r requirements.txt
```

### 3. Environment Setup

```bash
# Copy env template
cp apps/web/.env.example apps/web/.env.local
# Fill in your Supabase, R2, Twilio values
```

### 4. Database Setup

```bash
# Option A: Supabase CLI (recommended)
pnpm supabase login
pnpm supabase link --project-ref YOUR_PROJECT_REF
pnpm supabase db push          # Apply all migrations

# Option B: Manual SQL execution
# Run files in supabase/migrations/ in order via Supabase Dashboard SQL editor
```

### 5. Start Development

```bash
# Terminal 1: Next.js
cd apps/web
pnpm dev                       # → http://localhost:3000

# Terminal 2: Python FastAPI
cd apps/python-api
uvicorn main:app --reload      # → http://localhost:8000/docs

# Terminal 3: Celery worker (optional for background jobs)
cd apps/python-api
celery -A workers.celery_app worker --beat --loglevel=info
```

---

## Key Features

### Novel — Not in Existing NER Systems

- 🛰️ **Sentinel-1 SAR Coherence Detection** — detects slope movement from orbit
- 🌧️ **72-Hour Antecedent Rainfall Scoring** — the #1 landslide predictor
- 🎭 **What-If Scenario Simulator** — drag sliders, see risk change live
- 🛣️ **Road Blockage + Alternate Routes** — all NER NHs/SHs
- 🗣️ **10+ NE Language Voice Alerts** — Assamese, Mizo, Manipuri, Bodo, Nepali
- 📱 **Offline-First PWA** — works without internet in remote valleys
- 🔌 **Public REST API** — for all 8 state SDMA integrations
- 🤖 **Auto-Generated AI Alerts** — ML triggers alert the moment threshold is crossed

### Open-Source Data Sources (All Free)

| Source | Data |
|--------|------|
| Copernicus Hub (ESA) | Sentinel-1 SAR + Sentinel-2 optical |
| Open-Meteo | Weather + rainfall (no API key) |
| NASA SRTM / OpenTopography | Digital Elevation Model |
| NASA COOLR | 50,000+ historical landslide events |
| OpenStreetMap | NER road network |
| NDMA Atlas | Hazard zone polygons |

---

## Database Schema

13 tables + views + RPCs. Key tables:

- `risk_zones` — spatial polygons of hazard areas (PostGIS)
- `risk_scores` — TimescaleDB time-series of ML predictions
- `latest_risk_scores` — materialized view (fast map rendering)
- `alerts` — multi-language alert records with dispatch status
- `sensor_readings` — IoT sensor time-series
- `field_reports` — crowdsourced geo-tagged observations

---

## API Reference

### Python FastAPI (`localhost:8000`)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/risk/compute` | POST | Compute risk for a zone (real) |
| `/risk/scenario` | POST | What-if simulation |
| `/risk/zones/{id}/history` | GET | Risk history for a zone |
| `/weather/ingest` | POST | Trigger weather ingestion |
| `/satellite/process` | POST | Process SAR scene |
| `/health` | GET | Service health check |

### Next.js API Routes (`localhost:3000/api`)

| Route | Method | Description |
|-------|--------|-------------|
| `/api/alerts` | GET/POST | Fetch/create alerts |
| `/api/reports` | POST | Submit field report (with R2 upload) |
| `/api/risk` | GET | Risk data by zone/district |
| `/api/sensors/[id]` | GET | Sensor readings |
| `/api/webhook/twilio` | POST | SMS status webhook |

---

## Adding New Features (Plugin Pattern)

1. Enable the feature flag in `supabase → feature_flags` table
2. Create the page: `apps/web/app/dashboard/your-feature/page.tsx`
3. Add the nav item to `Sidebar.tsx` with appropriate roles
4. Add any new DB tables via `supabase/migrations/00X_your_feature.sql`
5. Add any ML logic to `apps/python-api/routers/your_router.py`

---

## Deployment

### Cloudflare Pages (Frontend)

```bash
cd apps/web
pnpm build
# Connect GitHub → Cloudflare Pages with Next.js preset
# Set environment variables in Cloudflare dashboard
```

### Python API

```bash
# Option 1: Railway / Render (easy)
# Option 2: Docker
docker build -t landguard-api ./apps/python-api
docker run -p 8000:8000 landguard-api

# Option 3: Supabase Edge Functions (for lightweight endpoints)
```

---

*Built with ❤️ for the communities of North East India · SIH 2026*
