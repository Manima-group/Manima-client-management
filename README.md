# Manima Client Hub

Manima's internal workspace for **leads, clients, quotations, invoices, projects, college and corporate training, the team, ideas**, and a **client portal** — in one app.

**Live:** https://hub.manima.co.in

| Layer | Technology | Hosted on |
|---|---|---|
| Frontend | React 18, TypeScript, Vite, plain CSS | Cloudflare Pages |
| Backend | Python 3.12, FastAPI, SQLAlchemy 2, JWT login | Render (Singapore) |
| Database | PostgreSQL | Supabase |
| Domain | `hub.manima.co.in` (CNAME at GoDaddy) | GoDaddy DNS |

📘 **Full step-by-step deployment guide: [DEPLOYMENT.md](DEPLOYMENT.md)**

---

## Features

| Section | What you can do |
|---|---|
| **Dashboard** | Earnings for any period (This month, Last month, Last 3 months, This FY, Last FY, All time, Custom), total earnings, outstanding, active projects, pipeline, training days left, revenue chart (services vs training), earnings by client, trainings in progress, recent documents, upcoming meetings, "needs attention" list |
| **Leads** | Pipeline New → Contacted → Proposal sent → Won, deal value, source, follow-up date; "Mark won" creates the client |
| **Clients** | One profile per client: billed and outstanding totals, full history, quotations, invoices, projects, trainings, client portal link |
| **Quotations** | Manima quotation template with live preview; any work/product/service (unit, qty, price, "quoted on selection"), GST excluded / added / none, discount, payment schedule presets, editable terms with `{client}`, signature; PDF, duplicate, convert to invoice, create project |
| **Invoices** | GST tax invoices (CGST + SGST), part or full payments, overdue detection, PDF |
| **Projects** | Task boards with assignees, progress and status |
| **Training** | Colleges and corporate: contact, programme, tools, day-by-day session plan, timing, trainees, pricing per head / per day / fixed; Proposal → Confirmed → Ongoing → Completed; "mark today's session taught", days left, payments, GST invoice |
| **Team** | Members, roles, earned / paid / owed, payouts, optional sign-in |
| **Ideas** | Quick capture, categories, pin to top, status New → Exploring → Doing → Done / Parked, search |
| **Settings** | Company details on documents, bank / UPI details, numbering (`MNM/{year}/001`, `INV-0001`), default GST, default terms, password |
| **Client portal** | `/portal/<secret link>`: clients see progress, view and sign quotations, view and download invoices |

---

## Run it on your computer

Requirements: Python 3.12, Node.js 20, PostgreSQL (pgAdmin optional).

**1. Create an empty database** named `manima-hub` (pgAdmin → Create → Database).

**2. Create `backend/.env`** (Git ignores it). One `export` per line, your own values:

```bash
export DATABASE_URL="postgresql+psycopg://postgres:<LOCAL_PG_PASSWORD>@localhost:5432/manima-hub"
export SEED_DEMO_DATA=false
export ADMIN_NAME="<your name>"
export ADMIN_EMAIL="<your email>"
export ADMIN_PASSWORD="<choose a password>"
export SECRET_KEY="<run: openssl rand -hex 32>"
```

**3. Start the backend** — on first start it creates all tables and your owner login:

```bash
cd backend
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
source .env
uvicorn app.main:app --reload
```

`http://127.0.0.1:8000/api/health` → `{"status":"ok"}` · API docs at `/docs`.
(`http://127.0.0.1:8000/` showing `Not Found` is normal — the API lives under `/api`.)

**4. Start the frontend** (second terminal):

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

**5. Tests:** `cd backend && pytest`

> Set `SEED_DEMO_DATA=true` (before the first start, on an empty database) to load sample clients, trainings and invoices for trying things out.

---

## How to deploy (summary)

The full walkthrough with screenshots-level detail, environment variables and troubleshooting is in **[DEPLOYMENT.md](DEPLOYMENT.md)**. In short:

1. **Supabase** — create a project (Singapore or Mumbai). Copy **Connect → Direct → Session pooler** string; change `postgresql://` to `postgresql+psycopg://`, insert the password, add `?sslmode=require`. Turn off the Data API (or enable RLS).
2. **Render** — New Web Service from this repo: Root Directory `backend`, build `pip install -r requirements.txt`, start `uvicorn app.main:app --host 0.0.0.0 --port $PORT`, region Singapore. Add `DATABASE_URL`, `SECRET_KEY`, `ADMIN_*`, `SEED_DEMO_DATA=false`, `CORS_ORIGINS`, `PYTHON_VERSION=3.12.7`. First start creates the tables.
3. **Cloudflare Pages** (Pages, not Workers) — root `frontend`, build `npm run build`, output `dist`, variables `API_URL=<Render URL>` and `NODE_VERSION=20`. `frontend/functions/api/[[path]].js` forwards `/api/*` to Render.
4. **Domain** — Pages → Custom domains → `hub.manima.co.in`; GoDaddy DNS → CNAME `hub` → `<project>.pages.dev`. Don't change nameservers.
5. **Keep awake** — cron-job.org pings `<Render URL>/api/health` every 10 minutes (Render free sleeps after 15 idle minutes).

**Updating:** `git push` to `main` → Render and Cloudflare redeploy automatically; new tables are created on startup.

---

## Project layout

```
backend/    FastAPI app (deployed to Render)
  app/        main.py, config.py, db.py, models.py, seed.py, routers/
  tests/      pytest suite
frontend/   React app (deployed to Cloudflare Pages)
  functions/  Cloudflare Pages Function: /api proxy
  src/        pages, components, styles
docker-compose.yml  optional single-server Docker setup (not used by the free deployment)
DEPLOYMENT.md       full deployment guide
```

---

## Security

- Never commit `.env`, `.venv`, `.aws`, database files or real connection strings.
- Keep secrets only in Render → Environment, Cloudflare → Variables and Secrets, and your local `backend/.env`.
- Change the owner password in **Settings** after the first sign-in; rotate any credential that was ever shared.
- See the checklist in [DEPLOYMENT.md → Security checklist](DEPLOYMENT.md#15-security-checklist).
