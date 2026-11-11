# Manima Client Hub

Manima's internal workspace for leads, clients, quotations, invoices, projects, college and corporate training, the team, and a client portal.

- **Backend:** FastAPI, SQLAlchemy 2, PostgreSQL (SQLite for local development), JWT login
- **Frontend:** React 18, TypeScript, Vite, and plain CSS in the final yellow / orange / pink / grey UI
- **Deploy:** Docker Compose (Postgres + API + Nginx serving the app)

## Run it with Docker (recommended)

```bash
cp .env.example .env        # then edit the passwords and SECRET_KEY
docker compose up -d --build
```

Open http://localhost:8080 and sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env`
(defaults: `business@manima.co.in` / `manima@123`). **Change the password in Settings after your first sign-in.**

`SEED_DEMO_DATA=true` loads sample clients, trainings and invoices on the first start so you can try everything.
To start with an empty workspace, set it to `false` **before** the first start (or run `docker compose down -v` to wipe the database and start again).

## Run it locally (development)

```bash
# terminal 1 — API on :8000 (uses SQLite file manima.db)
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload

# terminal 2 — app on :5173 (proxies /api to :8000)
cd frontend
npm install
npm run dev
```

API docs: http://localhost:8000/docs · Tests: `cd backend && pytest`

## What's inside

| Section       | What you can do                                                                                                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Dashboard     | Money collected this month, outstanding, active projects, open pipeline, training days left; revenue chart (services vs training); trainings in progress; recent quotations and invoices; upcoming meetings and training days; a "needs attention" list                                                                   |
| Leads         | Pipeline New → Contacted → Proposal sent → Won, deal value, source, follow-up date; "Mark won" creates the client                                                                                                                                                                                                      |
| Clients       | One profile per client with billed and outstanding totals, full history, quotations, invoices, projects, trainings, and a client portal link                                                                                                                                                                              |
| Quotations    | Your Manima quotation template with a live preview. Add any work, product or service (unit, qty, price, quoted on selection), GST excluded / added / none, discount, payment schedule with presets, editable terms with `{client}`, signature. Download PDF, mark sent, duplicate, convert to invoice, create a project |
| Invoices      | GST tax invoices (CGST + SGST split), part or full payments, overdue detection, PDF                                                                                                                                                                                                                                       |
| Projects      | Task boards with assignees, progress and status; created by hand or from a quotation                                                                                                                                                                                                                                      |
| Training      | Colleges and corporate: contact, programme, tools, day-by-day session plan, timing, trainees, pricing per student / per day / fixed. Proposal → Confirmed → Ongoing → Completed, "mark today's session taught", days left, payments, GST invoice for the balance                                                       |
| Team          | Members, roles, projects, money earned / paid / owed, record payouts, optional sign-in for team members                                                                                                                                                                                                                   |
| Settings      | Company details printed on documents, bank / UPI details, numbering (`MNM/{year}/001`, `INV-0001`), default GST, invoice due days, default terms, password                                                                                                                                                            |
| Client portal | `/portal/<secret link>`: the client sees project progress, views and signs quotations, and views and downloads invoices — no password needed; reset the link any time                                                                                                                                                  |

### PDFs

"Download PDF" opens a print-ready page (US Letter, like your template) and the browser's print window — choose **Save as PDF**. Terms & conditions start on page 2.

### Money rules

- A quotation's total uses only items that are not "quoted on selection", minus discount, plus GST only when GST mode is "added".
- Converting a quotation to an invoice always produces a GST invoice at the quotation's rate (unless GST mode is "none").
- Training fee = rate × students (per head), rate × days (per day), or the fixed fee. A payment on a training invoice is also recorded on the training.

### Going live checklist

1. Set strong `POSTGRES_PASSWORD`, `SECRET_KEY` and `ADMIN_PASSWORD` in `.env`.
2. Put the app behind HTTPS (for example Caddy or an Nginx reverse proxy with Let's Encrypt) and set `CORS_ORIGINS` to your domain.
3. Fill in Settings (bank / UPI details, numbering) before sending your first invoice.
4. Back up the `pgdata` volume (`docker compose exec db pg_dump -U manima manima > backup.sql`).
