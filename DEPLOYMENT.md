# Manima Client Hub — Deployment Guide

This document explains **how Manima Client Hub is built, where each part runs, and exactly how it was deployed**, step by step. Follow it to redeploy from scratch, to set up a second copy, or to understand what happens when you push code.

> **No secrets in this document.** Every password, key and connection string is shown as a placeholder like `<YOUR_DB_PASSWORD>`. Keep the real values only in Render's **Environment** tab, in Cloudflare's **Variables and Secrets**, and in your local `backend/.env` (which Git ignores). Never commit them, and never paste them into chats or screenshots.

---

## Table of contents

1. [How the app is put together](#1-how-the-app-is-put-together)
2. [Where each part is hosted](#2-where-each-part-is-hosted)
3. [Repository layout](#3-repository-layout)
4. [Environment variables](#4-environment-variables)
5. [Step 1 — Run it on your computer](#5-step-1--run-it-on-your-computer)
6. [Step 2 — Database on Supabase](#6-step-2--database-on-supabase)
7. [Step 3 — Backend on Render](#7-step-3--backend-on-render)
8. [Step 4 — Frontend on Cloudflare Pages](#8-step-4--frontend-on-cloudflare-pages)
9. [Step 5 — Custom domain from GoDaddy](#9-step-5--custom-domain-from-godaddy)
10. [Step 6 — Keep the backend awake](#10-step-6--keep-the-backend-awake)
11. [Shipping updates](#11-shipping-updates)
12. [Database: tables, security, backups](#12-database-tables-security-backups)
13. [Troubleshooting](#13-troubleshooting)
14. [Costs, limits and when to upgrade](#14-costs-limits-and-when-to-upgrade)
15. [Security checklist](#15-security-checklist)
16. [Alternative: one server with Docker](#16-alternative-one-server-with-docker)

---

## 1. How the app is put together

The app has three parts:

| Part | Technology | What it does |
|---|---|---|
| **Frontend** | React 18 + TypeScript + Vite | The screens: dashboard, quotations, invoices, training, ideas, client portal. Runs in the browser. |
| **Backend** | Python FastAPI + SQLAlchemy | Login, calculations (GST, totals, training fees), reading and writing data. Every API path starts with `/api`. |
| **Database** | PostgreSQL | Stores everything: clients, leads, quotations, invoices, trainings, team, ideas, settings. |

How a request travels:

```
Browser
  │  https://hub.manima.co.in/...            (screens)
  │  https://hub.manima.co.in/api/...        (data)
  ▼
Cloudflare Pages
  ├─ serves the React screens (static files from frontend/dist)
  └─ functions/api/[[path]].js  → forwards every /api/* request ─┐
                                                                  ▼
                                                   Render (FastAPI backend)
                                                                  │  DATABASE_URL
                                                                  ▼
                                                   Supabase (PostgreSQL)
```

Key ideas:

- The frontend always calls **`/api/...` on its own domain**. Locally, Vite forwards those calls to `localhost:8000`. Online, a tiny Cloudflare Pages Function forwards them to Render. Because of this, the browser never talks to Render directly, and there are no CORS problems.
- The backend finds the database through **one setting: `DATABASE_URL`**. Change it, and the same code uses a different database.
- On its **first start against an empty database**, the backend creates all the tables and the owner login automatically. No SQL needs to be run by hand.

---

## 2. Where each part is hosted

| Part | Service | Plan | Region | Address |
|---|---|---|---|---|
| Frontend | Cloudflare Pages | Free | Global edge | `https://hub.manima.co.in` (also `https://manima-client-management.pages.dev`) |
| Backend | Render Web Service | Free | Singapore | `https://manima-client-management.onrender.com` |
| Database | Supabase | Free | Mumbai (`ap-south-1`) | private connection string |
| Domain | GoDaddy | — | — | `manima.co.in` (DNS stays at GoDaddy) |
| Code | GitHub | Free | — | `Manima-group/Manima-client-management` |
| Keep-awake ping | cron-job.org | Free | — | calls `/api/health` every 10 minutes |

> **Region tip:** keep the backend and database close together. Render has no India region (Singapore is closest). Supabase **Singapore (`ap-southeast-1`)** is the fastest match for Render Singapore; Mumbai works but adds a little delay on busy pages. A Supabase project's region cannot be changed after it is created.

---

## 3. Repository layout

```
manima-client-management/
├── backend/                     ← deployed to Render (Root Directory = backend)
│   ├── app/
│   │   ├── main.py              ← FastAPI app; creates tables + owner login on startup
│   │   ├── config.py            ← reads environment variables
│   │   ├── db.py                ← database connection (uses DATABASE_URL)
│   │   ├── models.py            ← all tables
│   │   ├── seed.py              ← first-run owner login, settings, optional demo data
│   │   └── routers/             ← API endpoints (clients, quotations, invoices, training, ideas…)
│   ├── tests/test_api.py        ← run with: pytest
│   └── requirements.txt
├── frontend/                    ← deployed to Cloudflare Pages (Root directory = frontend)
│   ├── functions/api/[[path]].js← Cloudflare Pages Function: forwards /api/* to Render
│   ├── public/                  ← logo, signature
│   ├── src/                     ← React app
│   ├── package.json
│   └── vite.config.ts           ← local dev: forwards /api to localhost:8000
├── docker-compose.yml           ← only for the optional single-server Docker setup
├── .env.example                 ← template for the Docker setup only
├── DEPLOYMENT.md                ← this file
└── README.md
```

---

## 4. Environment variables

### Backend (local `backend/.env`, and Render → Environment)

| Variable | Example value (placeholder) | Purpose |
|---|---|---|
| `DATABASE_URL` | `postgresql+psycopg://<user>:<password>@<host>:5432/<database>?sslmode=require` | Which database to use. Must start with `postgresql+psycopg://`. |
| `SECRET_KEY` | output of `openssl rand -hex 32` | Signs login tokens. Changing it signs everyone out. |
| `ADMIN_NAME` | `Sai Naveen` | Owner's name, used on first start only. |
| `ADMIN_EMAIL` | `<owner email>` | Owner's login email, used on first start only. |
| `ADMIN_PASSWORD` | `<a strong password>` | Owner's first password, used on first start only. Change it later in **Settings**. |
| `SEED_DEMO_DATA` | `false` | `true` loads sample clients and invoices on first start. Keep `false` for real use. |
| `CORS_ORIGINS` | `https://hub.manima.co.in` | Allowed browser origin. |
| `PYTHON_VERSION` | `3.12.7` | Render only: which Python to use. |

> `ADMIN_*` values are used **only when the database has no users yet**. After the owner login exists, changing them does nothing. Change the password from the app's **Settings** page instead.

### Frontend (Cloudflare Pages → Settings → Variables and Secrets)

| Variable | Value | Purpose |
|---|---|---|
| `API_URL` | `https://manima-client-management.onrender.com` | Where the `/api` proxy forwards requests. No `/` at the end, no `/api`. |
| `NODE_VERSION` | `20` | Node.js version for the build. |

> Cloudflare Pages reads variables **only when it builds**. After adding or changing one, redeploy (Deployments → ⋯ → Retry deployment).

### `.env` vs `.venv`

- **`backend/.env`** — your settings file (the variables above). Only on your computer. Ignored by Git.
- **`backend/.venv`** — installed Python packages. Never edit, never commit.
- Your **data** lives in the database, not in `.env`.

---

## 5. Step 1 — Run it on your computer

Use this to test changes before deploying. You need Python 3.12, Node.js 20 and PostgreSQL (with pgAdmin, optional).

### 5.1 Create an empty local database

In pgAdmin: right-click your server → **Create → Database…** → name it `manima-hub` → **Save**.
(Or in the Query Tool: `CREATE DATABASE "manima-hub";`)

### 5.2 Save your local settings

```bash
cd backend
nano .env
```

```bash
export DATABASE_URL="postgresql+psycopg://postgres:<LOCAL_PG_PASSWORD>@localhost:5432/manima-hub"
export SEED_DEMO_DATA=false
export ADMIN_NAME="Sai Naveen"
export ADMIN_EMAIL="<owner email>"
export ADMIN_PASSWORD="<local password>"
export SECRET_KEY="<run: openssl rand -hex 32>"
```

> Put **one `export` per line**. Writing them all on one line breaks the command.

### 5.3 Start the backend (creates the tables)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
source .env
uvicorn app.main:app --reload
```

Wait for `Application startup complete`. In pgAdmin, refresh `manima-hub` → **Schemas → public → Tables**: you should see 20 tables (clients, ideas, invoices, leads, quotations, settings, trainings, users, …).

Check:
- `http://127.0.0.1:8000/api/health` → `{"status":"ok"}`
- `http://127.0.0.1:8000/docs` → API documentation
- `http://127.0.0.1:8000/` → `{"detail":"Not Found"}` — **this is normal**; the backend only answers under `/api`.

### 5.4 Start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173` and sign in with your local `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

### 5.5 Run the tests

```bash
cd backend && source .venv/bin/activate && pytest
```

---

## 6. Step 2 — Database on Supabase

### 6.1 Create the project

1. Sign in at **supabase.com** (with GitHub).
2. **New project**:
   - **Name:** `manima-client-management`
   - **Database password:** click **Generate**, save it in a password manager. Prefer letters and numbers only.
   - **Region:** **Southeast Asia (Singapore)** recommended (or South Asia (Mumbai)). Double-check before creating — it cannot be changed later.
   - **Plan:** Free
3. Wait ~2 minutes until the project is **Healthy**.

### 6.2 Get the right connection string

1. Click **Connect** (top bar).
2. Choose the **Direct** tab ("Connection string"), then set **Method → Session pooler**.
   - Not "Direct connection": that one is IPv6-only on the free plan and Render cannot reach it.
   - Ignore the **Framework** tab (that is for Next.js apps).
3. Copy the URI. It looks like:

   ```
   postgresql://postgres.<PROJECT_REF>:[YOUR-PASSWORD]@aws-<N>-<REGION>.pooler.supabase.com:5432/postgres
   ```

4. Turn it into `DATABASE_URL` with three edits:
   - replace `[YOUR-PASSWORD]` with the real password (remove the brackets),
   - change `postgresql://` to `postgresql+psycopg://`,
   - add `?sslmode=require` at the end.

   ```
   postgresql+psycopg://postgres.<PROJECT_REF>:<YOUR_DB_PASSWORD>@aws-<N>-<REGION>.pooler.supabase.com:5432/postgres?sslmode=require
   ```

> Copy the host **exactly** from Supabase (`aws-0-…` or `aws-1-…`). A wrong host gives `tenant/user … not found`.
> If the password contains `@ # / :`, URL-encode them (`%40 %23 %2F %3A`) or reset to a letters-and-numbers password.

### 6.3 Create the tables

Either let Render do it on its first deploy (Step 3), or do it from your computer once:

```bash
cd backend
source .venv/bin/activate
source .env
export DATABASE_URL="<SUPABASE DATABASE_URL from 6.2>"
uvicorn app.main:app --reload
```

When you see `Application startup complete`, refresh Supabase → **Table Editor**: the 20 tables appear, empty, with one row in `users` (the owner). Press **Ctrl + C**. (The `export` only affects that terminal; your `.env` still points to the local database.)

### 6.4 Lock down Supabase's public API

Supabase automatically exposes tables through a public REST API. This app does **not** use it (the backend connects directly as the table owner), so switch it off — otherwise tables show **UNRESTRICTED / RLS disabled**.

**Option A (recommended):** Project Settings → **Data API** → turn off **Enable Data API** (or remove `public` from Exposed schemas) → Save. Covers future tables too.

**Option B:** SQL Editor → New query → Run:

```sql
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT tablename FROM pg_tables WHERE schemaname = 'public' LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tablename);
  END LOOP;
END $$;
```

With RLS on and no policies, the public API sees nothing, while the backend keeps full access. Re-run it whenever a new table is added.

---

## 7. Step 3 — Backend on Render

1. Sign in at **render.com** (with GitHub) → **New → Web Service** → select the repository.
2. Settings:

   | Field | Value |
   |---|---|
   | Name | `manima-client-management` |
   | Language | Python 3 |
   | Branch | `main` |
   | Region | **Singapore (Southeast Asia)** |
   | Root Directory | **`backend`** (exactly this — not `backend/app/routers`) |
   | Build Command | `pip install -r requirements.txt` |
   | Start Command | `uvicorn app.main:app --host 0.0.0.0 --port $PORT` |
   | Instance Type | Free |

   After setting Root Directory, the command boxes should start with `backend/ $`.

3. **Environment Variables** — add the backend variables from [section 4](#4-environment-variables). Paste **only the value** in each box (for `DATABASE_URL`: no `DATABASE_URL=`, no quotes, nothing after `?sslmode=require`).
4. **Deploy web service**. A good deploy log ends with:

   ```
   ==> Build successful 🎉
   INFO:     Application startup complete.
   ==> Your service is live 🎉
   ```

   `"HEAD / HTTP/1.1" 404 Not Found` lines are Render's own checks on `/` and are harmless.

5. Check `https://<service>.onrender.com/api/health` → `{"status":"ok"}`.

---

## 8. Step 4 — Frontend on Cloudflare Pages

### 8.1 The `/api` proxy file (already in the repo)

`frontend/functions/api/[[path]].js` forwards every `/api/*` request to the backend set in `API_URL`:

```js
export async function onRequest({ request, env }) {
  const url = new URL(request.url);
  const target = env.API_URL.replace(/\/$/, "") + url.pathname + url.search;
  return fetch(new Request(target, request));
}
```

> If you ever need to create it from the terminal, use a heredoc and keep the quotes around the file name (the `[[ ]]` confuses bash):
>
> ```bash
> mkdir -p frontend/functions/api
> cat > 'frontend/functions/api/[[path]].js' <<'EOF'
> ...file contents...
> EOF
> ```
>
> Don't paste JavaScript straight into the terminal — bash will throw `syntax error near unexpected token '('`.

### 8.2 Create the Pages project

> ⚠️ Use **Pages**, not Workers. The default "Create an app" screen creates a **Worker**, which ignores the `functions/` folder. On that screen, click the small link **"Need to use the legacy Pages workflow? → Continue to Pages"**, or open `Workers & Pages → Create → Pages`.

1. **Import an existing Git repository** → select the repository → **Begin setup**.
2. On **"Set up builds and deployments"**:

   | Field | Value |
   |---|---|
   | Project name | `manima-client-management` |
   | Production branch | `main` |
   | Framework preset | None (or Vite) |
   | Build command | `npm run build` |
   | Build output directory | `dist` |
   | Root directory (advanced) | **`frontend`** |

3. **Environment variables (advanced):** `API_URL` and `NODE_VERSION` from [section 4](#4-environment-variables).
4. **Save and Deploy** (~2 minutes).

If the project was ever created with empty settings: **Settings → Build → Build configuration → Edit** (set the values above), **Settings → Variables and Secrets** (add the variables), then **Deployments → ⋯ → Retry deployment**.

A good build log shows `npm run build`, `✓ built in …`, and a line about compiling **Functions**.

5. Open `https://<project>.pages.dev`, sign in. The first sign-in after a quiet period can take up to a minute (Render waking up — see Step 6).

---

## 9. Step 5 — Custom domain from GoDaddy

DNS stays at GoDaddy; we only add one subdomain, `hub`.

### 9.1 Tell Cloudflare Pages about the domain

1. Cloudflare → **Workers & Pages** → click the project **manima-client-management** → **Custom domains** tab.
2. **Set up a custom domain** → `hub.manima.co.in` → **Continue**.
3. On **Configure DNS**, choose **My DNS provider / Begin CNAME setup** — **not** "transfer DNS / change nameservers".
4. **Activate domain**.

> ⚠️ Don't use the **"Connect your domain"** screen (Account home → Domains / Add a site). That moves the whole `manima.co.in` to Cloudflare and asks you to change nameservers — it can break the main website and email.

### 9.2 Add the CNAME in GoDaddy

GoDaddy → **My Products → manima.co.in → DNS → Add New Record**:

| Type | Name | Value | TTL |
|---|---|---|---|
| CNAME | `hub` | `manima-client-management.pages.dev` | default |

- No `https://`, no trailing `/` in the value (GoDaddy adds a final `.` itself — that's fine).
- Make sure there is only **one** `hub` record (check every page of the record list).
- Do **not** change the nameservers or the `@` / `www` / email records.

### 9.3 Wait and verify

- Cloudflare status goes **Verifying → Active** (usually 10–30 minutes; the SSL certificate can occasionally take a few hours).
- Check propagation at `https://dnschecker.org/#CNAME/hub.manima.co.in`.
- Then open `https://hub.manima.co.in`.

Both addresses keep working and show the same app and data. Use `hub.manima.co.in` day to day — client portal links are built from the address you are using.

---

## 10. Step 6 — Keep the backend awake

Render's free plan **switches the backend off after 15 minutes with no visits** and needs ~30–60 seconds to start again. A request that arrives during that start-up can fail with Render's **502 Bad Gateway** page.

Fix (free): ping the health endpoint every 10 minutes.

1. Sign up at **cron-job.org** → **Cronjobs → Create cronjob**.
2. **Title:** `Manima Hub keep-awake`
3. **URL:** `https://manima-client-management.onrender.com/api/health`
4. **Schedule:** every 10 minutes → **Create**.
5. After 20 minutes, **History** should show `200 OK`.

One service running all month (~744 h) fits Render's 750 free hours.

---

## 11. Shipping updates

Both Render and Cloudflare Pages watch the `main` branch:

```bash
git add .
git commit -m "Describe the change"
git push
```

- Render rebuilds the backend (2–4 min). On startup, any **new tables** are created automatically.
- Cloudflare Pages rebuilds the frontend (~2 min).
- Watch progress in Render → **Events/Logs** and Cloudflare → **Deployments**.

Before pushing, test locally (Step 1) and run `pytest`.

### What must never be pushed

`.gitignore` already excludes these — keep it that way:

```
.env  .env.*  (except .env.example)
.venv/  node_modules/  dist/  *.db  __pycache__/
.aws/  .codex/
```

If something private was ever pushed, removing it later doesn't erase it from Git history — **rotate that credential** (create a new one, delete the old one).

---

## 12. Database: tables, security, backups

### Tables are created by the app

On startup the backend runs `Base.metadata.create_all(...)`:

- creates **new** tables that don't exist yet (e.g. `ideas` when that feature was added),
- does **not** change existing tables (new or renamed columns).

Before changing an existing model, add database migrations (Alembic) so production data is updated safely.

### Security

- Keep Supabase's Data API off or RLS on ([6.4](#64-lock-down-supabases-public-api)).
- Only the backend should hold `DATABASE_URL`.

### Backups

The Supabase free plan has **no automatic backups**. Export regularly from your computer (needs the PostgreSQL client tools):

```bash
pg_dump "postgresql://postgres.<PROJECT_REF>:<YOUR_DB_PASSWORD>@<POOLER_HOST>:5432/postgres" \
  --no-owner --no-privileges > manima-backup-$(date +%F).sql
```

(Use the plain `postgresql://` form here — `+psycopg` is only for the Python app.) Store the file somewhere safe (e.g. Google Drive).

Restore into an empty database:

```bash
psql "<TARGET CONNECTION STRING>" -f manima-backup-YYYY-MM-DD.sql
```

### Supabase pausing

Free projects pause after **7 days of low activity** (you get a warning email). Restore from the Supabase dashboard. Regular use of the app prevents this.

---

## 13. Troubleshooting

| What you see | Cause | Fix |
|---|---|---|
| `{"detail":"Not Found"}` on the backend's home page | Normal — only `/api/...` paths exist | Open `/api/health` or `/docs` |
| Sign-in shows **"Something went wrong (502)"** and the response is Render's "502 Bad Gateway" page | Backend asleep / starting, a failed deploy, or a crash | Open `/api/health` and wait a minute; check Render → Events/Logs; set up the keep-awake ping |
| `tenant/user postgres.<ref> not found` | Wrong pooler host (`aws-0` vs `aws-1`) or wrong username | Copy the Session pooler string exactly from Supabase **Connect** |
| `password authentication failed` | Wrong / reset Supabase password | Update `DATABASE_URL` in Render → Environment |
| `Network is unreachable` / timeout to Supabase | Used "Direct connection" (IPv6) | Use the **Session pooler** string |
| Render build: `requirements.txt` not found | Root Directory wrong | Set Root Directory to `backend` |
| Render startup error mentioning `DATABASE_URL=` or `uvicorn` | Extra text pasted into the value box | Paste only the `postgresql+psycopg://…?sslmode=require` value |
| Table Editor shows **UNRESTRICTED / RLS disabled** | Supabase public API exposed | Section [6.4](#64-lock-down-supabases-public-api) |
| Pages site loads but `/api` calls fail | `API_URL` missing/wrong, or variable added after the last build | Fix `API_URL`, then **Retry deployment** |
| Cloudflare set-up screen says "Configure your **Worker** project" | Wrong flow (Workers) | Use **Continue to Pages** |
| `hub.manima.co.in` doesn't open | Domain not added in Pages, CNAME missing/duplicated, or still propagating | Section [9](#9-step-5--custom-domain-from-godaddy); check dnschecker.org |
| `bash: export: 'app.main:app': not a valid identifier` | Several `export`s and `uvicorn` on one line | One command per line |
| `bash: syntax error near unexpected token '('` | JavaScript pasted into the terminal | Create files with an editor or a heredoc |
| New feature's table missing online | Backend not redeployed after the push | Check Render deploy; tables are created on startup |

---

## 14. Costs, limits and when to upgrade

| Part | Now | Limit on free | Upgrade when… | Rough cost |
|---|---|---|---|---|
| Cloudflare Pages | Free | generous | not needed | — |
| Render | Free | sleeps after 15 min idle, 0.1 CPU, 750 h/month | clients use the portal daily, or the first load feels slow | Starter ~$7/month |
| Supabase | Free | 500 MB, pauses after 7 days idle, no backups | data grows near 500 MB, or you want daily backups | Pro ~$25/month |
| Domain | GoDaddy yearly renewal | — | keep **auto-renew on** | — |

Upgrading Render: service → **Settings → Instance type → Starter**. Same URL, code and database — nothing else changes, and the keep-awake ping is no longer needed.

---

## 15. Security checklist

- [ ] Change the app owner password in **Settings** after the first sign-in.
- [ ] Use a different `ADMIN_PASSWORD` and `SECRET_KEY` online than locally.
- [ ] Rotate any password, key or connection string that was ever shared in a chat, screenshot or commit.
- [ ] Supabase Data API off, or RLS enabled on every table.
- [ ] `.env`, `.venv`, `.aws`, `*.db` are not in the repository.
- [ ] Consider making the GitHub repository **private** (Settings → Danger Zone → Change visibility). Render and Cloudflare keep working.
- [ ] Turn on GoDaddy **auto-renew** for `manima.co.in`.
- [ ] Take regular database backups (section 12).

---

## 16. Alternative: one server with Docker

`docker-compose.yml` runs **all three parts on one rented server** (its own Postgres container, the backend, and Nginx serving the frontend). It is **not used** by the free Supabase + Render + Cloudflare setup above — the `manima` database name inside it refers only to that Docker Postgres.

Use it if you move to a VPS (AWS Lightsail, DigitalOcean, etc.):

```bash
git clone <repository URL> manima-hub && cd manima-hub
cp .env.example .env          # fill in your own values
docker compose up -d --build
```

Then put HTTPS in front (e.g. Caddy: `hub.manima.co.in { reverse_proxy 127.0.0.1:8080 }`), point the `hub` DNS record at the server's IP with an **A record**, and back up with `docker compose exec -T db pg_dump -U manima manima > backup.sql`.
